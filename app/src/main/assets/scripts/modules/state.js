(function(exports){
  'use strict';

  /**********************
   * Storage & Migration
   **********************/
  const STORAGE_KEY = 'flag_football_touch_v9';
  const LEGACY_KEYS = ['flag_football_touch_v8','flag_football_touch_v7','flag_football_touch_v6','flag_football_touch_v5','flag_football_touch_v4'];
  const VIEW_MODE_KEY = 'flag_football_touch_view_mode';
  const REMOTE_CONFIG_KEY = 'flag_football_touch_remote_v1';

  // NOTE: As of v9, girlPlay now represents "plays until required girl play" on a 0-2 scale
  // 2 -> "2", 1 -> "1", 0 -> "Now". Previously (v8 and earlier) girlPlay was 1..3 rolling counter.

  function coerceMs(val){
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.floor(num);
  }

  function coerceSeconds(val){
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.floor(num);
  }

  function defaultState(){
    return {
      activeTeam: 0,
      teams: [
        { name: 'Home', score: 0, downs: 1, girlPlay: 2, rushes: 2, timeouts: 3 },
        { name: 'Away', score: 0, downs: 1, girlPlay: 2, rushes: 2, timeouts: 3 }
      ],
      game: { seconds: 25*60, running: false, startedAtMs: null, secondsAtStart: null },
      timeout: { running: false, secondsRemaining: 0, team: null, startedAtMs: null, secondsAtStart: null },
      halftime: { running: false, secondsRemaining: 0, startedAtMs: null, secondsAtStart: null }
    };
  }

  const VALUE_RULES = {
    score: { label: 'Score', min: 0, minMessage: 'Score must be 0 or higher', hint: 'Enter 0 or higher' },
    downs: { label: 'Down', min: 1, max: 4, minMessage: 'Down must be between 1 and 4', maxMessage: 'Down must be between 1 and 4', hint: 'Use values from 1-4' },
    girlPlay: { label: 'Girl Play In', min: 0, max: 2, minMessage: 'Girl Play In must be between 0 and 2', maxMessage: 'Girl Play In must be between 0 and 2', hint: '0 = Now, 2 = Two plays' },
    rushes: { label: 'Rushes', min: 0, minMessage: 'Rushes must be 0 or higher', hint: 'Enter 0 or higher' },
    timeouts: { label: 'Timeouts', min: 0, minMessage: 'Timeouts must be 0 or higher', hint: 'Enter 0 or higher' }
  };

  function migrateGirlPlay(oldVal){
    if (typeof oldVal !== 'number') return 2;
    if (oldVal <= 1) return 2;
    if (oldVal === 2) return 1;
    return 0;
  }

  function serializeState(s){
    const defaults = defaultState();
    const teamSource = Array.isArray(s.teams) && s.teams.length ? s.teams : defaults.teams;
    const game = s.game || {};
    const timeout = s.timeout || {};
    const halftime = s.halftime || {};
    const safe = {
      activeTeam: Math.max(0, Math.min(1, s.activeTeam != null ? s.activeTeam : 0)),
      teams: teamSource.map(t => ({
        name: t.name,
        score: t.score|0,
        downs: Math.min(4, Math.max(1, t.downs|0)) || 1,
        girlPlay: Math.min(2, Math.max(0, t.girlPlay|0)),
        rushes: Math.max(0, t.rushes|0),
        timeouts: Math.max(0, t.timeouts|0)
      })),
      game: {
        seconds: coerceSeconds(game.seconds != null ? game.seconds : defaults.game.seconds),
        running: !!game.running,
        startedAtMs: coerceMs(game.startedAtMs),
        secondsAtStart: game.secondsAtStart != null ? coerceSeconds(game.secondsAtStart) : null
      },
      timeout: {
        running: !!timeout.running,
        secondsRemaining: coerceSeconds(timeout.secondsRemaining),
        team: timeout.team == null ? null : Math.max(0, Math.min(1, timeout.team|0)),
        startedAtMs: coerceMs(timeout.startedAtMs),
        secondsAtStart: timeout.secondsAtStart != null ? coerceSeconds(timeout.secondsAtStart) : null
      },
      halftime: {
        running: !!halftime.running,
        secondsRemaining: coerceSeconds(halftime.secondsRemaining),
        startedAtMs: coerceMs(halftime.startedAtMs),
        secondsAtStart: halftime.secondsAtStart != null ? coerceSeconds(halftime.secondsAtStart) : null
      }
    };
    if (!safe.game.startedAtMs) safe.game.startedAtMs = null;
    if (!safe.game.secondsAtStart) safe.game.secondsAtStart = null;
    if (!safe.timeout.startedAtMs) safe.timeout.startedAtMs = null;
    if (!safe.timeout.secondsAtStart) safe.timeout.secondsAtStart = null;
    if (!safe.halftime.startedAtMs) safe.halftime.startedAtMs = null;
    if (!safe.halftime.secondsAtStart) safe.halftime.secondsAtStart = null;
    return safe;
  }

  function inflate(obj){
    const base = defaultState(); if (!obj) return base;
    try {
      const activeTeamRaw = obj.activeTeam != null ? obj.activeTeam : (obj.a != null ? obj.a : 0);
      const fallbackTeams = base.teams;
      const teamsSource = Array.isArray(obj.teams) && obj.teams.length
        ? obj.teams
        : (Array.isArray(obj.t) && obj.t.length ? obj.t : fallbackTeams);
      base.teams = teamsSource.map((t,i)=>{
        const prev = fallbackTeams[i] || {};
        const gp = (t.girlPlay == null) ? prev.girlPlay : t.girlPlay;
        const girlV9 = (gp>=0 && gp<=2) ? gp : migrateGirlPlay(gp);
        return {
          name: t.name != null ? t.name : (t.n != null ? t.n : (prev.name != null ? prev.name : 'Team')),
          score: t.score != null ? t.score : (t.s != null ? t.s : 0),
          downs: t.downs != null ? t.downs : (t.d != null ? t.d : 1),
          girlPlay: girlV9,
          rushes: t.rushes != null ? t.rushes : (t.r != null ? t.r : 2),
          timeouts: t.timeouts != null ? t.timeouts : (t.o != null ? t.o : 3)
        };
      });
      const teamsLength = base.teams.length || fallbackTeams.length;
      const activeTeamNum = Number(activeTeamRaw);
      const normalizedActiveTeam = Number.isFinite(activeTeamNum)
        ? Math.max(0, Math.min(teamsLength > 0 ? teamsLength - 1 : 0, Math.floor(activeTeamNum)))
        : 0;
      base.activeTeam = normalizedActiveTeam;
      const g = obj.game != null ? obj.game : (obj.g != null ? obj.g : {});
      const secondsSource = g.seconds != null ? g.seconds : (g.s != null ? g.s : defaultState().game.seconds);
      base.game.seconds = coerceSeconds(secondsSource);
      base.game.running = !!g.running;
      base.game.startedAtMs = coerceMs(g.startedAtMs != null ? g.startedAtMs : g.startedAt);
      if (g.secondsAtStart != null) {
        base.game.secondsAtStart = coerceSeconds(g.secondsAtStart);
      } else if (base.game.startedAtMs != null && base.game.running) {
        base.game.secondsAtStart = base.game.seconds;
      } else {
        base.game.secondsAtStart = null;
      }
      if (!base.game.startedAtMs || !base.game.running) {
        if (!base.game.running) {
          base.game.startedAtMs = null;
          base.game.secondsAtStart = null;
        }
        if (base.game.running && base.game.startedAtMs == null) {
          base.game.running = false;
        }
      }

      const legacyTimeoutSeconds = g.timeoutSecondsRemaining != null ? g.timeoutSecondsRemaining : (g.tr != null ? g.tr : 0);
      const timeoutObjRaw = obj.timeout != null ? obj.timeout : (obj.to != null ? obj.to : {});
      const timeoutSecondsRaw = timeoutObjRaw.secondsRemaining != null ? timeoutObjRaw.secondsRemaining : (timeoutObjRaw.sr != null ? timeoutObjRaw.sr : legacyTimeoutSeconds);
      base.timeout.secondsRemaining = coerceSeconds(timeoutSecondsRaw);
      const timeoutRunningRaw = timeoutObjRaw.running != null ? timeoutObjRaw.running : timeoutObjRaw.r;
      base.timeout.running = !!timeoutRunningRaw;
      const timeoutStartedRaw = timeoutObjRaw.startedAtMs != null ? timeoutObjRaw.startedAtMs : timeoutObjRaw.ms;
      base.timeout.startedAtMs = coerceMs(timeoutStartedRaw);
      const timeoutSecondsAtStartRaw = timeoutObjRaw.secondsAtStart != null ? timeoutObjRaw.secondsAtStart : timeoutObjRaw.sa;
      if (timeoutSecondsAtStartRaw != null) {
        base.timeout.secondsAtStart = coerceSeconds(timeoutSecondsAtStartRaw);
      } else if (base.timeout.startedAtMs != null && base.timeout.running) {
        base.timeout.secondsAtStart = Math.max(base.timeout.secondsRemaining, 0);
      } else {
        base.timeout.secondsAtStart = null;
      }
      const timeoutTeamVal = timeoutObjRaw.team != null ? timeoutObjRaw.team : (timeoutObjRaw.tm != null ? timeoutObjRaw.tm : (g.timeoutTeam != null ? g.timeoutTeam : null));
      if (timeoutTeamVal == null) base.timeout.team = null;
      else base.timeout.team = Math.max(0, Math.min(1, timeoutTeamVal|0));
      if (!base.timeout.startedAtMs || !base.timeout.running) {
        if (!base.timeout.running) {
          base.timeout.startedAtMs = null;
          base.timeout.secondsAtStart = null;
        }
        if (base.timeout.running && base.timeout.startedAtMs == null) {
          base.timeout.running = false;
        }
      }

      const legacyHalftimeSeconds = g.halftimeSecondsRemaining != null ? g.halftimeSecondsRemaining : (g.hr != null ? g.hr : 0);
      const halftimeObjRaw = obj.halftime != null ? obj.halftime : (obj.h != null ? obj.h : {});
      const halftimeSecondsRaw = halftimeObjRaw.secondsRemaining != null ? halftimeObjRaw.secondsRemaining : (halftimeObjRaw.sr != null ? halftimeObjRaw.sr : legacyHalftimeSeconds);
      base.halftime.secondsRemaining = coerceSeconds(halftimeSecondsRaw);
      const halftimeRunningRaw = halftimeObjRaw.running != null ? halftimeObjRaw.running : halftimeObjRaw.r;
      base.halftime.running = !!halftimeRunningRaw;
      const halftimeStartedRaw = halftimeObjRaw.startedAtMs != null ? halftimeObjRaw.startedAtMs : halftimeObjRaw.ms;
      base.halftime.startedAtMs = coerceMs(halftimeStartedRaw);
      const halftimeSecondsAtStartRaw = halftimeObjRaw.secondsAtStart != null ? halftimeObjRaw.secondsAtStart : halftimeObjRaw.sa;
      if (halftimeSecondsAtStartRaw != null) {
        base.halftime.secondsAtStart = coerceSeconds(halftimeSecondsAtStartRaw);
      } else if (base.halftime.startedAtMs != null && base.halftime.running) {
        base.halftime.secondsAtStart = Math.max(base.halftime.secondsRemaining, 0);
      } else {
        base.halftime.secondsAtStart = null;
      }
      if (!base.halftime.startedAtMs || !base.halftime.running) {
        if (!base.halftime.running) {
          base.halftime.startedAtMs = null;
          base.halftime.secondsAtStart = null;
        }
        if (base.halftime.running && base.halftime.startedAtMs == null) {
          base.halftime.running = false;
        }
      }
    } catch {}
    return base;
  }

  function loadMigrated(){
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return inflate(JSON.parse(raw)); } catch {}
    for (const k of LEGACY_KEYS){
      try {
        const raw = localStorage.getItem(k); if (!raw) continue;
        const migrated = inflate(JSON.parse(raw));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(migrated)));
        try { localStorage.removeItem(k); } catch {}
        return migrated;
      } catch {}
    }
    return null;
  }

  function loadViewMode(){
    try {
      const raw = localStorage.getItem(VIEW_MODE_KEY);
      if (raw === 'ref') return 'ref';
      if (raw === 'player' || raw === 'scoreboard') return 'player';
    } catch {}
    return 'ref';
  }

  function saveViewMode(mode){
    const persist = mode === 'player' ? 'scoreboard' : 'ref';
    try { localStorage.setItem(VIEW_MODE_KEY, persist); } catch {}
  }

  function saveRemoteConfig(cfg){ try { localStorage.setItem(REMOTE_CONFIG_KEY, JSON.stringify({ game: cfg.game, lastKnown: cfg.lastKnown || null })); } catch {} }
  function loadRemoteConfig(){
    try {
      const raw = localStorage.getItem(REMOTE_CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.game) return null;
      return { game: parsed.game, lastKnown: parsed.lastKnown || null };
    } catch {}
    return null;
  }
  function clearRemoteConfig(){ try { localStorage.removeItem(REMOTE_CONFIG_KEY); } catch {} }

  function safeSave(state){
    const payload = JSON.stringify(serializeState(state));
    try { localStorage.setItem(STORAGE_KEY, payload); }
    catch(e){
      try {
        const tiny = JSON.stringify({
          a: state.activeTeam,
          t: state.teams.map(t=>({n:t.name, s:t.score|0, d:t.downs|0, g:Math.min(2,Math.max(0,t.girlPlay|0)), r:t.rushes|0, o:t.timeouts|0})),
          g: {
            s: state.game.seconds|0,
            r: !!state.game.running,
            sa: state.game.secondsAtStart != null ? coerceSeconds(state.game.secondsAtStart) : null,
            ms: state.game.startedAtMs != null ? coerceMs(state.game.startedAtMs) : null
          },
          to: {
            r: !!state.timeout.running,
            sr: state.timeout.secondsRemaining|0,
            sa: state.timeout.secondsAtStart != null ? coerceSeconds(state.timeout.secondsAtStart) : null,
            ms: state.timeout.startedAtMs != null ? coerceMs(state.timeout.startedAtMs) : null,
            tm: state.timeout.team == null ? null : Math.max(0, Math.min(1, state.timeout.team|0))
          },
          h: {
            r: !!state.halftime.running,
            sr: state.halftime.secondsRemaining|0,
            sa: state.halftime.secondsAtStart != null ? coerceSeconds(state.halftime.secondsAtStart) : null,
            ms: state.halftime.startedAtMs != null ? coerceMs(state.halftime.startedAtMs) : null
          }
        });
        localStorage.setItem(STORAGE_KEY, tiny);
      } catch(e2){ try{ localStorage.removeItem(STORAGE_KEY);}catch{} }
    }
  }
  let saveTimer=null;
  function scheduleSave(state){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=> safeSave(state), 400);
  }

  function secondsKeyForCountdown(countdown){
    if (!countdown) return 'seconds';
    return Object.prototype.hasOwnProperty.call(countdown, 'secondsRemaining') ? 'secondsRemaining' : 'seconds';
  }

  function reconcileCountdown(nowMs, countdown){
    if (!countdown || !countdown.running) return false;
    let changed = false;
    const startedAt = coerceMs(countdown.startedAtMs);
    if (!startedAt) {
      if (countdown.startedAtMs != null) { countdown.startedAtMs = null; changed = true; }
      if (countdown.secondsAtStart != null) { countdown.secondsAtStart = null; changed = true; }
      if (countdown.running) { countdown.running = false; changed = true; }
      return changed;
    }

    if (countdown.startedAtMs !== startedAt) { countdown.startedAtMs = startedAt; changed = true; }

    const secondsKey = secondsKeyForCountdown(countdown);
    const currentSeconds = coerceSeconds(countdown[secondsKey]);
    if (countdown[secondsKey] !== currentSeconds) { countdown[secondsKey] = currentSeconds; changed = true; }

    let startSeconds = countdown.secondsAtStart != null ? coerceSeconds(countdown.secondsAtStart) : null;
    if (startSeconds == null) {
      startSeconds = currentSeconds;
      if (countdown.secondsAtStart !== startSeconds) { countdown.secondsAtStart = startSeconds; changed = true; }
    } else if (countdown.secondsAtStart !== startSeconds) {
      countdown.secondsAtStart = startSeconds;
      changed = true;
    }

    const elapsed = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
    const remaining = Math.max(0, startSeconds - elapsed);
    if (countdown[secondsKey] !== remaining) { countdown[secondsKey] = remaining; changed = true; }

    if (remaining === 0) {
      if (countdown.running) { countdown.running = false; changed = true; }
      if (countdown.startedAtMs != null) { countdown.startedAtMs = null; changed = true; }
      if (countdown.secondsAtStart != null) { countdown.secondsAtStart = null; changed = true; }
    }

    return changed;
  }

  function reconcileAllState(nowMs, state){
    let changed = false;
    if (reconcileCountdown(nowMs, state.game)) changed = true;
    if (reconcileCountdown(nowMs, state.timeout)) changed = true;
    if (reconcileCountdown(nowMs, state.halftime)) changed = true;

    if (state) {
      const timeoutKey = secondsKeyForCountdown(state.timeout);
      if (!state.timeout.running && coerceSeconds(state.timeout[timeoutKey]) === 0) {
        if (state.timeout[timeoutKey] !== 0) { state.timeout[timeoutKey] = 0; changed = true; }
        if (state.timeout.team != null) { state.timeout.team = null; changed = true; }
        if (state.timeout.startedAtMs != null) { state.timeout.startedAtMs = null; changed = true; }
        if (state.timeout.secondsAtStart != null) { state.timeout.secondsAtStart = null; changed = true; }
      }

      const halftimeKey = secondsKeyForCountdown(state.halftime);
      const halftimeSeconds = coerceSeconds(state.halftime[halftimeKey]);
      if (state.halftime[halftimeKey] !== halftimeSeconds) { state.halftime[halftimeKey] = halftimeSeconds; changed = true; }
      if (!state.halftime.running && halftimeSeconds === 0) {
        if (state.halftime.startedAtMs != null) { state.halftime.startedAtMs = null; changed = true; }
        if (state.halftime.secondsAtStart != null) { state.halftime.secondsAtStart = null; changed = true; }
      }
    }

    return changed;
  }

  function requestPersist(){
    scheduleSave(exports.state);
    if (typeof exports.scheduleRemotePush === 'function') {
      exports.scheduleRemotePush();
    }
  }

  function renderAndPersist(){
    if (typeof exports.render === 'function') {
      exports.render();
    }
    requestPersist();
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  exports.STORAGE_KEY = STORAGE_KEY;
  exports.LEGACY_KEYS = LEGACY_KEYS;
  exports.VIEW_MODE_KEY = VIEW_MODE_KEY;
  exports.REMOTE_CONFIG_KEY = REMOTE_CONFIG_KEY;
  exports.coerceMs = coerceMs;
  exports.coerceSeconds = coerceSeconds;
  exports.defaultState = defaultState;
  exports.VALUE_RULES = VALUE_RULES;
  exports.migrateGirlPlay = migrateGirlPlay;
  exports.serializeState = serializeState;
  exports.inflate = inflate;
  exports.loadMigrated = loadMigrated;
  exports.loadViewMode = loadViewMode;
  exports.saveViewMode = saveViewMode;
  exports.saveRemoteConfig = saveRemoteConfig;
  exports.loadRemoteConfig = loadRemoteConfig;
  exports.clearRemoteConfig = clearRemoteConfig;
  exports.scheduleSave = scheduleSave;
  exports.secondsKeyForCountdown = secondsKeyForCountdown;
  exports.reconcileCountdown = reconcileCountdown;
  exports.reconcileAllState = reconcileAllState;
  exports.requestPersist = requestPersist;
  exports.renderAndPersist = renderAndPersist;
  exports.$ = $;
  exports.$$ = $$;

  exports.state = loadMigrated() || defaultState();
  reconcileAllState(Date.now(), exports.state);

  exports.viewMode = loadViewMode();
  exports.currentPage = 'game';
  exports.uiTickTimer = null;
  exports.activeValueEditor = null;
  exports.playerOrientationLocked = false;
  exports.render = exports.render || function(){};

  function lockPlayerOrientation(){
    const screenObj = window.screen;
    if (!screenObj) return;
    const orientation = screenObj.orientation;
    if (orientation && typeof orientation.lock === 'function'){
      exports.playerOrientationLocked = true;
      orientation.lock('landscape').then(()=>{
        exports.playerOrientationLocked = true;
      }).catch(()=>{
        exports.playerOrientationLocked = false;
      });
      return;
    }
    const legacyLock = screenObj.lockOrientation || screenObj.mozLockOrientation || screenObj.msLockOrientation;
    if (typeof legacyLock === 'function'){
      try {
        exports.playerOrientationLocked = legacyLock.call(screenObj, 'landscape');
      } catch {
        exports.playerOrientationLocked = false;
      }
    }
  }

  function unlockPlayerOrientation(){
    const screenObj = window.screen;
    if (!screenObj) return;
    const orientation = screenObj.orientation;
    if (orientation && typeof orientation.unlock === 'function'){
      try {
        orientation.unlock();
      } catch {}
    }
    const legacyUnlock = screenObj.unlockOrientation || screenObj.mozUnlockOrientation || screenObj.msUnlockOrientation;
    if (typeof legacyUnlock === 'function'){
      try { legacyUnlock.call(screenObj); } catch {}
    }
    exports.playerOrientationLocked = false;
  }

  exports.lockPlayerOrientation = lockPlayerOrientation;
  exports.unlockPlayerOrientation = unlockPlayerOrientation;
  exports.reconcileAll = function(nowMs){
    return reconcileAllState(nowMs, exports.state);
  };

})(window.App = window.App || {});
