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
      girlPlay: Math.min(2, Math.max(0, t.girlPlay|0)), // clamp to 0..2
      rushes: Math.max(0, t.rushes|0),
      timeouts: Math.max(0, t.timeouts|0)
    })),
    game: {
      seconds: coerceSeconds(game.seconds != null ? game.seconds : defaults.game.seconds),
      running: !!game.running,
<<<<<<< Updated upstream
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
=======
      timeoutSecondsRemaining: Math.max(0, game.timeoutSecondsRemaining|0),
      timeoutTeam: game.timeoutTeam == null ? null : game.timeoutTeam,
      halftimeSecondsRemaining: Math.max(0, game.halftimeSecondsRemaining|0),
      // NEW: persist absolute target end time when running
      targetEndAt: Number.isFinite(game.targetEndAt) ? game.targetEndAt : 0
>>>>>>> Stashed changes
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

function safeSave(){
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
let saveTimer=null; function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(safeSave, 400); }

function requestPersist(){
  scheduleSave();
  scheduleRemotePush();
}

function renderAndPersist(){
  render();
  requestPersist();
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

function reconcileAll(nowMs){
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

/**********************
 * App State
 **********************/
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const defaultState = () => ({
  activeTeam: 0,
  teams: [
    { name: 'Home', score: 0, downs: 1, girlPlay: 2, rushes: 2, timeouts: 3 }, // start at 2 plays until girl
    { name: 'Away', score: 0, downs: 1, girlPlay: 2, rushes: 2, timeouts: 3 }
  ],
<<<<<<< Updated upstream
  game: { seconds: 25*60, running: false, startedAtMs: null, secondsAtStart: null },
  timeout: { running: false, secondsRemaining: 0, team: null, startedAtMs: null, secondsAtStart: null },
  halftime: { running: false, secondsRemaining: 0, startedAtMs: null, secondsAtStart: null }
=======
  game: { seconds: 25*60, running: false, timeoutSecondsRemaining: 0, timeoutTeam: null, halftimeSecondsRemaining: 0, targetEndAt: 0 }
>>>>>>> Stashed changes
});

const VALUE_RULES = {
  score: { label: 'Score', min: 0, minMessage: 'Score must be 0 or higher', hint: 'Enter 0 or higher' },
  downs: { label: 'Down', min: 1, max: 4, minMessage: 'Down must be between 1 and 4', maxMessage: 'Down must be between 1 and 4', hint: 'Use values from 1-4' },
  girlPlay: { label: 'Girl Play In', min: 0, max: 2, minMessage: 'Girl Play In must be between 0 and 2', maxMessage: 'Girl Play In must be between 0 and 2', hint: '0 = Now, 2 = Two plays' },
  rushes: { label: 'Rushes', min: 0, minMessage: 'Rushes must be 0 or higher', hint: 'Enter 0 or higher' },
  timeouts: { label: 'Timeouts', min: 0, minMessage: 'Timeouts must be 0 or higher', hint: 'Enter 0 or higher' }
};

function migrateGirlPlay(oldVal){
  // v8 style (1..3 rolling) -> v9 remaining (2..0)
  // Map: 1 -> 2, 2 -> 1, 3 -> 0
  if (typeof oldVal !== 'number') return 2;
  if (oldVal <= 1) return 2;
  if (oldVal === 2) return 1;
  return 0; // 3 or higher
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
      // Accept both schemas for girlPlay
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
<<<<<<< Updated upstream
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
=======
    const timeoutSeconds = g.timeoutSecondsRemaining != null ? g.timeoutSecondsRemaining : (g.tr != null ? g.tr : 0);
    base.game.timeoutSecondsRemaining = Math.max(0, timeoutSeconds);
    if (g.timeoutTeam == null) base.game.timeoutTeam = null;
    else base.game.timeoutTeam = Math.max(0, Math.min(1, g.timeoutTeam|0));
    const halftimeSeconds = g.halftimeSecondsRemaining != null ? g.halftimeSecondsRemaining : (g.hr != null ? g.hr : 0);
    base.game.halftimeSecondsRemaining = Math.max(0, halftimeSeconds);
    base.game.targetEndAt = Number.isFinite(g.targetEndAt)
      ? g.targetEndAt
      : (Number.isFinite(g.te) ? g.te : 0);
>>>>>>> Stashed changes
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

let state = loadMigrated() || defaultState();
reconcileAll(Date.now());
let uiTickTimer = null; // lightweight UI ticker
let activeValueEditor = null;
let viewMode = loadViewMode();
let currentPage = 'game';

let playerOrientationLocked = false;

function lockPlayerOrientation(){
  const screenObj = window.screen;
  if (!screenObj) return;
  const orientation = screenObj.orientation;
  if (orientation && typeof orientation.lock === 'function'){
    playerOrientationLocked = true;
    orientation.lock('landscape').then(()=>{
      playerOrientationLocked = true;
    }).catch(()=>{
      playerOrientationLocked = false;
    });
    return;
  }
  const legacyLock = screenObj.lockOrientation || screenObj.mozLockOrientation || screenObj.msLockOrientation;
  if (typeof legacyLock === 'function'){
    try {
      playerOrientationLocked = legacyLock.call(screenObj, 'landscape');
    } catch {
      playerOrientationLocked = false;
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
  playerOrientationLocked = false;
}

const teamsDirectory = {
  loading: false,
  error: null,
  data: {},
  orderedTeamIds: [],
  activeTeamId: null,
  orderedPlayerIds: [],
  activePlayerId: null,
  unsubscribe: null
};

const TEAM_STAT_FIELDS = [
  { label: 'Passing TD', keys: ['passingTd', 'passingTD', 'passing_td', 'passingTouchdown', 'passingTouchdowns'] },
  { label: 'Receiving TD', keys: ['receivingTd', 'receivingTD', 'receiving_td', 'receivingTouchdown', 'receivingTouchdowns'] },
  { label: 'Rushing TD', keys: ['rushingTd', 'rushingTD', 'rushing_td', 'rushingTouchdown', 'rushingTouchdowns'] },
  { label: 'Interception', keys: ['interception', 'interceptions'] },
  { label: 'Flag Pull', keys: ['flagPull', 'flag_pull', 'flagpulls', 'flagPulls'] }
];

TEAM_STAT_FIELDS.forEach(field => {
  const keys = Array.isArray(field.keys) ? field.keys : [field.keys];
  const variants = new Set();
  keys.forEach(key => {
    if (!key) return;
    variants.add(key);
    variants.add(String(key).toLowerCase());
    variants.add(String(key).replace(/([A-Z])/g, '_$1').toLowerCase());
    variants.add(String(key).replace(/_/g, '').toLowerCase());
  });
  field.resolvedKeys = Array.from(variants);
});

const remoteSync = {
  config: loadRemoteConfig(),
  source: null,
  status: 'idle',
  lastError: null,
  pushTimer: null,
  lastPushedAt: 0,
  applying: false,
  connected: false,
  pushing: false,
  pendingPush: false,

  // New flag: when true, skip whole-state pushes and use transactions instead
  useTransactions: true
};


/**********************
 * Rendering
 **********************/
function fmt(sec){ const m=Math.floor(sec/60); const s=sec%60; const padded = ('0' + s).slice(-2); return `${m}:${padded}`; }
function fmtGirl(val){ return val===0 ? 'Now' : String(val); }

const clampGirl = (val) => Math.max(0, Math.min(2, val|0));
const clampTimeouts = (val) => Math.max(0, Math.min(3, val|0));
const clampRushes = (val) => Math.max(0, Math.min(2, val|0));
const clampDown = (val) => {
  const n = val|0;
  if (n < 1) return 1;
  if (n > 4) return 4;
  return n;
};
const wrapDown = (val) => {
  const n = val|0;
  if (n > 4) return 1;
  if (n < 1) return 4;
  return n;
};

function buildTimeoutPips(count){
  const value = clampTimeouts(count);
  let html = '<div class="pip-row" aria-hidden="true">';
  for (let i=0;i<3;i++){
    const used = i >= value;
    html += `<span class="pip-timeout${used?' used':''}"></span>`;
  }
  html += '</div>';
  return html;
}

function buildBlitzPips(count){
  const value = clampRushes(count);
  let html = '<div class="pip-row" aria-hidden="true">';
  for (let i=0;i<2;i++){
    const used = i >= value;
    html += `<span class="pip-blitz${used?' used':''}"></span>`;
  }
  html += '</div>';
  return html;
}

function describeGirlPlay(val){
  const v = clampGirl(val);
  if (v === 0) return 'Girl play now';
  if (v === 1) return 'Girl play in 1 play';
  return 'Girl play in 2 plays';
}

function describeTimeouts(val){
  const v = clampTimeouts(val);
  return `${v} timeout${v===1?'':'s'} remaining`;
}

function describeBlitzes(val){
  const v = clampRushes(val);
  return `${v} blitz${v===1?'':'es'} remaining`;
}

function updateGirlTrack(trackEl, value){
  if (!trackEl) return;
  const v = clampGirl(value);
  const spans = Array.from(trackEl.children);
  spans.forEach((span, idx) => {
    span.classList.toggle('used', idx >= v);
  });
}

function renderGameStatsView(){
  const host = document.getElementById('gameStatsView');
  if (!host) return;

  if (viewMode !== 'player') {
    host.innerHTML = '';
    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');
    return;
  }

  host.hidden = false;
  host.removeAttribute('aria-hidden');

  const teams = Array.isArray(state.teams) ? state.teams : [];
  if (!teams.length) {
    const slot = document.createElement('div');
    slot.className = 'team-slot';
    const empty = document.createElement('p');
    empty.className = 'stat-empty';
    empty.textContent = 'No teams yet.';
    slot.appendChild(empty);
    host.replaceChildren(slot);
    return;
  }

  const frag = document.createDocumentFragment();
  teams.forEach((team, idx) => {
    const slot = document.createElement('div');
    slot.className = 'team-slot';

    const title = document.createElement('h4');
    const fallbackName = idx === 0 ? 'Home' : (idx === 1 ? 'Away' : `Team ${idx + 1}`);
    title.textContent = entityName(team, fallbackName);
    slot.appendChild(title);

    const createRow = (label) => {
      const row = document.createElement('div');
      row.className = 'stat-line';
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      row.appendChild(labelEl);
      const valueEl = document.createElement('span');
      valueEl.className = 'stat-value';
      row.appendChild(valueEl);
      return { row, valueEl };
    };

    const timeouts = clampTimeouts(team?.timeouts ?? 0);
    const { row: timeoutRow, valueEl: timeoutValue } = createRow('Timeouts');
    const timeoutPips = document.createElement('span');
    timeoutPips.innerHTML = buildTimeoutPips(timeouts);
    timeoutValue.appendChild(timeoutPips);
    const timeoutCount = document.createElement('span');
    timeoutCount.textContent = String(timeouts);
    timeoutValue.appendChild(timeoutCount);
    const timeoutSr = document.createElement('span');
    timeoutSr.className = 'sr-only';
    timeoutSr.textContent = describeTimeouts(timeouts);
    timeoutValue.appendChild(timeoutSr);
    slot.appendChild(timeoutRow);

    const rushes = clampRushes(team?.rushes ?? 0);
    const { row: blitzRow, valueEl: blitzValue } = createRow('Blitzes');
    const blitzPips = document.createElement('span');
    blitzPips.innerHTML = buildBlitzPips(rushes);
    blitzValue.appendChild(blitzPips);
    const blitzCount = document.createElement('span');
    blitzCount.textContent = String(rushes);
    blitzValue.appendChild(blitzCount);
    const blitzSr = document.createElement('span');
    blitzSr.className = 'sr-only';
    blitzSr.textContent = describeBlitzes(rushes);
    blitzValue.appendChild(blitzSr);
    slot.appendChild(blitzRow);

    const { row: girlRow, valueEl: girlValue } = createRow('Girl play');
    girlValue.textContent = fmtGirl(clampGirl(team?.girlPlay ?? 2));
    const girlSr = document.createElement('span');
    girlSr.className = 'sr-only';
    girlSr.textContent = describeGirlPlay(team?.girlPlay);
    girlValue.appendChild(girlSr);
    slot.appendChild(girlRow);

    frag.appendChild(slot);
  });

  host.replaceChildren(frag);
}

function render(){
  const nowMs = Date.now();
  reconcileAll(nowMs);
  document.body.dataset.view = viewMode;
  const indicator = $('#viewIndicator');
  if (indicator) {
    indicator.textContent = viewMode === 'ref' ? 'Game dashboard' : 'Scoreboard';
  }

  $$('#menuDrawer .drawer-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewMode));
  const isRef = viewMode === 'ref';
  $$('button[data-role="ref-only"]').forEach(btn => { btn.disabled = !isRef; });

  // 🔹 Update Timeout button labels to current team names
  const homeName = state.teams[0]?.name || 'Home';
  const awayName = state.teams[1]?.name || 'Away';
  const btnHomeTO = $('#timeoutHome');
  const btnAwayTO = $('#timeoutAway');
  const btnHomeBlitz = $('#blitzHome');
  const btnAwayBlitz = $('#blitzAway');
  if (btnHomeTO) {
    btnHomeTO.textContent = 'Timeout';
    btnHomeTO.setAttribute('aria-label', `Timeout for ${homeName}`);
  }
  if (btnAwayTO) {
    btnAwayTO.textContent = 'Timeout';
    btnAwayTO.setAttribute('aria-label', `Timeout for ${awayName}`);
  }
  if (btnHomeBlitz) {
    btnHomeBlitz.setAttribute('aria-label', `Log blitz for ${homeName}`);
  }
  if (btnAwayBlitz) {
    btnAwayBlitz.setAttribute('aria-label', `Log blitz for ${awayName}`);
  }

  // Clock & banners
<<<<<<< Updated upstream
  $('#gameTime').textContent = fmt(state.game.seconds);
  const timeoutSeconds = state.timeout?.secondsRemaining || 0;
  if (timeoutSeconds > 0){
=======
  $('#gameTime').textContent = fmt(getRemainingSeconds(state.game));
  if (state.game.timeoutSecondsRemaining>0){
>>>>>>> Stashed changes
    $('#timeoutBanner').style.display='';
    const timeoutTeamIndex = state.timeout?.team;
    let timeoutName = '';
    if (timeoutTeamIndex != null && state.teams[timeoutTeamIndex]) {
      timeoutName = state.teams[timeoutTeamIndex].name;
    }
    $('#timeoutTeam').textContent = timeoutName;
    $('#timeoutTime').textContent = fmt(timeoutSeconds);
  } else { $('#timeoutBanner').style.display='none'; }

  $('#clockStartPause').textContent = state.game.running ? 'Pause' : 'Start';
  const activeTeam = state.teams[state.activeTeam] || state.teams[0];
  const activeTeamLabel = $('#activeTeamLabel');
  if (activeTeamLabel && activeTeam) {
    activeTeamLabel.textContent = activeTeam.name;
  }
  const downValueEl = $('#downValue');
  const girlTrackEl = $('#girlPlayTrack');
  const girlTextEl = $('#girlPlayText');
  if (activeTeam) {
    if (downValueEl) downValueEl.textContent = clampDown(activeTeam.downs != null ? activeTeam.downs : 1);
    updateGirlTrack(girlTrackEl, activeTeam.girlPlay);
    if (girlTextEl) girlTextEl.textContent = describeGirlPlay(activeTeam.girlPlay);
  }
  renderTeams();
  renderPage();
  renderGameStatsView();
  syncTimersWithState();
}

// === Persistent Timer Setup (Synqro) ===
const gameTimeEl = document.getElementById('gameTime');
const startPauseBtn = document.getElementById('clockStartPause');
let timerInterval = null;

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function renderTimer() {
  const { remainingMs } = TimerStore.getRemaining();
  gameTimeEl.textContent = formatTime(remainingMs);
  if (remainingMs <= 0) {
    TimerStore.stop();
    startPauseBtn.textContent = 'Start';
  }
}

function startRenderLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(renderTimer, 250);
}

document.addEventListener('DOMContentLoaded', startRenderLoop);

startPauseBtn.addEventListener('click', () => {
  const { running } = TimerStore.getRemaining();
  if (running) {
    TimerStore.pause();
    startPauseBtn.textContent = 'Start';
  } else {
    TimerStore.start(25 * 60 * 1000);
    startPauseBtn.textContent = 'Pause';
  }
  renderTimer();
});

function renderTeams(){
  const editingVal = document.querySelector('.team-card .val.editing');
  let restoreEdit = null;
  if (editingVal) {
    const { team, kind } = editingVal.dataset;
    const input = editingVal.querySelector('input');
    if (team != null && kind && input) {
      restoreEdit = {
        team: Number(team),
        kind,
        value: input.value,
        selectionStart: input.selectionStart != null ? input.selectionStart : input.value.length,
        selectionEnd: input.selectionEnd != null ? input.selectionEnd : input.value.length
      };
    }
  }

  const editingEnabled = viewMode === 'ref';
  if (!editingEnabled && activeValueEditor) {
    try { activeValueEditor(false); } catch {}
  }
  activeValueEditor = null;

  const teamSlots = [$('#teamCard0'), $('#teamCard1')];
  teamSlots.forEach((slot, idx) => {
    if (!slot) return;
    slot.className = 'team-card';
    const isActiveTeam = state.activeTeam === idx;
    slot.classList.toggle('active', isActiveTeam);
    slot.dataset.team = idx;
    slot.innerHTML = '';
    if (editingEnabled) {
      slot.setAttribute('role', 'button');
      slot.setAttribute('tabindex', '0');
      slot.setAttribute('aria-pressed', isActiveTeam ? 'true' : 'false');
    } else {
      slot.removeAttribute('role');
      slot.removeAttribute('tabindex');
      slot.removeAttribute('aria-pressed');
    }

    const team = state.teams[idx];
    if (!team) {
      const empty = document.createElement('div');
      empty.style.color = '#94a3b8';
      empty.style.fontWeight = '700';
      empty.style.textAlign = 'center';
      empty.textContent = 'No team';
      slot.appendChild(empty);
      slot.onclick = null;
      return;
    }

    const header = document.createElement('header');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = team.name;
    if (editingEnabled){
      nameSpan.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        openTeamPopover(idx, nameSpan);
      });
    }
    header.appendChild(nameSpan);
    slot.appendChild(header);

    const scoreVal = document.createElement('div');
    scoreVal.className = 'val score-value';
    scoreVal.dataset.kind = 'score';
    scoreVal.dataset.team = idx;
    scoreVal.textContent = team.score != null ? team.score : 0;
    slot.appendChild(scoreVal);

    const metrics = document.createElement('div');
    metrics.className = 'team-metrics';

    const timeoutMetric = document.createElement('div');
    timeoutMetric.className = 'metric';
    const timeoutVal = document.createElement('div');
    timeoutVal.className = 'val metric-track';
    timeoutVal.dataset.kind = 'timeouts';
    timeoutVal.dataset.team = idx;
    timeoutVal.innerHTML = buildTimeoutPips(team.timeouts);
    timeoutVal.setAttribute('aria-label', describeTimeouts(team.timeouts));
    timeoutVal.setAttribute('title', describeTimeouts(team.timeouts));
    timeoutMetric.appendChild(timeoutVal);
    metrics.appendChild(timeoutMetric);

    const blitzMetric = document.createElement('div');
    blitzMetric.className = 'metric';
    const blitzVal = document.createElement('div');
    blitzVal.className = 'val metric-track';
    blitzVal.dataset.kind = 'rushes';
    blitzVal.dataset.team = idx;
    blitzVal.innerHTML = buildBlitzPips(team.rushes);
    blitzVal.setAttribute('aria-label', describeBlitzes(team.rushes));
    blitzVal.setAttribute('title', describeBlitzes(team.rushes));
    blitzMetric.appendChild(blitzVal);
    metrics.appendChild(blitzMetric);

    slot.appendChild(metrics);

    if (editingEnabled) {
      const activate = () => {
        if (document.querySelector('.team-select')) return;
        state.activeTeam = idx;
        renderAndPersist();
      };
      slot.onclick = (ev) => {
        if (ev.target.closest('.val.editing')) return;
        if (ev.target.closest('.name')) return;
        activate();
      };
      slot.onkeydown = (ev) => {
        if (ev.defaultPrevented) return;
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate();
        }
      };
    } else {
      slot.onclick = null;
      slot.onkeydown = null;
    }
  });

  if (editingEnabled){
    document.querySelectorAll('.team-card .val[data-kind]').forEach(v => {
      v.addEventListener('click', (ev)=>{ ev.stopPropagation(); beginEditValue(v, v.dataset.kind, +v.dataset.team); });
    });
  }

  if (restoreEdit && editingEnabled) {
    const valEl = document.querySelector(`.team-card .val[data-team="${restoreEdit.team}"][data-kind="${restoreEdit.kind}"]`);
    if (valEl) {
      beginEditValue(valEl, restoreEdit.kind, restoreEdit.team, { skipCancelExisting: true, restore: restoreEdit });
    }
  }
}

function mutateTeam(teamIdx, mutator){
  if (viewMode !== 'ref') return false;
  if (teamIdx == null || teamIdx < 0) return false;
  if (isOnlineWriter()){
    txnState(s => {
      if (!s || !Array.isArray(s.teams) || !s.teams[teamIdx]) return s;
      mutator(s.teams[teamIdx]);
      return s;
    });
    return true;
  }

  const team = state.teams[teamIdx];
  if (!team) return false;
  mutator(team);
  renderAndPersist();
  return true;
}

function entityName(entity, fallback = ''){
  if (!entity || typeof entity !== 'object') return fallback;
  const raw = entity.name;
  if (raw == null) return fallback;
  const str = String(raw).trim();
  return str || fallback;
}

function sortKeysByName(map){
  if (!map) return [];
  return Object.keys(map).sort((a, b) => {
    const nameA = entityName(map[a], `zzzz${a}`).toLowerCase();
    const nameB = entityName(map[b], `zzzz${b}`).toLowerCase();
    if (nameA === nameB) return a.localeCompare(b);
    return nameA.localeCompare(nameB);
  });
}

function valueFromField(player, field){
  if (!player || typeof player !== 'object') return 0;
  const sources = [];
  if (player.stats && typeof player.stats === 'object') sources.push(player.stats);
  sources.push(player);
  for (const source of sources){
    if (!source || typeof source !== 'object') continue;
    const keys = field.resolvedKeys || [];
    for (const key of keys){
      if (Object.prototype.hasOwnProperty.call(source, key)){
        const raw = source[key];
        if (raw == null || raw === '') continue;
        const num = Number(raw);
        if (Number.isFinite(num)) return num;
        if (typeof raw === 'string'){
          const trimmed = raw.trim();
          if (!trimmed) continue;
          const parsed = Number(trimmed);
          if (Number.isFinite(parsed)) return parsed;
          return trimmed;
        }
        return raw;
      }
    }
  }
  return 0;
}

function renderPage(){
  document.body.dataset.page = currentPage;
  $$('.page').forEach(sec => {
    const isActive = sec.dataset.page === currentPage;
    sec.classList.toggle('active', isActive);
    sec.hidden = !isActive;
  });
  $$('#menuDrawer .drawer-item[data-page]').forEach(btn => {
    const matchesPage = btn.dataset.page === currentPage;
    const requiredView = btn.dataset.view;
    const matchesView = !requiredView || requiredView === viewMode;
    btn.classList.toggle('active', matchesPage && matchesView);
  });
  if (currentPage === 'teams') {
    ensureTeamsListener();
    renderTeamsDirectory();
  }
}

function ensureTeamsListener(){
  if (!db) {
    teamsDirectory.loading = false;
    teamsDirectory.error = null;
    teamsDirectory.data = {};
    teamsDirectory.orderedTeamIds = [];
    teamsDirectory.orderedPlayerIds = [];
    renderTeamsDirectory();
    return;
  }
  if (teamsDirectory.unsubscribe) return;
  teamsDirectory.loading = true;
  teamsDirectory.error = null;
  renderTeamsDirectory();
  const ref = db.ref('teams');
  const handler = snap => {
    teamsDirectory.loading = false;
    teamsDirectory.error = null;
    const raw = snap.val() || {};
    teamsDirectory.data = raw;
    teamsDirectory.orderedTeamIds = sortKeysByName(raw);
    if (!teamsDirectory.orderedTeamIds.includes(teamsDirectory.activeTeamId)) {
      teamsDirectory.activeTeamId = teamsDirectory.orderedTeamIds[0] || null;
    }
    const activeTeam = teamsDirectory.activeTeamId ? raw[teamsDirectory.activeTeamId] : null;
    const players = activeTeam && activeTeam.players ? activeTeam.players : {};
    teamsDirectory.orderedPlayerIds = sortKeysByName(players);
    if (!teamsDirectory.orderedPlayerIds.includes(teamsDirectory.activePlayerId)) {
      teamsDirectory.activePlayerId = teamsDirectory.orderedPlayerIds[0] || null;
    }
    renderTeamsDirectory();
  };
  const errHandler = err => {
    teamsDirectory.loading = false;
    teamsDirectory.error = err && err.message ? err.message : String(err);
    renderTeamsDirectory();
  };
  ref.on('value', handler, errHandler);
  teamsDirectory.unsubscribe = () => ref.off('value', handler);
}

function selectTeam(teamId){
  if (!teamId || !teamsDirectory.data || !teamsDirectory.data[teamId]) return;
  teamsDirectory.activeTeamId = teamId;
  const team = teamsDirectory.data[teamId] || {};
  const players = team.players || {};
  teamsDirectory.orderedPlayerIds = sortKeysByName(players);
  teamsDirectory.activePlayerId = teamsDirectory.orderedPlayerIds[0] || null;
  renderTeamsDirectory();
}

function selectPlayer(playerId){
  teamsDirectory.activePlayerId = playerId || null;
  renderTeamsDirectory();
}

// === Stats Grid helpers ===

// Return the canonical key we'll use to store a field in Firebase
function getPrimaryKeyForField(field){
  if (Array.isArray(field.keys) && field.keys.length) return field.keys[0];
  if (Array.isArray(field.resolvedKeys) && field.resolvedKeys.length) return field.resolvedKeys[0];
  return null;
}

// Increment a player's stat by 1 (optimistic UI + Firebase transaction)
async function incPlayerStat(teamId, playerId, statKey){
  if (!teamId || !playerId || !statKey) return;
  // Optimistic local bump (so UI feels instant)
  const team = teamsDirectory.data?.[teamId];
  if (team) {
    if (!team.players) team.players = {};
    const player = team.players[playerId] || (team.players[playerId] = { name: 'Player', stats: {} });
    if (!player.stats) player.stats = {};
    const before = Number(player.stats[statKey] ?? 0);
    player.stats[statKey] = before + 1;
    renderTeamStatsGrid(); // re-render grid quickly
  }

  if (!db) return; // if offline, local-only

  try {
    const ref = db.ref(`teams/${teamId}/players/${playerId}/stats/${statKey}`);
    await ref.transaction(v => (v|0) + 1);
    // Listener will sync the authoritative value shortly
  } catch (e) {
    console.warn('[incPlayerStat] transaction failed', e);
  }
}

// Build/refresh the grid for the active team
function renderTeamStatsGrid(){
  const host = document.getElementById('teamStatsGrid');
  if (!host) return;

  // Guard: require Firebase + active team
  if (!db) {
    host.innerHTML = '<div class="stats-grid-empty">Connect to Firebase to record stats.</div>';
    return;
  }
  const teamId = teamsDirectory.activeTeamId;
  if (!teamId) {
    host.innerHTML = '<div class="stats-grid-empty">Select a team to view and record stats.</div>';
    return;
  }
  const team = teamsDirectory.data?.[teamId] || {};
  const players = team.players || {};
  const playerIds = teamsDirectory.orderedPlayerIds || Object.keys(players);

  // No players yet
  if (!playerIds.length) {
    host.innerHTML = '<div class="stats-grid-empty">No players yet. Add players to start recording stats.</div>';
    return;
  }

  // Build table
  const table = document.createElement('table');
  table.className = 'stats-grid';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');

  // Header: Player + stat labels
  const thName = document.createElement('th'); thName.textContent = 'Player';
  trh.appendChild(thName);
  TEAM_STAT_FIELDS.forEach(field => {
    const th = document.createElement('th'); th.textContent = field.label;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  playerIds.forEach(pid => {
    const p = players[pid] || {};
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = entityName(p, 'Unnamed player');
    tr.appendChild(nameTd);

    TEAM_STAT_FIELDS.forEach(field => {
      const key = getPrimaryKeyForField(field);
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stat-cell';
      btn.dataset.teamId = teamId;
      btn.dataset.playerId = pid;
      btn.dataset.statKey = key;
      // show current value (fallback to 0)
      const val = valueFromField(p, field);
      btn.textContent = Number.isFinite(val) ? String(val) : String(Number(val || 0));
      btn.setAttribute('aria-label', `Add 1 to ${field.label} for ${entityName(p, 'player')}`);
      td.appendChild(btn);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  host.innerHTML = '';
  host.appendChild(table);

  // Wire click handler once (event delegation)
  if (!host.__wired) {
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('button.stat-cell');
      if (!btn) return;
      e.stopPropagation();
      const { teamId, playerId, statKey } = btn.dataset;
      incPlayerStat(teamId, playerId, statKey);
    });
    host.__wired = true;
  }
}

function renderTeamsDirectory(){
  const statusEl = $('#teamsPageStatus');
  const teamListEl = $('#teamsDirectoryList');
  const playerListEl = $('#teamsPlayerList');
  const statsEl = $('#teamsStatsList');
  const playerTitleEl = $('#teamsSelectedPlayer');
  const addTeamBtn = $('#teamsAddTeam');
  const addPlayerBtn = $('#teamsAddPlayer');


  if (!statusEl || !teamListEl || !playerListEl || !statsEl) return;
  if (addTeamBtn) addTeamBtn.disabled = !db;
  if (addPlayerBtn) addPlayerBtn.disabled = !db || !teamsDirectory.activeTeamId;
  if (currentPage !== 'teams') return;

  const firebaseReady = !!db;
  if (!firebaseReady) {
    statusEl.textContent = 'Connect to Firebase to manage teams.';
    statusEl.classList.remove('error');
    teamListEl.innerHTML = '';
    playerListEl.innerHTML = '';
    statsEl.innerHTML = '';
    const teamsEmpty = document.createElement('div');
    teamsEmpty.className = 'empty';
    teamsEmpty.textContent = 'Firebase connection unavailable.';
    teamListEl.appendChild(teamsEmpty);
    const playersEmpty = document.createElement('div');
    playersEmpty.className = 'empty';
    playersEmpty.textContent = 'Connect to select players.';
    playerListEl.appendChild(playersEmpty);
    const statsEmpty = document.createElement('p');
    statsEmpty.className = 'teams-placeholder';
    statsEmpty.textContent = 'Firebase connection unavailable.';
    statsEl.appendChild(statsEmpty);
    if (playerTitleEl) playerTitleEl.textContent = '';
    renderTeamStatsGrid();
    return;
  }

  if (teamsDirectory.error) {
    statusEl.textContent = `Error loading teams: ${teamsDirectory.error}`;
    statusEl.classList.add('error');
  } else if (teamsDirectory.loading) {
    statusEl.textContent = 'Loading teams…';
    statusEl.classList.remove('error');
  } else if (!teamsDirectory.orderedTeamIds.length) {
    statusEl.textContent = 'No teams yet. Add your first team to get started.';
    statusEl.classList.remove('error');
  } else {
    statusEl.textContent = '';
    statusEl.classList.remove('error');
  }

  const teams = teamsDirectory.data || {};
  teamListEl.innerHTML = '';
  if (!teamsDirectory.orderedTeamIds.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No teams found.';
    teamListEl.appendChild(empty);
  } else {
    teamsDirectory.orderedTeamIds.forEach(id => {
      const team = teams[id] || {};
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.dataset.teamId = id;
      btn.textContent = entityName(team, 'Unnamed team');
      if (id === teamsDirectory.activeTeamId) btn.classList.add('active');
      btn.setAttribute('aria-selected', id === teamsDirectory.activeTeamId ? 'true' : 'false');
      btn.addEventListener('click', () => selectTeam(id));
      teamListEl.appendChild(btn);
    });
  }

  const activeTeam = teamsDirectory.activeTeamId ? teams[teamsDirectory.activeTeamId] : null;
  const players = activeTeam && activeTeam.players ? activeTeam.players : {};

  playerListEl.innerHTML = '';
  if (!teamsDirectory.activeTeamId) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Pick a team first.';
    playerListEl.appendChild(empty);
  } else if (!teamsDirectory.orderedPlayerIds.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No players yet.';
    playerListEl.appendChild(empty);
  } else {
    teamsDirectory.orderedPlayerIds.forEach(id => {
      const player = players[id] || {};
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.dataset.playerId = id;
      btn.textContent = entityName(player, 'Unnamed player');
      if (id === teamsDirectory.activePlayerId) btn.classList.add('active');
      btn.setAttribute('aria-selected', id === teamsDirectory.activePlayerId ? 'true' : 'false');
      btn.addEventListener('click', () => selectPlayer(id));
      playerListEl.appendChild(btn);
    });
  }

  const activePlayer = teamsDirectory.activePlayerId ? players[teamsDirectory.activePlayerId] : null;
  if (playerTitleEl) playerTitleEl.textContent = activePlayer ? entityName(activePlayer, '') : '';
  statsEl.innerHTML = '';
  if (!activePlayer) {
    const empty = document.createElement('p');
    empty.className = 'teams-placeholder';
    empty.textContent = teamsDirectory.activeTeamId ? 'Select a player to view stats.' : 'Select a team to get started.';
    statsEl.appendChild(empty);
  } else {
    TEAM_STAT_FIELDS.forEach(field => {
      const row = document.createElement('div');
      row.className = 'teams-stat-row';
      const label = document.createElement('span');
      label.textContent = field.label;
      const valueEl = document.createElement('span');
      const value = valueFromField(activePlayer, field);
      valueEl.textContent = (value == null || value === '') ? '0' : value;
      row.appendChild(label);
      row.appendChild(valueEl);
      statsEl.appendChild(row);
    });
  }
renderTeamStatsGrid();
}

async function handleAddTeam(){
  if (!db) { alert('Firebase connection required to add a team.'); return; }
  const name = prompt('Team name');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const ref = db.ref('teams').push();
    await ref.set({ name: trimmed });
    teamsDirectory.activeTeamId = ref.key;
    teamsDirectory.activePlayerId = null;
    if (!teamsDirectory.data) teamsDirectory.data = {};
    teamsDirectory.data[ref.key] = { name: trimmed };
    teamsDirectory.orderedTeamIds = sortKeysByName(teamsDirectory.data);
    teamsDirectory.orderedPlayerIds = [];
    renderTeamsDirectory();
  } catch (err) {
    alert('Unable to add team: ' + (err && err.message ? err.message : err));
  }
}

async function handleAddPlayer(){
  if (!db) { alert('Firebase connection required to add a player.'); return; }
  const teamId = teamsDirectory.activeTeamId;
  if (!teamId) { alert('Select a team first.'); return; }
  const name = prompt('Player name');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const ref = db.ref(`teams/${teamId}/players`).push();
    const stats = {};
    TEAM_STAT_FIELDS.forEach(field => {
      const primaryKey = Array.isArray(field.keys) && field.keys.length ? field.keys[0] : (field.resolvedKeys && field.resolvedKeys[0]);
      if (primaryKey) stats[primaryKey] = 0;
    });
    await ref.set({ name: trimmed, stats });
    teamsDirectory.activePlayerId = ref.key;
    if (!teamsDirectory.data) teamsDirectory.data = {};
    let team = teamsDirectory.data[teamId];
    if (!team) {
      team = { name: entityName(team, '') };
      teamsDirectory.data[teamId] = team;
    }
    if (!team.players) team.players = {};
    team.players[ref.key] = { name: trimmed, stats };
    teamsDirectory.orderedPlayerIds = sortKeysByName(team.players);
    renderTeamsDirectory();
  } catch (err) {
    alert('Unable to add player: ' + (err && err.message ? err.message : err));
  }
}

function setPage(page){
  const next = page === 'teams' ? 'teams' : 'game';
  if (currentPage !== next) {
    currentPage = next;
  }
  renderPage();
  closeMenu();
}

/**********************
 * Remote Sync (Firebase Realtime Database via SDK)
 **********************/
let auth = null, db = null;
if (window.__firebaseReady && window.firebase) {
  try {
    auth = firebase.auth();
    db   = firebase.database();
  } catch (e) {
    console.warn('Firebase SDK present but init failed:', e);
  }
} else {
  console.warn('Firebase SDK not available; running local-only.');
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

// Persist only the game code locally
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

remoteSync.config = loadRemoteConfig();
remoteSync.canWrite = false;

function updateRemoteStatus(){
  const el = $('#syncStatus'); if (!el) return;
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
  const form = $('#syncForm'); if (!form) return;
  const cfg = remoteSync.config || {};
  if (form.game) form.game.value = cfg.game || '';
}

// Throttled remote push
let lastPushMs = 0;
function scheduleRemotePush(){
  if (remoteSync.useTransactions) return;
  if (!db || !auth) return;
  if (!remoteConfigured() || viewMode !== 'ref' || remoteSync.applying || !remoteSync.canWrite) return;
  const now = Date.now();
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
  const payload = { state: serializeState(state), updatedAt: firebase.database.ServerValue.TIMESTAMP };

  gameRef.update(payload)
    .then(()=>{ remoteSync.status='connected'; remoteSync.connected=true; remoteSync.lastError=null; lastPushMs=Date.now(); })
    .catch(err=>{ remoteSync.status='error'; remoteSync.connected=false; remoteSync.lastError=String(err && err.message ? err.message : err); })
    .finally(()=>{
      remoteSync.pushing=false;
      if (remoteSync.pendingPush){ remoteSync.pendingPush=false; pushRemoteNow(); }
      updateRemoteStatus();
    });
}

// Replace your current handleRemotePayload with this
function handleRemotePayload(raw){
  if (!raw) return;
  const body = raw.state != null ? raw.state : raw;
  if (!body) return;
  remoteSync.applying = true;
  try {
    // inflate() already normalizes/clamps to our expected shape
    state = inflate(body);
    render();              // <- re-render UI from remote state
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

// Is current user listed as a writer?
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

// Add/remove current user to writers set
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
    const working = inflate(s);
    const result = mutateFn(working);
    const nextState = (result && typeof result === 'object') ? result : working;
    return serializeState(nextState);
  })
  .then(res => { console.log('[txnState] committed:', res.committed); return res; })
  .catch(e => { console.warn('[txnState:err]', e); throw e; });
}

async function seedStateIfMissing(game){
  if (!remoteSync.canWrite) return; // only a writer seeds
  const ref = db.ref(`games/${game}/state`);
  await ref.transaction(s => {
    // If empty, initialize default; otherwise leave as-is
    return s || serializeState(defaultState());
  });
}


async function connectRemote(){
  // reset any prior listeners/session state
  disconnectRemote();

  // basic guards
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

  // 1) sign in anonymously if needed
  try {
    if (!auth.currentUser) await auth.signInAnonymously();
  } catch (err) {
    remoteSync.status = 'error';
    remoteSync.lastError = err;
    updateRemoteStatus();
    return;
  }

  // 2) writer intent (multi-writer)
  const game = requireConfiguredGame();
  if (!game) return;
  var _el = document.getElementById('joinAsWriter');
const wantsWriter = (_el && typeof _el.checked !== 'undefined') ? _el.checked : true;

  try {
    if (wantsWriter) {
      await joinWriters(game);     // add self to writers set
    } else {
      await leaveWriters(game);    // ensure we are not listed as writer
    }
  } catch (err) {
    // proceed as viewer if writer join fails
    console.warn('[sync] writer join/leave failed, continuing as viewer', err);
  }

  // 3) establish writer capability
  try {
    remoteSync.canWrite = await isCurrentUserWriter(game);
  } catch {
    remoteSync.canWrite = false;
  }

  syncTimersWithState();

  // 4) seed state once if missing (only writers)
  try {
    if (remoteSync.canWrite) {
      await seedStateIfMissing(game);
    }
  } catch (err) {
    console.warn('[sync] seedStateIfMissing failed', err);
  }

  // 5) live listener (to both meta + state)
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

// --- Game Dashboard team picker (choose from /teams or type custom) ---
async function setTeamName(slotIdx, newName){
  if (!newName) return;
  state.teams[slotIdx].name = newName;
  if (isOnlineWriter()){
    try {
      await txnField(`teams/${slotIdx}/name`, () => newName);
    } catch (e) {
      console.warn('[team name sync] failed; using local only', e);
    }
  }
  renderAndPersist();
}

async function chooseTeamForSlot(slotIdx){
  try {
    let options = [];
    // Pull names from /teams if Firebase is available
    if (db) {
      const snap = await db.ref('teams').get();
      const val = snap.val() || {};
      options = Object.values(val)
        .map(t => (t && t.name ? String(t.name).trim() : ''))
        .filter(Boolean);
    }
    // Deduplicate + sort for a clean list
    options = Array.from(new Set(options)).sort((a,b)=>a.localeCompare(b));

    if (!options.length) {
      // No Firebase or no teams yet — just let them type a name
      const manual = prompt('Enter team name:', state.teams[slotIdx].name || '');
      if (manual) await setTeamName(slotIdx, manual.trim());
      return;
    }

    const numbered = options.map((n,i)=> `${i+1}) ${n}`).join('\n');
    const label = slotIdx === 0 ? 'Home' : 'Away';
    const ans = prompt(
      `Select a team for ${label}:\n${numbered}\n\nTip: type a number OR type a custom name.`,
      ''
    );
    if (!ans) return;

    const num = parseInt(ans, 10);
    const chosen = (Number.isFinite(num) && num >= 1 && num <= options.length)
      ? options[num - 1]
      : ans;

    await setTeamName(slotIdx, chosen.trim());
  } catch (e) {
    console.warn('[chooseTeamForSlot] error; falling back to manual', e);
    const manual = prompt('Enter team name:', state.teams[slotIdx].name || '');
    if (manual) await setTeamName(slotIdx, manual.trim());
  }
}

// === Team dropdown picker for Game Dashboard ===
async function fetchTeamOptions() {
  // Pull names from /teams in Firebase; fall back to [] if unavailable
  if (!db) return [];
  const snap = await db.ref('teams').get();
  const val = snap.val() || {};
  const names = Object.values(val)
    .map(t => (t && t.name ? String(t.name).trim() : ''))
    .filter(Boolean);
  // Dedup + sort
  return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
}

async function openTeamDropdown(slotIdx, anchorEl) {
  const options = await fetchTeamOptions();
  if (!options.length) {
    alert('No teams found. Add teams on the Teams page first.');
    return;
  }

  const select = document.createElement('select');
  select.className = 'team-select';

  options.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  const current = (state.teams[slotIdx] && state.teams[slotIdx].name) || '';
  if (current) {
    const i = options.indexOf(current);
    if (i >= 0) select.selectedIndex = i;
  }

  // Replace the span with the select
  anchorEl.replaceWith(select);

  // 🚫 Stop team-card click from firing while dropdown is open
  const stop = (e) => e.stopPropagation();
  select.addEventListener('mousedown', stop, true);
  select.addEventListener('click', stop, true);
  select.addEventListener('touchstart', stop, true);

  // Helpers to put the span back
  const restoreSpan = () => {
    const span = document.createElement('span');
    span.className = 'name';
    span.textContent = (state.teams[slotIdx] && state.teams[slotIdx].name) || current || (slotIdx === 0 ? 'Home' : 'Away');
    span.addEventListener('click', (ev) => { ev.stopPropagation(); openTeamDropdown(slotIdx, span); });
    select.replaceWith(span);
    document.removeEventListener('mousedown', outsideClickOnce, true);
    document.removeEventListener('touchstart', outsideClickOnce, true);
  };

  const commit = async () => {
    const chosen = select.value;
    if (chosen && chosen !== current) {
      state.teams[slotIdx].name = chosen;
      if (isOnlineWriter()) {
        try { await txnField(`teams/${slotIdx}/name`, () => chosen); } catch {}
      }
      renderAndPersist();
    }
    restoreSpan();
  };

  const cancel = () => restoreSpan();

  // ✅ Commit only on actual change or Enter; Escape cancels
  select.addEventListener('change', commit);
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  // Click/tap outside cancels (does NOT auto-select)
  const outsideClickOnce = (e) => {
    if (!select.contains(e.target)) cancel();
  };
  document.addEventListener('mousedown', outsideClickOnce, true);
  document.addEventListener('touchstart', outsideClickOnce, true);

  // Focus after it’s in the DOM and try to auto-open the native picker
  setTimeout(() => {
    try { select.focus({ preventScroll: true }); } catch {}
    // Try multiple ways to trigger the dropdown
    try { select.click(); } catch {}
    try { select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch {}
    try { select.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true })); } catch {}
    try { select.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true })); } catch {}
    try { select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); } catch {}
  }, 0);
}


