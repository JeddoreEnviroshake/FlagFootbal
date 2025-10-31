(function(exports){
  'use strict';

  function mutateTeam(teamIdx, mutator){
    if (exports.viewMode !== 'ref') return false;
    if (teamIdx == null || teamIdx < 0) return false;
    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      exports.txnState(s => {
        if (!s || !Array.isArray(s.teams) || !s.teams[teamIdx]) return s;
        mutator(s.teams[teamIdx]);
        return s;
      });
      return true;
    }

    const team = exports.state.teams[teamIdx];
    if (!team) return false;
    mutator(team);
    exports.renderAndPersist();
    return true;
  }

  function beginEditName(idx, spanEl){
    if (exports.viewMode !== 'ref') return;
    if (spanEl.classList.contains('editing')) return;

    spanEl.classList.add('editing');
    const input = document.createElement('input');
    input.className = 'name-input';
    input.value = exports.state.teams[idx].name;

    spanEl.replaceWith(input);
    input.focus();
    input.setSelectionRange(0, input.value.length);

    const finish = async (commit) => {
      const newSpan = document.createElement('span');
      newSpan.className = 'name';

      if (commit) {
        const newName = (input.value || '').trim() || exports.state.teams[idx].name;
        exports.state.teams[idx].name = newName;

        if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()) {
          try {
            await exports.txnField(`teams/${idx}/name`, () => newName);
          } catch (e) {
            console.warn('[name sync] failed, keeping local value', e);
          }
        }

        newSpan.textContent = newName;
        newSpan.addEventListener('click', (ev)=>{ ev.stopPropagation(); beginEditName(idx, newSpan); });
        input.replaceWith(newSpan);

        exports.renderAndPersist();
        return;
      }

      newSpan.textContent = exports.state.teams[idx].name;
      newSpan.addEventListener('click', (ev)=>{ ev.stopPropagation(); beginEditName(idx, newSpan); });
      input.replaceWith(newSpan);
      exports.render();
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') finish(true); if(e.key==='Escape') finish(false); });
  }

  function beginEditValue(valEl, kind, teamIdx, opts = {}){
    if (exports.viewMode !== 'ref') return;
    if (!valEl || valEl.classList.contains('editing')) return;
    const team = exports.state.teams[teamIdx];
    const rules = exports.VALUE_RULES[kind];
    if (!team || !rules) return;

    if (exports.activeValueEditor && !opts.skipCancelExisting) exports.activeValueEditor(false);

    const originalData = team[kind] != null ? team[kind] : '';
    const originalDisplay = kind==='girlPlay' ? exports.fmtGirl(team.girlPlay) : String(originalData);
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
        exports.activeValueEditor = null;
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
      exports.activeValueEditor = null;
      showError('');
      team[kind] = nextVal;
      valEl.classList.remove('editing');
      valEl.textContent = kind==='girlPlay' ? exports.fmtGirl(nextVal) : String(nextVal);
      exports.renderAndPersist();
    };

    exports.activeValueEditor = finish;

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

  function adjustDown(teamIdx, delta){
    mutateTeam(teamIdx, team => {
      const current = team.downs != null ? team.downs : 1;
      team.downs = exports.clampDown(current + delta);
    });
  }

  function adjustGirl(teamIdx, delta){
    mutateTeam(teamIdx, team => {
      const current = team.girlPlay != null ? team.girlPlay : 2;
      team.girlPlay = exports.clampGirl(current + delta);
    });
  }

  function adjustTimeout(teamIdx, delta){
    mutateTeam(teamIdx, team => {
      const current = team.timeouts != null ? team.timeouts : 3;
      team.timeouts = exports.clampTimeouts(current + delta);
    });
  }

  function adjustBlitz(teamIdx, delta){
    mutateTeam(teamIdx, team => {
      const current = team.rushes != null ? team.rushes : 2;
      team.rushes = exports.clampRushes(current + delta);
    });
  }

  function performGuyPlay(){
    mutateTeam(exports.state.activeTeam, team => {
      team.downs = exports.wrapDown((team.downs|0) + 1);
      team.girlPlay = Math.max(0, (team.girlPlay|0) - 1);
    });
  }

  function performGirlPlay(){
    mutateTeam(exports.state.activeTeam, team => {
      team.girlPlay = 2;
      team.downs = exports.wrapDown((team.downs|0) + 1);
    });
  }

  window.performGuyPlay = performGuyPlay;
  window.performGirlPlay = performGirlPlay;

  function clearTimeoutMode(){
    exports.state.timeout.running = false;
    exports.state.timeout.secondsRemaining = 0;
    exports.state.timeout.secondsAtStart = null;
    exports.state.timeout.startedAtMs = null;
    exports.state.timeout.team = null;
  }
  function clearHalftimeMode(){
    exports.state.halftime.running = false;
    exports.state.halftime.secondsRemaining = 0;
    exports.state.halftime.secondsAtStart = null;
    exports.state.halftime.startedAtMs = null;
  }

  function startClock(){
    if (exports.viewMode !== 'ref') return;
    const now = Date.now();
    exports.reconcileAll(now);

    clearTimeoutMode();
    clearHalftimeMode();

    exports.state.game.seconds = exports.coerceSeconds(exports.state.game.seconds != null ? exports.state.game.seconds : exports.defaultState().game.seconds);
    exports.state.game.secondsAtStart = exports.state.game.seconds;
    exports.state.game.startedAtMs = now;
    exports.state.game.running = true;

    exports.renderAndPersist();

    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      exports.txnState(s => {
        exports.reconcileCountdown(now, s.game);
        exports.reconcileCountdown(now, s.timeout);
        exports.reconcileCountdown(now, s.halftime);
        s.timeout.running = false;
        s.timeout.team = null;
        s.timeout.secondsRemaining = 0;
        s.timeout.secondsAtStart = null;
        s.timeout.startedAtMs = null;
        s.halftime.running = false;
        s.halftime.secondsRemaining = 0;
        s.halftime.secondsAtStart = null;
        s.halftime.startedAtMs = null;
        const currentSeconds = exports.coerceSeconds(s.game.seconds != null ? s.game.seconds : exports.defaultState().game.seconds);
        s.game.seconds = currentSeconds;
        s.game.secondsAtStart = currentSeconds;
        s.game.startedAtMs = now;
        s.game.running = true;
      });
    }
  }

  function pauseClock(){
    const now = Date.now();
    exports.reconcileCountdown(now, exports.state.game);
    exports.state.game.running=false;
    exports.state.game.startedAtMs = null;
    exports.state.game.secondsAtStart = null;
    exports.renderAndPersist();

    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      exports.txnState(s => {
        exports.reconcileCountdown(now, s.game);
        s.game.running = false;
        s.game.startedAtMs = null;
        s.game.secondsAtStart = null;
      });
    }
  }

  function toggleStartPause(){
    if (exports.viewMode !== 'ref') return;
    exports.state.game.running ? pauseClock() : startClock();
  }

  function startTimeout(teamIdx){
    if (exports.viewMode !== 'ref') return;
    const team = exports.state.teams[teamIdx];
    if (!team || (team.timeouts|0) <= 0) return;

    const now = Date.now();
    exports.reconcileAll(now);

    if (exports.state.timeout.running) return;

    team.timeouts = Math.max(0, (team.timeouts|0) - 1);

    exports.reconcileCountdown(now, exports.state.game);
    exports.state.game.running = false;
    exports.state.game.startedAtMs = null;
    exports.state.game.secondsAtStart = null;

    clearHalftimeMode();

    const duration = 30;
    exports.state.timeout.team = teamIdx;
    exports.state.timeout.secondsRemaining = duration;
    exports.state.timeout.secondsAtStart = duration;
    exports.state.timeout.startedAtMs = now;
    exports.state.timeout.running = true;

    exports.renderAndPersist();

    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      exports.txnState(s => {
        const remoteTeam = s.teams && s.teams[teamIdx];
        if (!remoteTeam || (remoteTeam.timeouts|0) <= 0) return s;
        exports.reconcileCountdown(now, s.game);
        exports.reconcileCountdown(now, s.timeout);
        exports.reconcileCountdown(now, s.halftime);
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
    if (exports.viewMode !== 'ref') return;
    const now = Date.now();
    exports.reconcileAll(now);

    clearTimeoutMode();
    exports.reconcileCountdown(now, exports.state.game);
    exports.state.game.running = false;
    exports.state.game.startedAtMs = null;
    exports.state.game.secondsAtStart = null;

    exports.state.teams.forEach(t=>{ t.downs=1; t.girlPlay=2; t.rushes=2; t.timeouts=3; });
    exports.state.game.seconds = 25*60;

    const duration = 300;
    exports.state.halftime.secondsRemaining = duration;
    exports.state.halftime.secondsAtStart = duration;
    exports.state.halftime.startedAtMs = now;
    exports.state.halftime.running = true;

    exports.renderAndPersist();

    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      exports.txnState(s => {
        exports.reconcileCountdown(now, s.game);
        exports.reconcileCountdown(now, s.timeout);
        exports.reconcileCountdown(now, s.halftime);
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

  function setPage(page){
    const next = page === 'teams' ? 'teams' : 'game';
    if (exports.currentPage !== next) {
      exports.currentPage = next;
    }
    exports.renderPage();
    closeMenu();
  }

  function openMenu(){
    const menuDrawer = exports.$ ? exports.$('#menuDrawer') : null;
    const menuBackdrop = exports.$ ? exports.$('#menuBackdrop') : null;
    const menuToggleBtn = exports.$ ? exports.$('#menuToggle') : null;
    document.body.classList.add('menu-open');
    if (menuDrawer) menuDrawer.setAttribute('aria-hidden', 'false');
    if (menuBackdrop) menuBackdrop.setAttribute('aria-hidden', 'false');
    if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'true');
    if (typeof exports.populateSyncForm === 'function') exports.populateSyncForm();
  }

  function closeMenu(){
    const menuDrawer = exports.$ ? exports.$('#menuDrawer') : null;
    const menuBackdrop = exports.$ ? exports.$('#menuBackdrop') : null;
    const menuToggleBtn = exports.$ ? exports.$('#menuToggle') : null;
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
    if (exports.viewMode === next) return;
    const previous = exports.viewMode;
    exports.viewMode = next;
    exports.saveViewMode(exports.viewMode);
    if (exports.viewMode !== 'ref' && exports.remoteSync.pushTimer){
      clearTimeout(exports.remoteSync.pushTimer);
      exports.remoteSync.pushTimer = null;
    }
    if (exports.viewMode === 'player') {
      exports.lockPlayerOrientation();
    } else if (previous === 'player') {
      exports.unlockPlayerOrientation();
    }
    closeMenu();
    exports.render();
    exports.renderPage();
  }

  function bindScoreButtons(){
    const score6 = exports.$ ? exports.$('#g_score6') : null;
    if (score6) {
      score6.addEventListener('click', ()=>{
        if (exports.isOnlineWriter()) {
          exports.txnField(`teams/${exports.state.activeTeam}/score`, v => (v|0) + 6);
        } else if (exports.viewMode === 'ref') {
          exports.state.teams[exports.state.activeTeam].score += 6; exports.renderAndPersist();
        }
      });
    }
    const score1 = exports.$ ? exports.$('#g_score1') : null;
    if (score1) {
      score1.addEventListener('click', ()=>{
        if (exports.isOnlineWriter()) {
          exports.txnField(`teams/${exports.state.activeTeam}/score`, v => (v|0) + 1);
        } else if (exports.viewMode === 'ref') {
          exports.state.teams[exports.state.activeTeam].score += 1; exports.renderAndPersist();
        }
      });
    }
    const scorem1 = exports.$ ? exports.$('#g_scorem1') : null;
    if (scorem1) {
      scorem1.addEventListener('click', ()=>{
        if (exports.isOnlineWriter()) {
          exports.txnField(`teams/${exports.state.activeTeam}/score`, v => Math.max(0, (v|0) - 1));
        } else if (exports.viewMode === 'ref') {
          const t = exports.state.teams[exports.state.activeTeam]; t.score = Math.max(0, t.score - 1); exports.renderAndPersist();
        }
      });
    }

    const downReset = exports.$ ? exports.$('#g_downReset') : null;
    if (downReset) downReset.addEventListener('click', ()=>{ mutateTeam(exports.state.activeTeam, team => { team.downs = 1; }); });

    const turnover = exports.$ ? exports.$('#g_turnover') : null;
    if (turnover) {
      turnover.addEventListener('click', ()=>{
        if (exports.isOnlineWriter()) {
          exports.txnState(s => {
            const cur = s.activeTeam;
            const next = cur === 0 ? 1 : 0;
            s.activeTeam = next;
            const curTeam = s.teams && s.teams[cur];
            const nextTeam = s.teams && s.teams[next];
            if (curTeam) {
              curTeam.downs = 1;
              curTeam.girlPlay = 2;
            }
            if (nextTeam) {
              nextTeam.downs = 1;
              nextTeam.girlPlay = 2;
            }
            s.timeout.running = false;
            s.timeout.team = null;
            s.timeout.secondsRemaining = 0;
            s.timeout.secondsAtStart = null;
            s.timeout.startedAtMs = null;
            return s;
          });
        } else {
          const cur = exports.state.activeTeam;
          const next = cur === 0 ? 1 : 0;
          exports.state.activeTeam = next;
          const curTeam = exports.state.teams[cur];
          const nextTeam = exports.state.teams[next];
          if (curTeam) {
            curTeam.downs = 1;
            curTeam.girlPlay = 2;
          }
          if (nextTeam) {
            nextTeam.downs = 1;
            nextTeam.girlPlay = 2;
          }
          exports.state.timeout.running = false;
          exports.state.timeout.team = null;
          exports.state.timeout.secondsRemaining = 0;
          exports.state.timeout.secondsAtStart = null;
          exports.state.timeout.startedAtMs = null;
          exports.renderAndPersist();
        }
      });
    }
  }

  function bindAdjustButtons(){
    document.querySelectorAll('.adjust-btn').forEach(btn => {
      btn.addEventListener('click', ()=>{
        if (exports.viewMode !== 'ref') return;
        const kind = btn.dataset.kind;
        const delta = parseInt(btn.dataset.adjust, 10) || 0;
        const activeIdx = exports.state.activeTeam;
        if (kind === 'timeouts') adjustTimeout(activeIdx, delta);
        else if (kind === 'rushes') adjustBlitz(activeIdx, delta);
        else if (kind === 'girlPlay') adjustGirl(activeIdx, delta);
        else if (kind === 'downs') adjustDown(activeIdx, delta);
      });
    });
  }

  function bindClockControls(){
    const startPause = exports.$ ? exports.$('#clockStartPause') : null;
    if (startPause) startPause.addEventListener('click', toggleStartPause);
    const timeoutHome = exports.$ ? exports.$('#timeoutHome') : null;
    if (timeoutHome) timeoutHome.addEventListener('click', ()=> startTimeout(0));
    const timeoutAway = exports.$ ? exports.$('#timeoutAway') : null;
    if (timeoutAway) timeoutAway.addEventListener('click', ()=> startTimeout(1));
    const blitzHome = exports.$ ? exports.$('#blitzHome') : null;
    if (blitzHome) blitzHome.addEventListener('click', ()=> adjustBlitz(0, -1));
    const blitzAway = exports.$ ? exports.$('#blitzAway') : null;
    if (blitzAway) blitzAway.addEventListener('click', ()=> adjustBlitz(1, -1));
    const halftimeBtn = exports.$ ? exports.$('#halftimeBtn') : null;
    if (halftimeBtn) halftimeBtn.addEventListener('click', startHalftime);
    const gameTime = exports.$ ? exports.$('#gameTime') : null;
    if (gameTime) {
      gameTime.addEventListener('click', ()=>{
        if (exports.viewMode !== 'ref') return;
        const timeoutActive = exports.state.timeout.running || (exports.state.timeout.secondsRemaining|0) > 0;
        const halftimeActive = exports.state.halftime.running || (exports.state.halftime.secondsRemaining|0) > 0;
        if (exports.state.game.running || timeoutActive || halftimeActive) return;
        const current = exports.fmt(exports.state.game.seconds);
        const input = prompt('Set game clock (MM:SS):', current);
        if (!input) return;
        const m = input.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return alert('Please enter time as MM:SS');
        const mm = parseInt(m[1],10), ss = parseInt(m[2],10);
        if (ss>59) return alert('Seconds must be 00-59');
        const next = Math.max(0, mm*60 + ss);

        if (exports.isOnlineWriter()){
          exports.txnField('game/seconds', () => next);
        } else {
          exports.state.game.seconds = next;
          exports.state.game.secondsAtStart = null;
          exports.state.game.startedAtMs = null;
          exports.renderAndPersist();
        }
      });
    }
  }

  function bindMenuControls(){
    const menuToggleBtn = exports.$ ? exports.$('#menuToggle') : null;
    const menuBackdrop = exports.$ ? exports.$('#menuBackdrop') : null;
    if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleMenu);
    if (menuBackdrop) menuBackdrop.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (ev)=>{ if (ev.key === 'Escape') closeMenu(); });
    document.querySelectorAll('#menuDrawer .drawer-item[data-page]').forEach(btn => {
      btn.addEventListener('click', ()=> setPage(btn.dataset.page));
    });
    document.querySelectorAll('#menuDrawer .drawer-item[data-view]').forEach(btn => {
      btn.addEventListener('click', ()=> setViewMode(btn.dataset.view));
    });

    const signOutBtn = exports.$ ? exports.$('#menuSignOut') : null;
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        try { closeMenu(); } catch {}

        let handled = false;
        try {
          const androidApp = window.AndroidApp;
          if (androidApp && typeof androidApp.signOut === 'function') {
            androidApp.signOut();
            handled = true;
          }
        } catch (err) {
          console.warn('[menu] Android sign-out failed', err);
        }

        if (!handled && window.firebase?.auth) {
          try { window.firebase.auth().signOut(); } catch {}
        }
      });
    }
  }

  function bindTeamButtons(){
    const addTeamBtn = exports.$ ? exports.$('#teamsAddTeam') : null;
    if (addTeamBtn && exports.handleAddTeam) addTeamBtn.addEventListener('click', exports.handleAddTeam);
    const addPlayerBtn = exports.$ ? exports.$('#teamsAddPlayer') : null;
    if (addPlayerBtn && exports.handleAddPlayer) addPlayerBtn.addEventListener('click', exports.handleAddPlayer);
  }

  function bindRemoteForm(){
    const formEl = document.getElementById('syncForm');
    const gameInput = formEl ? formEl.querySelector('input[name="game"]') : null;
    if (!formEl) return;

    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const game = (gameInput?.value || '').trim();
      if (!game) { alert('Enter a game code.'); return; }

      exports.remoteSync.config = { game };
      try { exports.saveRemoteConfig(exports.remoteSync.config); } catch {}
      exports.updateRemoteStatus();

      try {
        await exports.connectRemote();
      } catch (e) {
        console.error('[sync] connect error', e);
        exports.remoteSync.status = 'error';
        exports.remoteSync.lastError = e;
        exports.updateRemoteStatus();
        return;
      }

      try { closeMenu(); } catch {}
    });

    const disconnectBtn = document.getElementById('syncDisconnect');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        exports.disconnectRemote();
        exports.remoteSync.config = null;
        try { exports.clearRemoteConfig(); } catch {}
        exports.remoteSync.status = 'idle';
        exports.updateRemoteStatus();
        if (typeof exports.populateSyncForm === 'function') exports.populateSyncForm();
      });
    }
  }

  function runSelfTests(){
    if (location.hash !== '#test') return;
    console.group('[Self Tests]');
    try {
      const size = JSON.stringify(exports.serializeState(exports.state)).length; console.log('Persist size (bytes):', size); console.assert(size < 100000, 'payload <100KB');

      let writes = 0; const _setItem = localStorage.setItem.bind(localStorage); localStorage.setItem = (k,v)=>{ if(k===exports.STORAGE_KEY) writes++; _setItem(k,v); };
      for (let i=0;i<20;i++){ exports.state.teams[0].score++; exports.scheduleSave(exports.state); }
      setTimeout(()=>{ console.log('Debounced writes (<=5 expected):', writes); localStorage.setItem = _setItem; }, 1200);

      startTimeout(0);
      setTimeout(()=>{
        console.assert(exports.state.timeout.secondsRemaining>0, 'timeout should be running');
        toggleStartPause();
        console.assert(exports.state.timeout.secondsRemaining===0, 'timeout cleared on Start');
        console.assert(exports.state.game.running===true, 'game clock should be running after Start');
        pauseClock();

        exports.state.activeTeam = 0; const beforeDef = exports.state.teams[1].rushes; adjustBlitz(1, -1);
        console.assert(exports.state.teams[1].rushes === Math.max(0, beforeDef-1), 'Rush decrements defending');

        exports.state.activeTeam = 0; exports.state.teams[0].girlPlay = 2; exports.state.teams[0].downs = 1;
        performGuyPlay();
        console.assert(exports.state.teams[0].girlPlay === 1, 'Guy Play decrements to 1');
        performGuyPlay();
        console.assert(exports.state.teams[0].girlPlay === 0, 'Guy Play decrements to 0 (Now)');
        performGuyPlay();
        console.assert(exports.state.teams[0].girlPlay === 0, 'Guy Play stays at 0');
        performGirlPlay();
        console.assert(exports.state.teams[0].girlPlay === 2, 'Girl Play button resets to 2');

        startHalftime();
        console.assert(exports.state.teams.every(t=> t.girlPlay===2), 'Halftime sets Girl Play In to 2');
        toggleStartPause(); console.assert(exports.state.halftime.secondsRemaining===0, 'halftime cleared on Start'); pauseClock();

        console.groupEnd();
      }, 150);
    } catch (e) { console.warn('Self tests error:', e); console.groupEnd(); }
  }

  function initializeControls(){
    bindScoreButtons();
    bindAdjustButtons();
    bindClockControls();
    bindMenuControls();
    bindTeamButtons();
    bindRemoteForm();
    runSelfTests();
  }

  exports.mutateTeam = mutateTeam;
  exports.beginEditName = beginEditName;
  exports.beginEditValue = beginEditValue;
  exports.adjustDown = adjustDown;
  exports.adjustGirl = adjustGirl;
  exports.adjustTimeout = adjustTimeout;
  exports.adjustBlitz = adjustBlitz;
  exports.performGuyPlay = performGuyPlay;
  exports.performGirlPlay = performGirlPlay;
  exports.clearTimeoutMode = clearTimeoutMode;
  exports.clearHalftimeMode = clearHalftimeMode;
  exports.startClock = startClock;
  exports.pauseClock = pauseClock;
  exports.toggleStartPause = toggleStartPause;
  exports.startTimeout = startTimeout;
  exports.startHalftime = startHalftime;
  exports.setPage = setPage;
  exports.openMenu = openMenu;
  exports.closeMenu = closeMenu;
  exports.toggleMenu = toggleMenu;
  exports.setViewMode = setViewMode;
  exports.initializeControls = initializeControls;

})(window.App = window.App || {});
