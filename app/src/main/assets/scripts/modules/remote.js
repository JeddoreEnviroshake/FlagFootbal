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

    const gameRef = db.ref(`games/${gameId}`);
    const payload = { state: exports.serializeState(exports.state), updatedAt: firebase.database.ServerValue.TIMESTAMP };

    gameRef.update(payload)
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
    const uid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    if (!uid) return false;
    try {
      const snap = await db.ref(`games/${game}/meta/writers/${uid}`).get();
      return snap.val() === true;
    } catch {
      return false;
    }
  }

  async function joinWriters(game) {
    const uid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    if (!uid) return false;
    await db.ref(`games/${game}/meta/writers/${uid}`).set(true);
    return true;
  }

  async function leaveWriters(game) {
    const uid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    if (!uid) return;
    await db.ref(`games/${game}/meta/writers/${uid}`).set(null);
  }

  function isOnlineWriter(){
    return remoteConfigured() && remoteSync.canWrite && db && auth && auth.currentUser;
  }

  function txnField(path, mutateFn) {
    const gameId = requireConfiguredGame();
    if (!gameId) return Promise.reject(new Error('No game configured'));
    const ref = db.ref(`games/${gameId}/state/${path}`);
    return ref.transaction(curr => mutateFn(curr));
  }

  function txnState(mutateFn){
    const gameId = requireConfiguredGame();
    if (!gameId) return Promise.reject(new Error('No game configured'));
    const ref = db.ref(`games/${gameId}/state`);
    return ref.transaction(s => {
      const working = exports.inflate(s);
      const result = mutateFn(working);
      const nextState = (result && typeof result === 'object') ? result : working;
      return exports.serializeState(nextState);
    })
    .then(res => { console.log('[txnState] committed:', res.committed); return res; })
    .catch(e => { console.warn('[txnState:err]', e); throw e; });
  }

  async function seedStateIfMissing(game){
    if (!remoteSync.canWrite) return;
    const ref = db.ref(`games/${game}/state`);
    const hasSerializer = exports && typeof exports.serializeState === 'function';
    const getDefaultState = () => (exports && typeof exports.defaultState === 'function')
      ? exports.defaultState()
      : null;
    const currentState = exports && exports.state ? exports.state : null;
    const localSeed = hasSerializer
      ? exports.serializeState(currentState || getDefaultState() || {})
      : null;
    await ref.transaction(s => {
      if (s) return s;
      if (localSeed) return localSeed;
      const fallbackSource = getDefaultState();
      const fallback = hasSerializer && fallbackSource
        ? exports.serializeState(fallbackSource)
        : null;
      return fallback || null;
    });
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

    try {
      if (!auth.currentUser) await auth.signInAnonymously();
    } catch (err) {
      remoteSync.status = 'error';
      remoteSync.lastError = err;
      updateRemoteStatus();
      return;
    }

    const game = requireConfiguredGame();
    if (!game) return;
    try {
      await joinWriters(game);
    } catch (err) {
      console.warn('[sync] writer join/leave failed, continuing as viewer', err);
    }

    try {
      remoteSync.canWrite = await isCurrentUserWriter(game);
    } catch {
      remoteSync.canWrite = false;
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

})(window.App = window.App || {});