// === Popover team picker (no <select>, zero layout shift) ===
async function fetchTeamOptions() {
  if (!db) return [];
  const snap = await db.ref('teams').get();
  const val = snap.val() || {};
  const names = Object.values(val).map(t => (t && t.name ? String(t.name).trim() : '')).filter(Boolean);
  return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
}

function openTeamPopover(slotIdx, anchorEl) {
  // Prevent card click from swapping active team while picker is open
  const hasExisting = document.querySelector('.team-popover, .team-popover-backdrop');
  if (hasExisting) { /* one at a time */ return; }

  // Backdrop to catch outside clicks
  const backdrop = document.createElement('div');
  backdrop.className = 'team-popover-backdrop';
  backdrop.addEventListener('mousedown', (e)=> e.stopPropagation());
  backdrop.addEventListener('click', close);

  // Popover shell
  const pop = document.createElement('div');
  pop.className = 'team-popover';
  pop.setAttribute('role', 'listbox');
  pop.addEventListener('mousedown', (e)=> e.stopPropagation());
  pop.addEventListener('click', (e)=> e.stopPropagation());

  // Position near the anchor (name span)
  const r = anchorEl.getBoundingClientRect();
  const gap = 6;
  const px = Math.min(r.left, window.innerWidth - 220); // keep on screen
  let py = r.bottom + gap;
  const belowSpace = window.innerHeight - r.bottom;
  if (belowSpace < 180) py = Math.max(12, r.top - gap - 220); // place above if not enough space

  pop.style.left = `${px}px`;
  pop.style.top  = `${py}px`;

  // Fill with options (async)
  pop.textContent = 'Loading…';
  document.body.appendChild(backdrop);
  document.body.appendChild(pop);

  (async () => {
    try {
      const options = await fetchTeamOptions();
      const current = (state.teams[slotIdx] && state.teams[slotIdx].name) || '';
      if (!options.length) {
        pop.innerHTML = '<div style="padding:10px 12px;color:#94a3b8;font-weight:700;">No teams found. Add teams on the Teams page.</div>';
        return;
      }
      pop.innerHTML = '';
      options.forEach(name => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.textContent = name;
        if (name === current) btn.style.opacity = .8;
        btn.addEventListener('click', async () => {
          if (name !== current) {
            state.teams[slotIdx].name = name;
            if (isOnlineWriter()) {
              try { await txnField(`teams/${slotIdx}/name`, () => name); } catch {}
            }
            renderAndPersist();
          }
          close();
        });
        pop.appendChild(btn);
      });

      // Keyboard support: ArrowUp/Down, Enter, Escape
      let focusIdx = Math.max(0, options.indexOf(current));
      const setFocus = (i) => {
        focusIdx = Math.max(0, Math.min(options.length - 1, i));
        const btns = pop.querySelectorAll('button');
        btns[focusIdx]?.focus();
      };
      pop.addEventListener('keydown', (e) => {
        const btns = pop.querySelectorAll('button');
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(focusIdx + 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(focusIdx - 1); }
        if (e.key === 'Enter') { e.preventDefault(); btns[focusIdx]?.click(); }
      });
      // initial focus
      setTimeout(() => { setFocus(focusIdx); }, 0);
    } catch (e) {
      pop.innerHTML = '<div style="padding:10px 12px;color:#fca5a5;font-weight:800;">Error loading teams.</div>';
      console.warn('[team popover]', e);
    }
  })();

  // Close helper
  function close() {
    try { backdrop.remove(); } catch {}
    try { pop.remove(); } catch {}
  }

  // Also close on window resize/scroll to avoid misplacement
  window.addEventListener('resize', close, { once: true });
  window.addEventListener('scroll', close, { once: true }, true);
}



