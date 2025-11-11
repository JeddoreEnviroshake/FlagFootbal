(function(exports){
  'use strict';

  const ALLOWED_PAGES = ['game', 'schedule', 'profile', 'teams', 'statistician'];
  const VIEW_PICKER_CLOSE_EVENT = 'app:view-picker-close-request';
  const CSS_URL_QUOTE = /"/g;
  const MAX_PROFILE_IMAGE_DIMENSION = 512;

  function escapeCssUrl(val){
    if (typeof val !== 'string') return '';
    return val.replace(CSS_URL_QUOTE, '\\"');
  }

  function mutateTeam(teamIdx, mutator){
    if (exports.viewMode !== 'ref') return false;
    if (teamIdx == null || teamIdx < 0) return false;
    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      exports.txnState(s => {
        if (!s || !Array.isArray(s.teams) || !s.teams[teamIdx]) return s;
        const team = s.teams[teamIdx];
        mutator(team);
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

  function setFlaggedState(next){
    const desired = !!next;
    if (exports.state.flagged === desired) return;
    exports.state.flagged = desired;
    exports.renderAndPersist();
    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()) {
      try { exports.txnField('flagged', () => desired); }
      catch (err) { console.warn('[flag] remote update failed', err); }
    }
  }

  function toggleFlaggedState(){
    if (exports.viewMode !== 'ref') return;
    setFlaggedState(!exports.state.flagged);
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
        if (typeof exports.render === 'function') {
          exports.render();
        }
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
    const activeIdx = exports.state.activeTeam;
    const currentTeam = exports.state.teams ? exports.state.teams[activeIdx] : null;
    const shouldFlag = !!currentTeam && (currentTeam.girlPlay|0) === 0;
    const changed = mutateTeam(activeIdx, team => {
      team.downs = exports.wrapDown((team.downs|0) + 1);
      team.girlPlay = Math.max(0, (team.girlPlay|0) - 1);
    });
    if (shouldFlag && changed) setFlaggedState(true);
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

  function openMenu(){
    document.dispatchEvent(new CustomEvent(VIEW_PICKER_CLOSE_EVENT));
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

  function performSignOut(){
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
      try {
        window.firebase.auth().signOut();
        handled = true;
      } catch (err) {
        console.warn('[menu] Firebase sign-out failed', err);
      }
    }

    if (!handled) {
      console.info('[menu] Sign-out requested but no handler responded');
    }
  }

  function setPage(page){
    const next = ALLOWED_PAGES.includes(page) ? page : 'game';
    if (exports.currentPage === next) {
      closeMenu();
      return;
    }
    exports.currentPage = next;
    closeMenu();
    exports.render();
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
    if (typeof exports.updateControlCarousel === 'function') exports.updateControlCarousel();
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

  function beginEditClock(){
    if (exports.viewMode !== 'ref') return;
    const gameTime = exports.$ ? exports.$('#gameTime') : null;
    if (!gameTime || gameTime.classList.contains('editing')) return;

    const timeoutActive = exports.state.timeout.running || (exports.state.timeout.secondsRemaining|0) > 0;
    const halftimeActive = exports.state.halftime.running || (exports.state.halftime.secondsRemaining|0) > 0;
    if (exports.state.game.running || timeoutActive || halftimeActive) return;

    if (exports.activeValueEditor) {
      try { exports.activeValueEditor(false); } catch {}
      exports.activeValueEditor = null;
    }

    const currentDisplay = exports.fmt(exports.state.game.seconds);
    const formatDigits = (digits) => {
      if (!digits) return '';
      const secDigits = digits.slice(-2);
      const minDigits = digits.slice(0, -2);
      const minutes = minDigits ? parseInt(minDigits, 10) : 0;
      const minutesDisplay = (Number.isFinite(minutes) ? Math.max(0, minutes) : 0).toString().padStart(2, '0');
      const secondsDisplay = secDigits.padStart(2, '0').slice(-2);
      return `${minutesDisplay}:${secondsDisplay}`;
    };
    const parseDigits = (digits) => {
      if (!digits) return null;
      const secDigits = digits.slice(-2);
      const minDigits = digits.slice(0, -2);
      const minutes = minDigits ? parseInt(minDigits, 10) : 0;
      const seconds = secDigits ? parseInt(secDigits, 10) : 0;
      if (!Number.isFinite(minutes) || minutes < 0) return null;
      if (!Number.isFinite(seconds) || seconds < 0) return null;
      return { minutes, seconds };
    };
    const applyDigitsToInput = (digits) => {
      const normalized = digits || '';
      if (normalized) {
        const parsed = parseDigits(normalized);
        const canonical = parsed
          ? `${Math.max(0, parsed.minutes).toString()}${Math.max(0, parsed.seconds).toString().padStart(2, '0')}`
          : normalized.replace(/^0+/, '0');
        const formatted = formatDigits(canonical);
        input.dataset.clockDigits = canonical;
        input.value = formatted || canonical;
        return canonical;
      }
      delete input.dataset.clockDigits;
      input.value = '';
      return '';
    };
    gameTime.classList.add('editing');
    gameTime.textContent = '';

    const input = document.createElement('input');
    input.className = 'val-input';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9:]*';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const initialDigits = String(currentDisplay || '').replace(/\D/g, '');
    applyDigitsToInput(initialDigits);
    if (!input.value) applyDigitsToInput('0000');
    input.setAttribute('aria-label', 'Set game clock (MM:SS)');

    const errorId = 'clock-edit-error';
    input.setAttribute('aria-describedby', errorId);
    const error = document.createElement('div');
    error.className = 'val-error';
    error.id = errorId;
    error.setAttribute('role', 'alert');
    error.setAttribute('aria-live', 'polite');

    const focusInput = () => {
      input.focus();
      try { input.setSelectionRange(0, input.value.length); }
      catch {}
    };
    const showError = (msg) => {
      error.textContent = msg || '';
      error.classList.toggle('visible', !!msg);
      input.classList.toggle('invalid', !!msg);
    };

    const commitValue = (seconds) => {
      exports.state.game.seconds = seconds;
      exports.state.game.secondsAtStart = null;
      exports.state.game.startedAtMs = null;
      exports.renderAndPersist();
      if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()) {
        try { exports.txnField('game/seconds', () => seconds); }
        catch (err) { console.warn('[clock] remote update failed', err); }
      }
    };

    const finish = (commit) => {
      if (!commit) {
        gameTime.classList.remove('editing');
        gameTime.textContent = exports.fmt(exports.state.game.seconds);
        exports.activeValueEditor = null;
        return;
      }

      const rawDigits = input.dataset.clockDigits || input.value.replace(/\D/g, '');
      if (!rawDigits) { showError('Enter time as MM:SS'); focusInput(); return; }
      const parsed = parseDigits(rawDigits);
      if (!parsed) { showError('Use MM:SS format'); focusInput(); return; }
      const { minutes, seconds } = parsed;
      if (seconds > 59) { showError('Seconds must be 00-59'); focusInput(); return; }

      const totalSeconds = Math.max(0, minutes * 60 + seconds);
      showError('');
      exports.activeValueEditor = null;
      gameTime.classList.remove('editing');
      gameTime.textContent = exports.fmt(totalSeconds);
      commitValue(totalSeconds);
    };

    exports.activeValueEditor = finish;

    gameTime.appendChild(input);
    gameTime.appendChild(error);

    input.addEventListener('click', (e)=> e.stopPropagation());
    input.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      applyDigitsToInput(digits);
      if (error.textContent) showError('');
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!gameTime.isConnected) return;
        const active = document.activeElement;
        if (!gameTime.contains(active)) finish(true);
      }, 20);
    });

    setTimeout(() => { focusInput(); }, 0);
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
    if (gameTime) gameTime.addEventListener('click', beginEditClock);
    const flagBtn = exports.$ ? exports.$('#g_flagToggle') : null;
    if (flagBtn) flagBtn.addEventListener('click', toggleFlaggedState);
  }

  function bindControlCarousel(){
    const carousel = document.getElementById('controlCarousel');
    if (!carousel) return;
    const track = carousel.querySelector('.control-track');
    if (!track) return;
    const panels = Array.from(track.querySelectorAll('.control-panel'));
    if (panels.length <= 1) return;

    const dots = Array.from(carousel.querySelectorAll('.control-dot'));
    const pagination = carousel.querySelector('.control-pagination');
    let activeIndex = 0;

    const isPanelAvailable = (panel) => {
      const firstChild = panel ? panel.firstElementChild : null;
      if (!firstChild) return true;
      const role = firstChild.getAttribute('data-role');
      if (role === 'ref-only') return exports.viewMode === 'ref';
      return true;
    };

    const findNearestAvailable = (startIndex, direction) => {
      let next = startIndex + direction;
      while (next >= 0 && next < panels.length) {
        if (isPanelAvailable(panels[next])) return next;
        next += direction;
      }
      return startIndex;
    };

    const setActiveIndex = (nextIndex) => {
      let clamped = Math.max(0, Math.min(nextIndex, panels.length - 1));
      if (!isPanelAvailable(panels[clamped])) {
        const fallback = panels.findIndex(panel => isPanelAvailable(panel));
        if (fallback !== -1) clamped = fallback;
      }
      activeIndex = clamped;
      carousel.dataset.activeIndex = String(activeIndex);
      carousel.style.setProperty('--active-index', activeIndex);
      panels.forEach((panel, idx) => {
        const isActive = idx === activeIndex;
        panel.classList.toggle('is-active', isActive);
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
      let visibleDotCount = 0;
      dots.forEach((dot, idx) => {
        const isActive = idx === activeIndex;
        const available = isPanelAvailable(panels[idx]);
        dot.classList.toggle('is-active', isActive);
        dot.hidden = !available;
        dot.setAttribute('aria-pressed', String(isActive && available));
        if (available) visibleDotCount++;
      });
      if (pagination) {
        const hidePagination = visibleDotCount <= 1;
        pagination.classList.toggle('is-hidden', hidePagination);
        pagination.setAttribute('aria-hidden', hidePagination ? 'true' : 'false');
      }
    };

    setActiveIndex(0);

    dots.forEach((dot, idx) => {
      const targetIndex = Number(dot.dataset.index);
      dot.addEventListener('click', () => {
        const indexToActivate = Number.isNaN(targetIndex) ? idx : targetIndex;
        setActiveIndex(indexToActivate);
      });
    });

    let pointerId = null;
    let startX = 0;
    let pointerActive = false;
    let swipeHandled = false;
    const swipeThreshold = 40;

    const handleSwipeDelta = (deltaX) => {
      if (Math.abs(deltaX) < swipeThreshold) return false;
      const direction = deltaX < 0 ? 1 : -1;
      const nextIndex = findNearestAvailable(activeIndex, direction);
      if (nextIndex === activeIndex) return false;
      setActiveIndex(nextIndex);
      return true;
    };

    const resetPointer = () => {
      if (pointerId != null && typeof carousel.releasePointerCapture === 'function') {
        try { carousel.releasePointerCapture(pointerId); }
        catch {}
      }
      pointerId = null;
      pointerActive = false;
      swipeHandled = false;
    };

    const onPointerDown = (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      pointerActive = true;
      swipeHandled = false;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      if (typeof carousel.setPointerCapture === 'function') {
        try { carousel.setPointerCapture(pointerId); }
        catch {}
      }
    };

    const onPointerMove = (ev) => {
      if (!pointerActive || ev.pointerId !== pointerId || swipeHandled) return;
      const deltaX = ev.clientX - startX;
      if (handleSwipeDelta(deltaX)) swipeHandled = true;
    };

    const onPointerUpOrCancel = (ev) => {
      if (!pointerActive || (pointerId != null && ev.pointerId !== pointerId)) return;
      if (!swipeHandled) handleSwipeDelta(ev.clientX - startX);
      resetPointer();
    };

    carousel.addEventListener('pointerdown', onPointerDown);
    carousel.addEventListener('pointermove', onPointerMove);
    carousel.addEventListener('pointerup', onPointerUpOrCancel);
    carousel.addEventListener('pointercancel', onPointerUpOrCancel);
    carousel.addEventListener('pointerleave', onPointerUpOrCancel);

    exports.updateControlCarousel = () => setActiveIndex(activeIndex);
  }

  function bindMenuControls(){
    const menuToggleBtn = exports.$ ? exports.$('#menuToggle') : null;
    const menuBackdrop = exports.$ ? exports.$('#menuBackdrop') : null;
    if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleMenu);
    if (menuBackdrop) menuBackdrop.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (ev)=>{ if (ev.key === 'Escape') closeMenu(); });
    document.querySelectorAll('#menuDrawer .drawer-item').forEach(btn => {
      if (!btn.dataset.page && !btn.dataset.view) return;
      btn.addEventListener('click', () => {
        const targetPage = btn.dataset.page;
        const targetView = btn.dataset.view;
        if (targetPage) setPage(targetPage);
        if (targetView) setViewMode(targetView);
        else if (targetPage === 'statistician') setViewMode('ref');
      });
    });

    const signOutBtn = exports.$ ? exports.$('#menuSignOut') : null;
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        try { closeMenu(); } catch {}
        performSignOut();
      });
    }
  }

  function bindBottomNav(){
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPage = btn.dataset.page || 'game';
        const targetView = btn.dataset.view;
        setPage(targetPage);
        if (targetView) setViewMode(targetView);
        else if (targetPage === 'statistician') setViewMode('ref');
      });
    });

    const profileSignOut = document.getElementById('profileSignOut');
    if (profileSignOut) {
      profileSignOut.addEventListener('click', () => {
        performSignOut();
      });
    }
  }

  async function readProfileImage(file){
    if (!file || typeof FileReader === 'undefined') return null;
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      try { reader.readAsDataURL(file); }
      catch { resolve(null); }
    });
    if (typeof base64 !== 'string' || !base64) return null;
    if (!base64.startsWith('data:image')) return base64;
    try {
      const img = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = base64;
      });
      if (!img || !img.width || !img.height) return base64;
      const maxDim = Math.max(img.width, img.height);
      const scale = maxDim > MAX_PROFILE_IMAGE_DIMENSION ? (MAX_PROFILE_IMAGE_DIMENSION / maxDim) : 1;
      if (scale >= 1 && base64.length <= 350000) return base64.trim();
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return base64.trim();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const mime = (file.type && /^image\//.test(file.type)) ? file.type : 'image/png';
      if (mime === 'image/png') return canvas.toDataURL('image/png');
      return canvas.toDataURL(mime, 0.85);
    } catch {
      return base64.trim();
    }
  }

  function bindProfileControls(){
    const trigger = document.getElementById('profileOverview');
    const sheet = document.getElementById('profileEditor');
    const form = document.getElementById('profileForm');
    if (!trigger || !sheet || !form) return;
    const panel = sheet.querySelector('.profile-sheet__panel');
    const photoInput = document.getElementById('profilePhotoInput');
    const photoPreview = document.getElementById('profilePhotoPreview');
    const clearPhotoBtn = document.getElementById('profilePhotoClear');
    const firstNameInput = document.getElementById('profileFirstNameInput');
    const teamInput = document.getElementById('profileTeamInput');
    const cityInput = document.getElementById('profileCityInput');
    const provinceInput = document.getElementById('profileProvinceInput');
    const sanitize = typeof exports.sanitizeProfile === 'function' ? exports.sanitizeProfile : null;
    let pendingImage = null;
    let lastFocusedElement = null;
    let closeFallback = null;

    if (sheet.dataset.open !== 'true') {
      sheet.setAttribute('aria-hidden', 'true');
      sheet.hidden = true;
    }

    const getProfile = () => {
      const source = exports.state && exports.state.profile ? exports.state.profile : {};
      return sanitize ? sanitize(source) : source;
    };

    const setPreview = (dataUrl) => {
      pendingImage = dataUrl && typeof dataUrl === 'string' && dataUrl.trim() ? dataUrl.trim() : null;
      if (!photoPreview) return;
      if (pendingImage) {
        photoPreview.classList.add('has-image');
        photoPreview.style.backgroundImage = `url("${escapeCssUrl(pendingImage)}")`;
      } else {
        photoPreview.classList.remove('has-image');
        photoPreview.style.backgroundImage = '';
      }
    };

    const fillForm = () => {
      const profile = getProfile();
      if (firstNameInput) firstNameInput.value = profile.firstName || '';
      if (teamInput) teamInput.value = profile.teamName || '';
      if (cityInput) cityInput.value = profile.city || '';
      if (provinceInput) provinceInput.value = profile.province || '';
      setPreview(profile.photoData || null);
      if (photoInput) photoInput.value = '';
    };

    const finalizeClose = (focusTrigger = false) => {
      sheet.hidden = true;
      document.body.classList.remove('profile-sheet-open');
      closeFallback = null;
      if (focusTrigger) {
        const focusTarget = lastFocusedElement && typeof lastFocusedElement.focus === 'function'
          ? lastFocusedElement
          : trigger;
        try { focusTarget && focusTarget.focus(); } catch {}
      }
    };

    const closeSheet = (focusTrigger = false) => {
      if (sheet.dataset.open !== 'true') {
        finalizeClose(focusTrigger);
        return;
      }
      sheet.dataset.open = 'false';
      sheet.setAttribute('aria-hidden', 'true');
      if (panel) {
        const onEnd = (ev) => {
          if (ev.target !== panel) return;
          panel.removeEventListener('transitionend', onEnd);
          if (closeFallback != null) clearTimeout(closeFallback);
          if (sheet.dataset.open === 'true') return;
          finalizeClose(focusTrigger);
        };
        panel.addEventListener('transitionend', onEnd);
        closeFallback = window.setTimeout(() => {
          panel.removeEventListener('transitionend', onEnd);
          if (sheet.dataset.open === 'true') return;
          finalizeClose(focusTrigger);
        }, 380);
      } else {
        finalizeClose(focusTrigger);
      }
    };

    const openSheet = () => {
      if (sheet.dataset.open === 'true') return;
      lastFocusedElement = document.activeElement && typeof document.activeElement.focus === 'function'
        ? document.activeElement
        : trigger;
      if (closeFallback != null) {
        clearTimeout(closeFallback);
        closeFallback = null;
      }
      fillForm();
      sheet.hidden = false;
      requestAnimationFrame(() => {
        sheet.dataset.open = 'true';
        sheet.setAttribute('aria-hidden', 'false');
        document.body.classList.add('profile-sheet-open');
        window.setTimeout(() => {
          if (firstNameInput) {
            try { firstNameInput.focus(); } catch {}
          }
        }, 120);
      });
    };

    const handleSubmit = (ev) => {
      ev.preventDefault();
      const payload = {
        firstName: firstNameInput ? firstNameInput.value : '',
        teamName: teamInput ? teamInput.value : '',
        city: cityInput ? cityInput.value : '',
        province: provinceInput ? provinceInput.value : '',
        photoData: pendingImage
      };
      const normalized = sanitize ? sanitize(payload) : payload;
      pendingImage = normalized.photoData || null;
      exports.state.profile = normalized;
      exports.renderAndPersist();
      closeSheet(true);
    };

    const handleKeyDown = (ev) => {
      if (ev.key === 'Escape' && sheet.dataset.open === 'true') {
        ev.preventDefault();
        closeSheet(true);
      }
    };

    const handlePhotoChange = async (ev) => {
      const files = ev.target && ev.target.files ? Array.from(ev.target.files) : [];
      if (!files.length) return;
      const dataUrl = await readProfileImage(files[0]);
      setPreview(dataUrl);
      if (photoInput) photoInput.value = '';
    };

    const handleClearPhoto = () => {
      setPreview(null);
      if (photoInput) photoInput.value = '';
    };

    trigger.addEventListener('click', openSheet);
    trigger.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        openSheet();
      }
    });
    form.addEventListener('submit', handleSubmit);
    document.addEventListener('keydown', handleKeyDown);
    if (photoInput) photoInput.addEventListener('change', handlePhotoChange);
    if (clearPhotoBtn) clearPhotoBtn.addEventListener('click', handleClearPhoto);
    sheet.querySelectorAll('[data-profile-close]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        closeSheet(true);
      });
    });
  }

  function bindViewPicker(){
    const picker = document.getElementById('viewPicker');
    const toggle = document.getElementById('viewIndicator');
    const menu = document.getElementById('viewPickerMenu');
    if (!picker || !toggle || !menu) return;

    const options = Array.from(menu.querySelectorAll('.view-picker__option'));
    if (!options.length) return;
    menu.hidden = true;
    menu.setAttribute('aria-hidden', 'true');
    picker.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');

    let hideTimer = null;
    let transitionHandler = null;

    const prefersReducedMotion = () => {
      try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (err) {
        return false;
      }
    };

    const clearScheduledHide = () => {
      if (hideTimer != null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (transitionHandler) {
        menu.removeEventListener('transitionend', transitionHandler);
        transitionHandler = null;
      }
    };

    const setMenuHidden = (isHidden) => {
      if (isHidden) {
        menu.hidden = true;
        menu.setAttribute('aria-hidden', 'true');
      } else {
        menu.hidden = false;
        menu.setAttribute('aria-hidden', 'false');
      }
    };

    const scheduleHideAfterTransition = () => {
      clearScheduledHide();
      if (prefersReducedMotion()) {
        setMenuHidden(true);
        return;
      }
      transitionHandler = (ev) => {
        if (ev.target !== menu) return;
        if (ev.propertyName !== 'transform' && ev.propertyName !== 'opacity') return;
        clearScheduledHide();
        if (picker.dataset.open !== 'true') setMenuHidden(true);
      };
      menu.addEventListener('transitionend', transitionHandler);
      hideTimer = window.setTimeout(() => {
        clearScheduledHide();
        if (picker.dataset.open !== 'true') setMenuHidden(true);
      }, 300);
    };

    const focusOption = (el) => {
      if (!el) return;
      if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
      el.focus();
    };

    const focusActiveOrFirst = () => {
      const active = menu.querySelector('.view-picker__option.is-active');
      focusOption(active || options[0]);
    };

    const closePicker = () => {
      picker.dataset.open = 'false';
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('view-picker-open');
      menu.setAttribute('aria-hidden', 'true');
      if (menu.hidden) return;
      scheduleHideAfterTransition();
    };

    const openPicker = () => {
      if (picker.dataset.open === 'true' && !menu.hidden) {
        toggle.setAttribute('aria-expanded', 'true');
        document.body.classList.add('view-picker-open');
        return;
      }
      clearScheduledHide();
      setMenuHidden(false);
      // Force layout so the transition runs when data-open flips to true again
      menu.getBoundingClientRect();
      picker.dataset.open = 'true';
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('view-picker-open');
    };

    const selectOption = (option) => {
      if (!option) return;
      const targetPage = option.dataset.page;
      const targetView = option.dataset.view;
      if (targetPage) setPage(targetPage);
      if (targetView) setViewMode(targetView);
      else if (targetPage === 'statistician') setViewMode('ref');
      closePicker();
      toggle.focus();
    };

    const handleToggle = (ev) => {
      ev.stopPropagation();
      if (picker.dataset.open === 'true') {
        closePicker();
      } else {
        openPicker();
        focusActiveOrFirst();
      }
    };

    toggle.addEventListener('click', handleToggle);
    toggle.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (picker.dataset.open !== 'true') {
          openPicker();
        }
        focusActiveOrFirst();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        closePicker();
      }
    });

    const handleOutsideClick = (ev) => {
      if (picker.dataset.open !== 'true') return;
      if (!picker.contains(ev.target)) closePicker();
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('focusin', (ev) => {
      if (picker.dataset.open !== 'true') return;
      if (!picker.contains(ev.target)) closePicker();
    });

    document.addEventListener(VIEW_PICKER_CLOSE_EVENT, closePicker);

    options.forEach((option, idx) => {
      option.setAttribute('tabindex', '-1');
      option.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectOption(option);
      });
      option.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closePicker();
          toggle.focus();
          return;
        }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          const delta = ev.key === 'ArrowDown' ? 1 : -1;
          const nextIdx = (idx + delta + options.length) % options.length;
          focusOption(options[nextIdx]);
          return;
        }
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectOption(option);
          return;
        }
        if (ev.key === 'Tab') {
          closePicker();
        }
      });
    });
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
    bindControlCarousel();
    bindMenuControls();
    bindBottomNav();
    bindProfileControls();
    bindViewPicker();
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
  exports.openMenu = openMenu;
  exports.closeMenu = closeMenu;
  exports.toggleMenu = toggleMenu;
  exports.setViewMode = setViewMode;
  exports.setPage = setPage;
  exports.performSignOut = performSignOut;
  exports.setFlaggedState = setFlaggedState;
  exports.toggleFlaggedState = toggleFlaggedState;
  exports.initializeControls = initializeControls;

})(window.App = window.App || {});
