(function(exports){
  'use strict';

  function fmt(sec){ const m=Math.floor(sec/60); const s=sec%60; const padded = ('0' + s).slice(-2); return `${m}:${padded}`; }
  function fmtGirl(val){ return val===0 ? 'Now' : String(val); }

  function entityName(entity, fallback = ''){
    if (!entity || typeof entity !== 'object') return fallback;
    const raw = entity.name;
    if (raw == null) return fallback;
    const str = String(raw).trim();
    return str || fallback;
  }

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

    if (exports.viewMode !== 'player') {
      host.innerHTML = '';
      host.hidden = true;
      host.setAttribute('aria-hidden', 'true');
      return;
    }

    host.hidden = false;
    host.removeAttribute('aria-hidden');

    const teams = Array.isArray(exports.state.teams) ? exports.state.teams : [];
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

    const editingEnabled = exports.viewMode === 'ref';
    if (!editingEnabled && exports.activeValueEditor) {
      try { exports.activeValueEditor(false); } catch {}
    }
    exports.activeValueEditor = null;

    const teamSlots = [exports.$('#teamCard0'), exports.$('#teamCard1')];
    teamSlots.forEach((slot, idx) => {
      if (!slot) return;
      slot.className = 'team-card';
      const isActiveTeam = exports.state.activeTeam === idx;
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

      const team = exports.state.teams[idx];
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
          if (typeof exports.openTeamPopover === 'function') {
            exports.openTeamPopover(idx, nameSpan);
          }
        });
      }
      header.appendChild(nameSpan);
      slot.appendChild(header);

      const scoreVal = document.createElement('div');
      scoreVal.className = 'val score-value';
      scoreVal.dataset.kind = 'score';
      scoreVal.dataset.team = idx;
      const scoreTile = document.createElement('div');
      scoreTile.className = 'score-tile';
      scoreTile.textContent = team.score != null ? team.score : 0;
      scoreVal.appendChild(scoreTile);
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
      const timeoutLabel = document.createElement('span');
      timeoutLabel.className = 'sr-only';
      timeoutLabel.textContent = describeTimeouts(team.timeouts);
      timeoutVal.appendChild(timeoutLabel);
      timeoutMetric.appendChild(timeoutVal);
      metrics.appendChild(timeoutMetric);

      const blitzMetric = document.createElement('div');
      blitzMetric.className = 'metric';
      const blitzVal = document.createElement('div');
      blitzVal.className = 'val metric-track';
      blitzVal.dataset.kind = 'rushes';
      blitzVal.dataset.team = idx;
      blitzVal.innerHTML = buildBlitzPips(team.rushes);
      const blitzLabel = document.createElement('span');
      blitzLabel.className = 'sr-only';
      blitzLabel.textContent = describeBlitzes(team.rushes);
      blitzVal.appendChild(blitzLabel);
      blitzMetric.appendChild(blitzVal);
      metrics.appendChild(blitzMetric);

      slot.appendChild(metrics);

      if (editingEnabled){
        slot.onclick = () => { exports.state.activeTeam = idx; exports.render(); };
        slot.addEventListener('keydown', (ev)=>{
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            exports.state.activeTeam = idx;
            exports.render();
          }
        });
      } else {
        slot.onclick = null;
        slot.onkeydown = null;
      }
    });

    if (editingEnabled){
      document.querySelectorAll('.team-card .val[data-kind]').forEach(v => {
        v.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          if (typeof exports.beginEditValue === 'function') {
            exports.beginEditValue(v, v.dataset.kind, +v.dataset.team);
          }
        });
      });
    }

    if (restoreEdit && editingEnabled) {
      const valEl = document.querySelector(`.team-card .val[data-team="${restoreEdit.team}"][data-kind="${restoreEdit.kind}"]`);
      if (valEl && typeof exports.beginEditValue === 'function') {
        exports.beginEditValue(valEl, restoreEdit.kind, restoreEdit.team, { skipCancelExisting: true, restore: restoreEdit });
      }
    }
  }

  function renderPage(){
    const activePage = 'game';
    document.body.dataset.page = activePage;
    document.querySelectorAll('.page').forEach(sec => {
      const isActive = sec.dataset.page === activePage || !sec.dataset.page;
      sec.classList.toggle('active', isActive);
      sec.hidden = !isActive;
    });
    document.querySelectorAll('#menuDrawer .drawer-item[data-page]').forEach(btn => {
      const requiredView = btn.dataset.view;
      const matchesView = !requiredView || requiredView === exports.viewMode;
      btn.classList.toggle('active', matchesView);
    });
  }

  function syncTimersWithState(){
    const needsTick = exports.state.game.running || exports.state.timeout.running || exports.state.halftime.running;
    if (needsTick){
      if (!exports.uiTickTimer){
        exports.uiTickTimer = setInterval(()=>{ exports.render(); }, 1000);
      }
    } else if (exports.uiTickTimer){
      clearInterval(exports.uiTickTimer);
      exports.uiTickTimer = null;
    }
  }

  function render(){
    const nowMs = Date.now();
    exports.reconcileAll(nowMs);
    document.body.dataset.view = exports.viewMode;
    const isFlagged = !!exports.state.flagged;
    document.body.classList.toggle('flagged', isFlagged);
    const indicator = exports.$ ? exports.$('#viewIndicator') : null;
    if (indicator) {
      indicator.textContent = exports.viewMode === 'ref' ? 'Game dashboard' : 'Scoreboard';
    }

    document.querySelectorAll('#menuDrawer .drawer-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === exports.viewMode));
    const isRef = exports.viewMode === 'ref';
    document.querySelectorAll('button[data-role="ref-only"]').forEach(btn => { btn.disabled = !isRef; });

    const homeName = exports.state.teams[0]?.name || 'Home';
    const awayName = exports.state.teams[1]?.name || 'Away';
    const btnHomeTO = exports.$ ? exports.$('#timeoutHome') : null;
    const btnAwayTO = exports.$ ? exports.$('#timeoutAway') : null;
    const btnHomeBlitz = exports.$ ? exports.$('#blitzHome') : null;
    const btnAwayBlitz = exports.$ ? exports.$('#blitzAway') : null;
    const flagBtn = exports.$ ? exports.$('#g_flagToggle') : null;
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
    if (flagBtn) {
      flagBtn.classList.toggle('active', isFlagged);
      flagBtn.setAttribute('aria-pressed', isFlagged ? 'true' : 'false');
    }

    if (exports.$) {
      const gameTimeEl = exports.$('#gameTime');
      if (gameTimeEl && !gameTimeEl.classList.contains('editing')) gameTimeEl.textContent = fmt(exports.state.game.seconds);
      const timeoutSeconds = exports.state.timeout?.secondsRemaining || 0;
      const timeoutBanner = exports.$('#timeoutBanner');
      if (timeoutBanner) {
        if (timeoutSeconds > 0){
          timeoutBanner.style.display='';
          const timeoutTeamIndex = exports.state.timeout?.team;
          let timeoutName = '';
          if (timeoutTeamIndex != null && exports.state.teams[timeoutTeamIndex]) {
            timeoutName = exports.state.teams[timeoutTeamIndex].name;
          }
          const timeoutTeam = exports.$('#timeoutTeam');
          if (timeoutTeam) timeoutTeam.textContent = timeoutName;
          const timeoutTime = exports.$('#timeoutTime');
          if (timeoutTime) timeoutTime.textContent = fmt(timeoutSeconds);
        } else { timeoutBanner.style.display='none'; }
      }
    }

    const startPauseBtn = exports.$ ? exports.$('#clockStartPause') : null;
    if (startPauseBtn) startPauseBtn.textContent = exports.state.game.running ? 'Pause' : 'Start';
    const activeTeam = exports.state.teams[exports.state.activeTeam] || exports.state.teams[0];
    const activeTeamLabel = exports.$ ? exports.$('#activeTeamLabel') : null;
    if (activeTeamLabel && activeTeam) {
      activeTeamLabel.textContent = activeTeam.name;
    }
    const downValueEl = exports.$ ? exports.$('#downValue') : null;
    const girlTrackEl = exports.$ ? exports.$('#girlPlayTrack') : null;
    const girlTextEl = exports.$ ? exports.$('#girlPlayText') : null;
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

  exports.fmt = fmt;
  exports.fmtGirl = fmtGirl;
  exports.clampGirl = clampGirl;
  exports.clampTimeouts = clampTimeouts;
  exports.clampRushes = clampRushes;
  exports.clampDown = clampDown;
  exports.wrapDown = wrapDown;
  exports.buildTimeoutPips = buildTimeoutPips;
  exports.buildBlitzPips = buildBlitzPips;
  exports.describeGirlPlay = describeGirlPlay;
  exports.describeTimeouts = describeTimeouts;
  exports.describeBlitzes = describeBlitzes;
  exports.updateGirlTrack = updateGirlTrack;
  exports.renderGameStatsView = renderGameStatsView;
  exports.renderTeams = renderTeams;
  exports.renderPage = renderPage;
  exports.syncTimersWithState = syncTimersWithState;
  exports.render = render;
  exports.entityName = entityName;

})(window.App = window.App || {});