function beginEditName(idx, spanEl){
  if (viewMode !== 'ref') return;
  if (spanEl.classList.contains('editing')) return;

  spanEl.classList.add('editing');
  const input = document.createElement('input');
  input.className = 'name-input';
  input.value = state.teams[idx].name;

  spanEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(0, input.value.length);

  const finish = async (commit) => {
    const newSpan = document.createElement('span');
    newSpan.className = 'name';

    if (commit) {
      const newName = (input.value || '').trim() || state.teams[idx].name;

      // Update local state immediately for snappy UI
      state.teams[idx].name = newName;

      // If we’re an online writer, sync the name to Firebase
      if (isOnlineWriter()) {
        try {
          await txnField(`teams/${idx}/name`, () => newName);
        } catch (e) {
          console.warn('[name sync] failed, keeping local value', e);
        }
      }

      newSpan.textContent = newName;
      newSpan.addEventListener('click', (ev)=>{ ev.stopPropagation(); beginEditName(idx, newSpan); });
      input.replaceWith(newSpan);

      renderAndPersist();
      return;
    }

    // Cancel edit
    newSpan.textContent = state.teams[idx].name;
    newSpan.addEventListener('click', (ev)=>{ ev.stopPropagation(); beginEditName(idx, newSpan); });
    input.replaceWith(newSpan);
    render();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') finish(true); if(e.key==='Escape') finish(false); });
}


function beginEditValue(valEl, kind, teamIdx, opts = {}){
  if (viewMode !== 'ref') return;
  if (!valEl || valEl.classList.contains('editing')) return;
  const team = state.teams[teamIdx];
  const rules = VALUE_RULES[kind];
  if (!team || !rules) return;

  if (activeValueEditor && !opts.skipCancelExisting) activeValueEditor(false);

  const originalData = team[kind] != null ? team[kind] : '';
  const originalDisplay = kind==='girlPlay' ? fmtGirl(team.girlPlay) : String(originalData);
  const originalValue = String(originalData);
  let startingValue = originalValue;
  if (opts.restore && Object.prototype.hasOwnProperty.call(opts.restore, 'value')) {
    startingValue = opts.restore.value;
  }

  valEl.classList.add('editing');
  valEl.textContent = '';

  const input = document.createElement('input');
  input.className = 'val-input';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.pattern = '[0-9]*';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = startingValue;
  input.setAttribute('aria-label', `${rules.label} for ${team.name}`);
  valEl.appendChild(input);

  const errorId = `val-error-${teamIdx}-${kind}`;
  input.setAttribute('aria-describedby', errorId);
  const error = document.createElement('div');
  error.className = 'val-error';
  error.id = errorId;
  error.setAttribute('role','alert');
  error.setAttribute('aria-live','polite');
  valEl.appendChild(error);

  const focusInput = () => {
    input.focus();
    if (opts.restore && opts.restore.selectionStart != null) {
      const restoreStart = opts.restore.selectionStart;
      const restoreEnd = opts.restore.selectionEnd != null ? opts.restore.selectionEnd : restoreStart;
      try { input.setSelectionRange(restoreStart, restoreEnd); }
      catch {}
    } else if (typeof input.select === 'function') {
      input.select();
    }
  };
  const showError = (msg) => {
    error.textContent = msg || '';
    error.classList.toggle('visible', !!msg);
    input.classList.toggle('invalid', !!msg);
  };

  let closed = false;
  const finish = (commit) => {
    if (closed) return;
    if (!commit){
      closed = true;
      activeValueEditor = null;
      showError('');
      valEl.classList.remove('editing');
      valEl.textContent = originalDisplay;
      return;
    }

    const raw = input.value.trim();
    if (!raw){ showError('Enter a number'); focusInput(); return; }
    if (!/^-?\d+$/.test(raw)){ showError('Use whole numbers only'); focusInput(); return; }
    const nextVal = parseInt(raw, 10);
    if (Number.isNaN(nextVal)){ showError('Enter a number'); focusInput(); return; }
    if (rules.min != null && nextVal < rules.min){ showError(rules.minMessage || `${rules.label} must be ≥ ${rules.min}`); focusInput(); return; }
    if (rules.max != null && nextVal > rules.max){ showError(rules.maxMessage || `${rules.label} must be ≤ ${rules.max}`); focusInput(); return; }

    closed = true;
    activeValueEditor = null;
    showError('');
    team[kind] = nextVal;
    valEl.classList.remove('editing');
    valEl.textContent = kind==='girlPlay' ? fmtGirl(nextVal) : String(nextVal);
    renderAndPersist();
  };

  activeValueEditor = finish;

  input.addEventListener('click', (e)=>e.stopPropagation());
  input.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
    else if (e.key === 'Escape'){ e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', ()=>{
    setTimeout(()=>{
      if (!valEl.isConnected) return;
      const active = document.activeElement;
      if (!valEl.contains(active)) finish(true);
    }, 20);
  });
  input.addEventListener('input', ()=>{ if (error.textContent) showError(''); });

  setTimeout(()=>{ focusInput(); }, 0);
}

