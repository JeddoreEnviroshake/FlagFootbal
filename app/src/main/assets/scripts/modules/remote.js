(function(exports){
  'use strict';

  const remoteSync = {
    config: null,
    source: null,
    status: 'idle',
    lastError: null,
    pushTimer: null,
    lastPushedAt: 0,
    applying: false,
    connected: false,
    pushing: false,
    pendingPush: false,
    useTransactions: true,
    canWrite: false
  };

  let auth = null;
  let db = null;
  if (window.__firebaseReady && window.firebase) {
    try {
      auth = firebase.auth();
      db   = firebase.database();
    } catch (err) {
      console.warn('Firebase SDK init failed', err);
    }
  } else {
    console.warn('Firebase SDK not available; running local-only.');
  }

  remoteSync.config = exports.loadRemoteConfig();

  function serverTimestamp(){
    if (window.firebase && firebase.database && firebase.database.ServerValue && firebase.database.ServerValue.TIMESTAMP != null) {
      return firebase.database.ServerValue.TIMESTAMP;
    }
    return Date.now();
  }

  function requireAuth(){
    if (!auth) {
      throw new Error('Firebase auth unavailable');
    }
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }
    if (user.isAnonymous) {
      throw new Error('Anonymous users cannot write data');
    }
    return user;
  }

  function createWriterMeta(user, options = {}){
    if (!user || typeof user !== 'object') return {};
    const opts = options || {};
    const timestamp = serverTimestamp();
    const meta = {
      writerUid: user.uid,
      writerEmail: user.email || null,
      writerDisplayName: user.displayName || null,
      updatedAt: timestamp
    };
    if (opts.includeCreatedAt) {
      meta.createdAt = timestamp;
    }
    return meta;
  }

  function recordWriterMeta(gameId, user){
    if (!db || !gameId || !user) return Promise.resolve();
    const timestamp = serverTimestamp();
    const updates = {
      [`games/${gameId}/meta/updatedAt`]: timestamp,
      [`games/${gameId}/meta/writerUid`]: user.uid,
      [`games/${gameId}/meta/writerEmail`]: user.email || null,
      [`games/${gameId}/meta/writerDisplayName`]: user.displayName || null,
      [`games/${gameId}/meta/writers/${user.uid}`]: true
    };
    try {
      return db.ref().update(updates);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function remoteConfigured(){ return !!(remoteSync.config && remoteSync.config.game); }

  function requireConfiguredGame(){
    const game = remoteSync.config && remoteSync.config.game ? remoteSync.config.game : null;
    if (!game) {
      remoteSync.status = 'error';
      remoteSync.lastError = 'Game configuration missing';
      updateRemoteStatus();
    }
    return game;
  }

  function updateRemoteStatus(){
    const el = exports.$ ? exports.$('#syncStatus') : null;
    if (!el) return;
    if (!remoteConfigured()){ el.textContent = 'Offline'; return; }
    if (remoteSync.status === 'connecting') el.textContent = `Connecting to ${remoteSync.config.game}…`;
    else if (remoteSync.status === 'connected'){
      el.textContent = `Connected • ${remoteSync.config.game} • ${remoteSync.canWrite ? 'Ref (writer)' : 'Viewer'}`;
    } else if (remoteSync.status === 'error'){
      const msg = remoteSync.lastError && (remoteSync.lastError.message || String(remoteSync.lastError));
      el.textContent = `Sync error — ${msg || 'check connection or rules'}`;
    } else {
      el.textContent = 'Ready to connect';
    }
  }

  function populateSyncForm(){
    const form = exports.$ ? exports.$('#syncForm') : null;
    if (!form) return;
    const cfg = remoteSync.config || {};
    if (form.game) form.game.value = cfg.game || '';
  }

  let lastPushMs = 0;
  function scheduleRemotePush(){
    if (remoteSync.useTransactions) return;
    if (!db || !auth) return;
    if (!remoteConfigured() || exports.viewMode !== 'ref' || remoteSync.applying || !remoteSync.canWrite) return;
    const now = Date.now();
    const state = exports.state;
    const ticking = state.game.running || state.timeout.running || state.halftime.running;
    const minGap = ticking ? 2500 : 250;

    if (now - lastPushMs < minGap) {
      remoteSync.pendingPush = true;
      if (!remoteSync.pushTimer) {
        remoteSync.pushTimer = setTimeout(()=>{ remoteSync.pushTimer=null; pushRemoteNow(); }, minGap - (now - lastPushMs));
      }
      return;
    }
    if (remoteSync.pushTimer) clearTimeout(remoteSync.pushTimer);
    remoteSync.pushTimer = setTimeout(()=>{ remoteSync.pushTimer=null; pushRemoteNow(); }, ticking ? 400 : 200);
  }

  function pushRemoteNow(){
    if (!db || !auth) return;
    if (!remoteConfigured() || !remoteSync.canWrite) return;
    const gameId = requireConfiguredGame();
    if (!gameId) return;
    remoteSync.pushing = true;

    let user;
    try {
      user = requireAuth();
    } catch (err) {
      remoteSync.status = 'error';
      remoteSync.lastError = err;
      remoteSync.connected = false;
      remoteSync.pushing = false;
      updateRemoteStatus();
      return;
    }

    const gameRef = db.ref(`games/${gameId}`);
    const serializedState = exports.serializeState(exports.state);
    const updates = {
      state: serializedState,
      'meta/updatedAt': serverTimestamp(),
      'meta/writerUid': user.uid,
      'meta/writerEmail': user.email || null,
      'meta/writerDisplayName': user.displayName || null
    };
    updates[`meta/writers/${user.uid}`] = true;

    gameRef.update(updates)
      .then(()=>{ remoteSync.status='connected'; remoteSync.connected=true; remoteSync.lastError=null; lastPushMs=Date.now(); })
      .catch(err=>{ remoteSync.status='error'; remoteSync.connected=false; remoteSync.lastError=String(err && err.message ? err.message : err); })
      .finally(()=>{
        remoteSync.pushing=false;
        if (remoteSync.pendingPush){ remoteSync.pendingPush=false; pushRemoteNow(); }
        updateRemoteStatus();
      });
  }

  function handleRemotePayload(raw){
    if (!raw) return;
    const body = raw.state != null ? raw.state : raw;
    if (!body) return;
    remoteSync.applying = true;
    try {
      exports.state = exports.inflate(body);
      if (typeof exports.render === 'function') {
        exports.render();
      }
    } finally {
      remoteSync.applying = false;
    }
  }

  function disconnectRemote(){
    if (remoteSync.source){ try { remoteSync.source.off(); } catch {} }
    remoteSync.source = null;
    remoteSync.connected = false;
    if (remoteSync.pushTimer){ clearTimeout(remoteSync.pushTimer); remoteSync.pushTimer=null; }
    remoteSync.pendingPush = false;
    updateRemoteStatus();
  }

  async function isCurrentUserWriter(game) {
    const user = auth && auth.currentUser ? auth.currentUser : null;
    const uid = (user && !user.isAnonymous) ? user.uid : null;
    if (!uid) return false;
    try {
      const snap = await db.ref(`games/${game}/meta/writers/${uid}`).get();
      return snap.val() === true;
    } catch {
      return false;
    }
  }

  async function joinWriters(game) {
    let user;
    try {
      user = requireAuth();
    } catch (err) {
      return Promise.reject(err);
    }
    const updates = {};
    updates[`games/${game}/meta/writers/${user.uid}`] = true;
    updates[`games/${game}/meta/writerUid`] = user.uid;
    updates[`games/${game}/meta/writerEmail`] = user.email || null;
    updates[`games/${game}/meta/writerDisplayName`] = user.displayName || null;
    updates[`games/${game}/meta/updatedAt`] = serverTimestamp();
    await db.ref().update(updates);
    return true;
  }

  async function leaveWriters(game) {
    const uid = (auth && auth.currentUser && !auth.currentUser.isAnonymous) ? auth.currentUser.uid : null;
    if (!uid) return;
    await db.ref(`games/${game}/meta/writers/${uid}`).set(null);
  }

  function isOnlineWriter(){
    return remoteConfigured() && remoteSync.canWrite && db && auth && auth.currentUser;
  }

  function txnField(path, mutateFn) {
    const gameId = requireConfiguredGame();
    if (!gameId) return Promise.reject(new Error('No game configured'));
    let user;
    try {
      user = requireAuth();
    } catch (err) {
      return Promise.reject(err);
    }
    const ref = db.ref(`games/${gameId}/state/${path}`);
    return ref.transaction(curr => mutateFn(curr))
      .then(result => {
        if (result && result.committed) {
          return recordWriterMeta(gameId, user).then(() => result);
        }
        return result;
      });
  }

  function txnState(mutateFn){
    const gameId = requireConfiguredGame();
    if (!gameId) return Promise.reject(new Error('No game configured'));
    let user;
    try {
      user = requireAuth();
    } catch (err) {
      return Promise.reject(err);
    }
    const ref = db.ref(`games/${gameId}/state`);
    return ref.transaction(s => {
      const working = exports.inflate(s);
      const result = mutateFn(working);
      const nextState = (result && typeof result === 'object') ? result : working;
      return exports.serializeState(nextState);
    })
    .then(res => {
      console.log('[txnState] committed:', res.committed);
      if (res && res.committed) {
        return recordWriterMeta(gameId, user).then(() => res);
      }
      return res;
    })
    .catch(e => { console.warn('[txnState:err]', e); throw e; });
  }

  async function seedStateIfMissing(game){
    if (!remoteSync.canWrite) return;
    let user;
    try {
      user = requireAuth();
    } catch (err) {
      console.warn('[sync] seedStateIfMissing skipped due to auth error', err);
      return;
    }
    const ref = db.ref(`games/${game}/state`);
    const hasSerializer = exports && typeof exports.serializeState === 'function';
    const getDefaultState = () => (exports && typeof exports.defaultState === 'function')
      ? exports.defaultState()
      : null;
    const currentState = exports && exports.state ? exports.state : null;
    const localSeed = hasSerializer
      ? exports.serializeState(currentState || getDefaultState() || {})
      : null;
    const result = await ref.transaction(s => {
      if (s) return s;
      if (localSeed) return localSeed;
      const fallbackSource = getDefaultState();
      const fallback = hasSerializer && fallbackSource
        ? exports.serializeState(fallbackSource)
        : null;
      return fallback || null;
    });
    if (result && result.committed) {
      try {
        await recordWriterMeta(game, user);
      } catch (err) {
        console.warn('[sync] failed to record writer meta for seeded state', err);
      }
    }
  }

  async function connectRemote(){
    disconnectRemote();

    if (!remoteConfigured()){
      remoteSync.status = 'idle';
      updateRemoteStatus();
      return;
    }
    if (!db || !auth){
      remoteSync.status = 'error';
      remoteSync.lastError = 'Firebase SDK not ready';
      updateRemoteStatus();
      return;
    }

    remoteSync.status = 'connecting';
    updateRemoteStatus();

    const game = requireConfiguredGame();
    if (!game) return;
    const currentUser = auth.currentUser;
    if (currentUser && !currentUser.isAnonymous) {
      try {
        await joinWriters(game);
      } catch (err) {
        console.warn('[sync] writer join failed, continuing as viewer', err);
      }

      try {
        remoteSync.canWrite = await isCurrentUserWriter(game);
      } catch {
        remoteSync.canWrite = false;
      }
    } else {
      remoteSync.canWrite = false;
      if (!currentUser) {
        remoteSync.lastError = 'Sign in with Google to write data';
      } else if (currentUser.isAnonymous) {
        remoteSync.lastError = 'Anonymous users cannot write data';
      }
    }

    if (typeof exports.syncTimersWithState === 'function') {
      exports.syncTimersWithState();
    }

    try {
      if (remoteSync.canWrite) {
        await seedStateIfMissing(game);
      }
    } catch (err) {
      console.warn('[sync] seedStateIfMissing failed', err);
    }

    const gameRef = db.ref(`games/${game}`);
    const handler = gameRef.on('value', (snap) => {
      const data = snap.val();
      if (data && data.state) handleRemotePayload(data);
      remoteSync.connected = true;
      remoteSync.status = 'connected';
      updateRemoteStatus();
    });
    remoteSync.source = { off: () => gameRef.off('value', handler) };

    updateRemoteStatus();
  }

  exports.remoteSync = remoteSync;
  exports.auth = auth;
  exports.db = db;

  let profileListenerCleanup = null;
  if (auth && typeof auth.onAuthStateChanged === 'function') {
    auth.onAuthStateChanged((currentUser) => {
      if (profileListenerCleanup) {
        try { profileListenerCleanup(); } catch {}
        profileListenerCleanup = null;
      }

      if (typeof exports.hydrateProfileFromUser !== 'function') {
        return;
      }

      if (!currentUser || currentUser.isAnonymous) {
        exports.hydrateProfileFromUser(null);
        return;
      }

      const teardown = exports.hydrateProfileFromUser(currentUser.uid);
      if (typeof teardown === 'function') {
        profileListenerCleanup = teardown;
      }
    });
  }

  exports.remoteConfigured = remoteConfigured;
  exports.requireConfiguredGame = requireConfiguredGame;
  exports.updateRemoteStatus = updateRemoteStatus;
  exports.populateSyncForm = populateSyncForm;
  exports.scheduleRemotePush = scheduleRemotePush;
  exports.pushRemoteNow = pushRemoteNow;
  exports.handleRemotePayload = handleRemotePayload;
  exports.disconnectRemote = disconnectRemote;
  exports.isOnlineWriter = isOnlineWriter;
  exports.txnField = txnField;
  exports.txnState = txnState;
  exports.seedStateIfMissing = seedStateIfMissing;
  exports.connectRemote = connectRemote;
  exports.isCurrentUserWriter = isCurrentUserWriter;
  exports.joinWriters = joinWriters;
  exports.leaveWriters = leaveWriters;
  exports.requireAuth = requireAuth;
  exports.serverTimestamp = serverTimestamp;
  exports.createWriterMeta = createWriterMeta;
  exports.recordWriterMeta = recordWriterMeta;

})(window.App = window.App || {});