/**********************
 * Global Controls
 **********************/
$('#g_score6').addEventListener('click', ()=>{
  if (isOnlineWriter()) {
    txnField(`teams/${state.activeTeam}/score`, v => (v|0) + 6);
  } else if (viewMode === 'ref') {
    state.teams[state.activeTeam].score += 6; renderAndPersist();
  }
});

$('#g_score1').addEventListener('click', ()=>{
  if (isOnlineWriter()) {
    txnField(`teams/${state.activeTeam}/score`, v => (v|0) + 1);
  } else if (viewMode === 'ref') {
    state.teams[state.activeTeam].score += 1; renderAndPersist();
  }
});

$('#g_scorem1').addEventListener('click', ()=>{
  if (isOnlineWriter()) {
    txnField(`teams/${state.activeTeam}/score`, v => Math.max(0, (v|0) - 1));
  } else if (viewMode === 'ref') {
    const t = state.teams[state.activeTeam]; t.score = Math.max(0, t.score - 1); renderAndPersist();
  }
});


function performGuyPlay(){
  mutateTeam(state.activeTeam, team => {
    team.downs = wrapDown((team.downs|0) + 1);
    team.girlPlay = Math.max(0, (team.girlPlay|0) - 1);
  });
}

function performGirlPlay(){
  mutateTeam(state.activeTeam, team => {
    team.girlPlay = 2;
    team.downs = wrapDown((team.downs|0) + 1);
  });
}
window.performGuyPlay = performGuyPlay;
window.performGirlPlay = performGirlPlay;

function adjustDown(teamIdx, delta){
  mutateTeam(teamIdx, team => {
    const current = team.downs != null ? team.downs : 1;
    team.downs = clampDown(current + delta);
  });
}

function adjustGirl(teamIdx, delta){
  mutateTeam(teamIdx, team => {
    const current = team.girlPlay != null ? team.girlPlay : 2;
    team.girlPlay = clampGirl(current + delta);
  });
}

function adjustTimeout(teamIdx, delta){
  mutateTeam(teamIdx, team => {
    const current = team.timeouts != null ? team.timeouts : 3;
    team.timeouts = clampTimeouts(current + delta);
  });
}

function adjustBlitz(teamIdx, delta){
  mutateTeam(teamIdx, team => {
    const current = team.rushes != null ? team.rushes : 2;
    team.rushes = clampRushes(current + delta);
  });
}


// First Down
$('#g_downReset').addEventListener('click', ()=>{
  mutateTeam(state.activeTeam, team => { team.downs = 1; });
});


// Turnover
$('#g_turnover').addEventListener('click', ()=>{
  if (isOnlineWriter()) {
    txnState(s => {
      const cur = s.activeTeam;
      const next = cur === 0 ? 1 : 0;
      s.teams[cur].downs = 1;
      s.teams[cur].girlPlay = 2;
      s.activeTeam = next;
      return s;
    });
  } else if (viewMode === 'ref') {
    const cur = state.activeTeam;
    state.teams[cur].downs = 1;
    state.teams[cur].girlPlay = 2;
    state.activeTeam = cur === 0 ? 1 : 0;
    renderAndPersist();
  }
});


const downMinus = $('#downMinus');
if (downMinus) downMinus.addEventListener('click', ()=> adjustDown(state.activeTeam, -1));
const downPlus = $('#downPlus');
if (downPlus) downPlus.addEventListener('click', ()=> adjustDown(state.activeTeam, 1));

const blitzHome = $('#blitzHome');
if (blitzHome) blitzHome.addEventListener('click', ()=> adjustBlitz(0, -1));
const blitzAway = $('#blitzAway');
if (blitzAway) blitzAway.addEventListener('click', ()=> adjustBlitz(1, -1));

document.querySelectorAll('.adjust-btn').forEach(btn => {
  btn.addEventListener('click', ()=>{
    if (viewMode !== 'ref') return;
    const kind = btn.dataset.kind;
    const delta = parseInt(btn.dataset.adjust, 10) || 0;
    const activeIdx = state.activeTeam;
    if (kind === 'timeouts') adjustTimeout(activeIdx, delta);
    else if (kind === 'rushes') adjustBlitz(activeIdx, delta);
    else if (kind === 'girlPlay') adjustGirl(activeIdx, delta);
    else if (kind === 'downs') adjustDown(activeIdx, delta);
  });
});


/**********************
 * Clock, Timeout & Halftime
 **********************/
function clearTimeoutMode(){
  state.timeout.running = false;
  state.timeout.secondsRemaining = 0;
  state.timeout.secondsAtStart = null;
  state.timeout.startedAtMs = null;
  state.timeout.team = null;
}
function clearHalftimeMode(){
  state.halftime.running = false;
  state.halftime.secondsRemaining = 0;
  state.halftime.secondsAtStart = null;
  state.halftime.startedAtMs = null;
}

function syncTimersWithState(){
  const needsTick = state.game.running || state.timeout.running || state.halftime.running;
  if (needsTick){
    if (!uiTickTimer){
      uiTickTimer = setInterval(()=>{ render(); }, 1000);
    }
  } else if (uiTickTimer){
    clearInterval(uiTickTimer);
    uiTickTimer = null;
  }
}

function nowMs(){ return Date.now(); }

function getRemainingSeconds(game){
  if (game.running && Number.isFinite(game.targetEndAt) && game.targetEndAt > 0){
    return Math.max(0, Math.ceil((game.targetEndAt - nowMs())/1000));
  }
  return Math.max(0, game.seconds|0);
}

// Visual refresh loop for the clock; does NOT mutate state
let viewTick = null;

function ensureViewTicker(){
  if (viewTick) return;
  viewTick = setInterval(() => {
    if (state.game.running) {
      // re-render so #gameTime updates from getRemainingSeconds()
      render();
    } else {
      // not running; stop ticking to save work
      clearInterval(viewTick);
      viewTick = null;
    }
  }, 250); // smooth enough; change to 500 if you prefer
}


function startClock(){
  if (viewMode !== 'ref') return;
  const now = Date.now();
  reconcileAll(now);

  clearTimeoutMode();
  clearHalftimeMode();

  state.game.seconds = coerceSeconds(state.game.seconds != null ? state.game.seconds : defaultState().game.seconds);
  state.game.secondsAtStart = state.game.seconds;
  state.game.startedAtMs = now;
  state.game.running = true;

  renderAndPersist();

<<<<<<< Updated upstream
  if (isOnlineWriter()){
    txnState(s => {
      reconcileCountdown(now, s.game);
      reconcileCountdown(now, s.timeout);
      reconcileCountdown(now, s.halftime);
      s.timeout.running = false;
      s.timeout.team = null;
      s.timeout.secondsRemaining = 0;
      s.timeout.secondsAtStart = null;
      s.timeout.startedAtMs = null;
      s.halftime.running = false;
      s.halftime.secondsRemaining = 0;
      s.halftime.secondsAtStart = null;
      s.halftime.startedAtMs = null;
      const currentSeconds = coerceSeconds(s.game.seconds != null ? s.game.seconds : defaultState().game.seconds);
      s.game.seconds = currentSeconds;
      s.game.secondsAtStart = currentSeconds;
      s.game.startedAtMs = now;
=======
  // How much time is left right now (works whether paused or running)
  const current = getRemainingSeconds(state.game); // uses targetEndAt/seconds as defined earlier

  if (isOnlineWriter()){
    // Clear any special modes and set running + targetEndAt in Firebase
    txnState(s => {
      s.game.timeoutSecondsRemaining = 0;
      s.game.timeoutTeam = null;
      s.game.halftimeSecondsRemaining = 0;

>>>>>>> Stashed changes
      s.game.running = true;
      s.game.targetEndAt = nowMs() + current * 1000;  // <-- absolute countdown target
      s.game.seconds = current;                       // keep for compatibility with readers
    });
<<<<<<< Updated upstream
  }
}

function pauseClock(){
  const now = Date.now();
  reconcileCountdown(now, state.game);
  state.game.running=false;
  state.game.startedAtMs = null;
  state.game.secondsAtStart = null;
  renderAndPersist();

  if (isOnlineWriter()){
    txnState(s => {
      reconcileCountdown(now, s.game);
      s.game.running = false;
      s.game.startedAtMs = null;
      s.game.secondsAtStart = null;
    });
  }
=======

    // Ensure no legacy local tickers are running
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    ensureViewTicker(); // just re-renders UI; does NOT mutate time
    return;
  }

  // Offline / viewer-local path (no Firebase write)
  if (state.game.timeoutSecondsRemaining > 0) clearTimeoutMode();
  if (state.game.halftimeSecondsRemaining > 0) clearHalftimeMode();

  state.game.running = true;
  state.game.targetEndAt = nowMs() + current * 1000;   // <-- local absolute target
  renderAndPersist();                                   // persists to local + remote if applicable

  // Make sure no old decrement loop is still running
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  ensureViewTicker(); // visual updates only
}

function pauseClock(){
  // Snap current remaining into seconds and clear target
  const rem = getRemainingSeconds(state.game);
  state.game.running = false;
  state.game.targetEndAt = 0;
  state.game.seconds = rem;

  renderAndPersist(); // your existing function that saves + renders
}

function toggleStartPause(){
  if (state.game.running) pauseClock();
  else startClock();
>>>>>>> Stashed changes
}

function toggleStartPause(){
  if (viewMode !== 'ref') return;
  state.game.running ? pauseClock() : startClock();
}


function startTimeout(teamIdx){
  if (viewMode !== 'ref') return;
  const team = state.teams[teamIdx];
  if (!team || (team.timeouts|0) <= 0) return;

  const now = Date.now();
  reconcileAll(now);

  if (state.timeout.running) return;

  team.timeouts = Math.max(0, (team.timeouts|0) - 1);

  reconcileCountdown(now, state.game);
  state.game.running = false;
  state.game.startedAtMs = null;
  state.game.secondsAtStart = null;

  clearHalftimeMode();

  const duration = 30;
  state.timeout.team = teamIdx;
  state.timeout.secondsRemaining = duration;
  state.timeout.secondsAtStart = duration;
  state.timeout.startedAtMs = now;
  state.timeout.running = true;

  renderAndPersist();

  if (isOnlineWriter()){
    txnState(s => {
      const remoteTeam = s.teams && s.teams[teamIdx];
      if (!remoteTeam || (remoteTeam.timeouts|0) <= 0) return s;
      reconcileCountdown(now, s.game);
      reconcileCountdown(now, s.timeout);
      reconcileCountdown(now, s.halftime);
      remoteTeam.timeouts = Math.max(0, (remoteTeam.timeouts|0) - 1);
      s.game.running = false;
      s.game.startedAtMs = null;
      s.game.secondsAtStart = null;
      s.halftime.running = false;
      s.halftime.secondsRemaining = 0;
      s.halftime.secondsAtStart = null;
      s.halftime.startedAtMs = null;
      s.timeout.team = teamIdx;
      s.timeout.secondsRemaining = duration;
      s.timeout.secondsAtStart = duration;
      s.timeout.startedAtMs = now;
      s.timeout.running = true;
    });
  }
}

function startHalftime(){
  if (viewMode !== 'ref') return;
  const now = Date.now();
  reconcileAll(now);

  clearTimeoutMode();
  reconcileCountdown(now, state.game);
  state.game.running = false;
  state.game.startedAtMs = null;
  state.game.secondsAtStart = null;

  state.teams.forEach(t=>{ t.downs=1; t.girlPlay=2; t.rushes=2; t.timeouts=3; });
  state.game.seconds = 25*60;

  const duration = 300;
  state.halftime.secondsRemaining = duration;
  state.halftime.secondsAtStart = duration;
  state.halftime.startedAtMs = now;
  state.halftime.running = true;

  renderAndPersist();

  if (isOnlineWriter()){
    txnState(s => {
      reconcileCountdown(now, s.game);
      reconcileCountdown(now, s.timeout);
      reconcileCountdown(now, s.halftime);
      s.timeout.running = false;
      s.timeout.team = null;
      s.timeout.secondsRemaining = 0;
      s.timeout.secondsAtStart = null;
      s.timeout.startedAtMs = null;
      s.game.running = false;
      s.game.startedAtMs = null;
      s.game.secondsAtStart = null;
      s.game.seconds = 25*60;
      const teams = Array.isArray(s.teams) ? s.teams : [];
      teams.forEach(t=>{
        if (!t) return;
        t.downs = 1;
        t.girlPlay = 2;
        t.rushes = 2;
        t.timeouts = 3;
      });
      s.halftime.secondsRemaining = duration;
      s.halftime.secondsAtStart = duration;
      s.halftime.startedAtMs = now;
      s.halftime.running = true;
    });
  }
}

$('#clockStartPause').addEventListener('click', toggleStartPause);
$('#timeoutHome').addEventListener('click', ()=> startTimeout(0));
$('#timeoutAway').addEventListener('click', ()=> startTimeout(1));
const halftimeBtn = $('#halftimeBtn');
if (halftimeBtn) halftimeBtn.addEventListener('click', startHalftime);

// Edit time when paused
$('#gameTime').addEventListener('click', ()=>{
  if (viewMode !== 'ref') return;
  const timeoutActive = state.timeout.running || (state.timeout.secondsRemaining|0) > 0;
  const halftimeActive = state.halftime.running || (state.halftime.secondsRemaining|0) > 0;
  if (state.game.running || timeoutActive || halftimeActive) return;
  const current = fmt(state.game.seconds);
  const input = prompt('Set game clock (MM:SS):', current);
  if (!input) return;
  const m = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return alert('Please enter time as MM:SS');
  const mm = parseInt(m[1],10), ss = parseInt(m[2],10);
  if (ss>59) return alert('Seconds must be 00-59');
  const next = Math.max(0, mm*60 + ss);

  if (isOnlineWriter()){
    txnField('game/seconds', () => next);
  } else {
    state.game.seconds = next;
    state.game.secondsAtStart = null;
    state.game.startedAtMs = null;
    renderAndPersist();
  }
});

/**********************
 * Menu & View Switching
 **********************/
const menuToggleBtn = $('#menuToggle');
const menuDrawer = $('#menuDrawer');
const menuBackdrop = $('#menuBackdrop');

function openMenu(){
  document.body.classList.add('menu-open');
  if (menuDrawer) menuDrawer.setAttribute('aria-hidden', 'false');
  if (menuBackdrop) menuBackdrop.setAttribute('aria-hidden', 'false');
  if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'true');
  populateSyncForm();
}

function closeMenu(){
  document.body.classList.remove('menu-open');
  if (menuDrawer) menuDrawer.setAttribute('aria-hidden', 'true');
  if (menuBackdrop) menuBackdrop.setAttribute('aria-hidden', 'true');
  if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'false');
}

function toggleMenu(){
  if (document.body.classList.contains('menu-open')) closeMenu();
  else openMenu();
}

function setViewMode(mode){
  const next = (mode === 'player' || mode === 'scoreboard') ? 'player' : 'ref';
  if (viewMode === next) return;
  const previous = viewMode;
  viewMode = next;
  saveViewMode(viewMode);
  if (viewMode !== 'ref' && remoteSync.pushTimer){
    clearTimeout(remoteSync.pushTimer);
    remoteSync.pushTimer = null;
  }
  if (viewMode === 'player') {
    lockPlayerOrientation();
  } else if (previous === 'player') {
    unlockPlayerOrientation();
  }
  closeMenu();
  render();
  renderPage();
}

if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleMenu);
if (menuBackdrop) menuBackdrop.addEventListener('click', closeMenu);
document.addEventListener('keydown', (ev)=>{ if (ev.key === 'Escape') closeMenu(); });

$$('#menuDrawer .drawer-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view) setViewMode(btn.dataset.view);
    if (btn.dataset.page) setPage(btn.dataset.page);
  });
});

// === SDK form wiring (Game code only) ===
(function wireSyncForm(){
  const formEl = document.getElementById('syncForm');
  const gameInput = document.getElementById('syncGame');

  if (!formEl) return;

  formEl.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const game = (gameInput?.value || '').trim();
    if (!game) { alert('Enter a game code.'); return; }

    // Save just the game code
    remoteSync.config = { game };
    try { saveRemoteConfig(remoteSync.config); } catch {}
    updateRemoteStatus();

    console.log('[sync] connecting to game:', game);
    try {
      await connectRemote();
    } catch (e) {
      console.error('[sync] connect error', e);
      remoteSync.status = 'error';
      remoteSync.lastError = e;
      updateRemoteStatus();
      return;
    }

    // Close the drawer only after we try to connect
    try { closeMenu(); } catch {}
  });

  // Disconnect button
  const disconnectBtn = document.getElementById('syncDisconnect');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      disconnectRemote();
      remoteSync.config = null;
      try { clearRemoteConfig(); } catch {}
      remoteSync.status = 'idle';
      updateRemoteStatus();
    });
  }
})();


const disconnectBtn = $('#syncDisconnect');
if (disconnectBtn){
  disconnectBtn.addEventListener('click', ()=>{
    disconnectRemote();
    remoteSync.config = null;
    clearRemoteConfig();
    remoteSync.status = 'idle';
    updateRemoteStatus();
    populateSyncForm();
  });
}

const addTeamBtn = $('#teamsAddTeam');
if (addTeamBtn) addTeamBtn.addEventListener('click', handleAddTeam);

const addPlayerBtn = $('#teamsAddPlayer');
if (addPlayerBtn) addPlayerBtn.addEventListener('click', handleAddPlayer);

console.log('About to render()');
render();

/**********************
 * Init
 **********************/
render();
updateRemoteStatus();
populateSyncForm();
if (remoteConfigured()) connectRemote();

/**********************
 * Self-tests (run with #test)
 **********************/
(function devTests(){
  if (location.hash !== '#test') return; console.group('[Self Tests]');
  try {
    const size = JSON.stringify(serializeState(state)).length; console.log('Persist size (bytes):', size); console.assert(size < 100000, 'payload <100KB');

    // Debounced writes
    let writes = 0; const _setItem = localStorage.setItem.bind(localStorage); localStorage.setItem = (k,v)=>{ if(k===STORAGE_KEY) writes++; _setItem(k,v); };
    for (let i=0;i<20;i++){ state.teams[0].score++; scheduleSave(); }
    setTimeout(()=>{ console.log('Debounced writes (<=5 expected):', writes); localStorage.setItem = _setItem; }, 1200);

    // Timeout -> Start behavior
    startTimeout(0);
    setTimeout(()=>{
      console.assert(state.timeout.secondsRemaining>0, 'timeout should be running');
      toggleStartPause();
      console.assert(state.timeout.secondsRemaining===0, 'timeout cleared on Start');
      console.assert(state.game.running===true, 'game clock should be running after Start');
      pauseClock();

      // Rush affects defense
      state.activeTeam = 0; const beforeDef = state.teams[1].rushes; adjustBlitz(1, -1);
      console.assert(state.teams[1].rushes === Math.max(0, beforeDef-1), 'Rush decrements defending');

      // v9 Girl Play semantics
      state.activeTeam = 0; state.teams[0].girlPlay = 2; state.teams[0].downs = 1; // reset
      performGuyPlay(); // expect 1
      console.assert(state.teams[0].girlPlay === 1, 'Guy Play decrements to 1');
      performGuyPlay(); // expect 0
      console.assert(state.teams[0].girlPlay === 0, 'Guy Play decrements to 0 (Now)');
      performGuyPlay(); // stays 0
      console.assert(state.teams[0].girlPlay === 0, 'Guy Play stays at 0');
      performGirlPlay(); // reset to 2
      console.assert(state.teams[0].girlPlay === 2, 'Girl Play button resets to 2');

      // Halftime resets girl counter to 2
      startHalftime();
      console.assert(state.teams.every(t=> t.girlPlay===2), 'Halftime sets Girl Play In to 2');
      toggleStartPause(); console.assert(state.halftime.secondsRemaining===0, 'halftime cleared on Start'); pauseClock();

      // Editable girl counter (note: direct call relies on implementation; this stays inside try/catch)
      const savedPrompt = window.prompt; window.prompt = ()=> '0';
      try { beginEditValue('girlPlay',0); } catch {}
      window.prompt = savedPrompt;

      console.groupEnd();
    }, 150);
  } catch (e) { console.warn('Self tests error:', e); console.groupEnd(); }
})();
