(function(exports){
  'use strict';

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

  const normalizeName = (value) => {
    if (value == null) return '';
    return String(value).trim().toLowerCase();
  };

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

  function findTeamMatchByName(name){
    const target = normalizeName(name);
    if (!target) return null;
    const data = teamsDirectory.data || {};
    const ordered = teamsDirectory.orderedTeamIds && teamsDirectory.orderedTeamIds.length
      ? teamsDirectory.orderedTeamIds
      : Object.keys(data);
    for (const id of ordered){
      const team = data[id];
      if (!team) continue;
      if (normalizeName(team.name) === target) {
        return { id, team };
      }
    }
    return null;
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

  function getPrimaryKeyForField(field){
    if (Array.isArray(field.keys) && field.keys.length) return field.keys[0];
    if (Array.isArray(field.resolvedKeys) && field.resolvedKeys.length) return field.resolvedKeys[0];
    return null;
  }

  async function incPlayerStat(teamId, playerId, statKey){
    if (!teamId || !playerId || !statKey) return;
    const team = teamsDirectory.data?.[teamId];
    if (team) {
      if (!team.players) team.players = {};
      const player = team.players[playerId] || (team.players[playerId] = { name: 'Player', stats: {} });
      if (!player.stats) player.stats = {};
      const before = Number(player.stats[statKey] ?? 0);
      player.stats[statKey] = before + 1;
      renderTeamStatsGrid();
    }

    const db = exports.db;
    if (!db) return;

    try {
      const ref = db.ref(`teams/${teamId}/players/${playerId}/stats/${statKey}`);
      await ref.transaction(v => (v|0) + 1);
    } catch (e) {
      console.warn('[incPlayerStat] transaction failed', e);
    }
  }

  function buildStatsTable(teamId, players, playerIds){
    const table = document.createElement('table');
    table.className = 'stats-grid';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thName = document.createElement('th');
    thName.textContent = 'Player';
    trh.appendChild(thName);

    TEAM_STAT_FIELDS.forEach(field => {
      const key = getPrimaryKeyForField(field);
      if (!key) return;
      const th = document.createElement('th');
      th.textContent = field.label;
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    playerIds.forEach(pid => {
      const player = players[pid] || {};
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = entityName(player, 'Unnamed player');
      tr.appendChild(nameTd);

      TEAM_STAT_FIELDS.forEach(field => {
        const key = getPrimaryKeyForField(field);
        if (!key) return;
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stat-cell';
        btn.dataset.teamId = teamId;
        btn.dataset.playerId = pid;
        btn.dataset.statKey = key;
        let value = valueFromField(player, field);
        if (value == null || value === '') value = 0;
        const numeric = Number(value);
        btn.textContent = Number.isFinite(numeric) ? String(numeric) : String(value);
        btn.setAttribute('aria-label', `Add 1 to ${field.label} for ${entityName(player, 'player')}`);
        td.appendChild(btn);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    return table;
  }

  function renderTeamStatsGrid(){
    const host = document.getElementById('statisticianTeamTotals');
    if (!host) return;

    const statusEl = document.getElementById('statisticianStatus');

    const db = exports.db;
    if (!db) {
      host.innerHTML = '<div class="stats-grid-empty">Connect to Firebase to record stats.</div>';
      if (statusEl) statusEl.textContent = 'Connect to Firebase to view live team totals.';
      return;
    }

    const stateTeams = exports.state && Array.isArray(exports.state.teams) ? exports.state.teams : [];
    const gameTeams = stateTeams.slice(0, 2);
    if (!gameTeams.length) {
      host.innerHTML = '<div class="stats-grid-empty">Select Home and Away teams on the Game page to view player totals.</div>';
      if (statusEl) statusEl.textContent = 'No game teams selected.';
      return;
    }

    const fragment = document.createDocumentFragment();
    let linkedTeams = 0;
    let totalPlayers = 0;

    gameTeams.forEach((team, idx) => {
      const section = document.createElement('section');
      section.className = 'statistician-game-team';

      const fallbackName = idx === 0 ? 'Home' : (idx === 1 ? 'Away' : `Team ${idx + 1}`);
      const title = document.createElement('h2');
      title.className = 'statistician-game-team__title';
      title.textContent = entityName(team, fallbackName);
      section.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'statistician-game-team__meta';
      section.appendChild(meta);

      const rawName = team && typeof team.name === 'string' ? team.name : '';
      const match = findTeamMatchByName(rawName);
      if (!match) {
        meta.textContent = rawName && rawName.trim()
          ? 'No matching roster found in Teams.'
          : 'Name this team to link it to a roster.';
        const empty = document.createElement('p');
        empty.className = 'statistician-game-team__empty';
        empty.textContent = 'Add this roster on the Teams page to see player totals here.';
        section.appendChild(empty);
        fragment.appendChild(section);
        return;
      }

      const players = match.team && match.team.players ? match.team.players : {};
      const playerIds = sortKeysByName(players);
      linkedTeams += 1;
      totalPlayers += playerIds.length;
      meta.textContent = playerIds.length === 1 ? '1 player' : `${playerIds.length} players`;

      if (!playerIds.length) {
        const empty = document.createElement('p');
        empty.className = 'statistician-game-team__empty';
        empty.textContent = 'No players yet. Add players from the Teams page.';
        section.appendChild(empty);
        fragment.appendChild(section);
        return;
      }

      const table = buildStatsTable(match.id, players, playerIds);
      section.appendChild(table);
      fragment.appendChild(section);
    });

    host.innerHTML = '';
    host.appendChild(fragment);

    if (statusEl) {
      if (!linkedTeams) {
        statusEl.textContent = 'Link your game teams to rosters to record stats.';
      } else {
        const teamLabel = linkedTeams === 1 ? 'team' : 'teams';
        statusEl.textContent = `Tracking ${totalPlayers} players across ${linkedTeams} ${teamLabel}.`;
      }
    }

    if (!host.__wired) {
      host.addEventListener('click', (e) => {
        const btn = e.target.closest('button.stat-cell');
        if (!btn) return;
        e.stopPropagation();
        const { teamId: tId, playerId, statKey } = btn.dataset;
        incPlayerStat(tId, playerId, statKey);
      });
      host.__wired = true;
    }
  }

  function renderTeamDetailsPage(){
    const $ = exports.$;
    const titleEl = $('#teamDetailsTitle');
    const statusEl = $('#teamDetailsStatus');
    const listEl = $('#teamDetailsPlayerList');
    const tileEl = $('#teamPlayerTile');
    const addPlayerBtn = $('#teamDetailsAddPlayer');

    const activeTeamId = teamsDirectory.activeTeamId;
    const team = activeTeamId ? teamsDirectory.data?.[activeTeamId] : null;
    const players = team && team.players ? team.players : {};
    const playerIds = teamsDirectory.orderedPlayerIds && teamsDirectory.orderedPlayerIds.length
      ? teamsDirectory.orderedPlayerIds
      : sortKeysByName(players);

    if (titleEl) {
      titleEl.textContent = team ? entityName(team, 'Unnamed team') : 'Team';
    }

    if (statusEl) {
      if (teamsDirectory.loading) {
        statusEl.textContent = activeTeamId ? 'Loading players…' : 'Loading teams…';
      } else if (!activeTeamId) {
        statusEl.textContent = 'Select a team to view players.';
      } else if (!playerIds.length) {
        statusEl.textContent = 'No players yet.';
      } else {
        statusEl.textContent = playerIds.length === 1 ? '1 player' : `${playerIds.length} players`;
      }
    }

    if (addPlayerBtn) {
      const hasDb = !!exports.db;
      const hasTeam = !!activeTeamId;
      addPlayerBtn.disabled = !hasTeam || !hasDb;
      if (!hasTeam) {
        addPlayerBtn.title = 'Select a team to add players.';
      } else if (!hasDb) {
        addPlayerBtn.title = 'Connect to Firebase to add players.';
      } else {
        addPlayerBtn.removeAttribute('title');
      }
    }

    if (listEl) {
      listEl.innerHTML = '';
      if (!activeTeamId) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Pick a team first.';
        listEl.appendChild(empty);
      } else if (!playerIds.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No players yet.';
        listEl.appendChild(empty);
      } else {
        playerIds.forEach(id => {
          const player = players[id] || {};
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.playerId = id;
          btn.textContent = entityName(player, 'Unnamed player');
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-selected', id === teamsDirectory.activePlayerId ? 'true' : 'false');
          if (id === teamsDirectory.activePlayerId) btn.classList.add('active');
          btn.addEventListener('click', () => selectPlayer(id));
          listEl.appendChild(btn);
        });
      }
    }

    if (tileEl) {
      tileEl.innerHTML = '';
      if (!activeTeamId) {
        const placeholder = document.createElement('p');
        placeholder.className = 'placeholder';
        placeholder.textContent = 'Select a team to view players.';
        tileEl.appendChild(placeholder);
        return;
      }

      const activePlayer = teamsDirectory.activePlayerId ? players[teamsDirectory.activePlayerId] : null;
      if (!activePlayer) {
        const placeholder = document.createElement('p');
        placeholder.className = 'placeholder';
        placeholder.textContent = playerIds.length ? 'Select a player to view stats.' : 'Add players to get started.';
        tileEl.appendChild(placeholder);
        return;
      }

      const card = document.createElement('article');
      card.className = 'player-card';

      const header = document.createElement('div');
      header.className = 'player-card__header';
      const title = document.createElement('h2');
      title.className = 'player-card__title';
      title.textContent = entityName(activePlayer, 'Unnamed player');
      header.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'player-card__meta';

      // Calculate Player Score
      const scoringFields = TEAM_STAT_FIELDS.filter(f =>
        ['Passing TD', 'Receiving TD', 'Rushing TD', 'Interception', 'Flag Pull'].includes(f.label)
      );
      let score = 0;
      scoringFields.forEach(field => {
        const val = valueFromField(activePlayer, field);
        score += Number.isFinite(val) ? val : 0;
      });

      meta.textContent = `Player Score: ${score}`;
      header.appendChild(meta);

      card.appendChild(header);

      const statsGrid = document.createElement('div');
      statsGrid.className = 'player-card__stats';

      TEAM_STAT_FIELDS.forEach(field => {
        const stat = document.createElement('div');
        stat.className = 'player-card__stat';
        const label = document.createElement('span');
        label.className = 'player-card__stat-label';
        label.textContent = field.label;
        const valueEl = document.createElement('span');
        valueEl.className = 'player-card__stat-value';
        let value = valueFromField(activePlayer, field);
        if (value == null || value === '') value = 0;
        const numeric = Number(value);
        valueEl.textContent = Number.isFinite(numeric) ? String(numeric) : String(value);
        stat.appendChild(label);
        stat.appendChild(valueEl);
        statsGrid.appendChild(stat);
      });

      card.appendChild(statsGrid);
      tileEl.appendChild(card);
    }
  }

  function renderTeamsDirectory(){
    const $ = exports.$;
    const statusEl = $('#teamsPageStatus');
    const teamListEl = $('#teamsDirectoryList');

    if (statusEl) {
      statusEl.classList.toggle('error', !!teamsDirectory.error);
      if (teamsDirectory.loading) {
        statusEl.textContent = 'Loading teams…';
      } else if (teamsDirectory.error) {
        statusEl.textContent = teamsDirectory.error;
      } else if (!teamsDirectory.orderedTeamIds.length) {
        statusEl.textContent = 'No teams yet.';
      } else {
        const count = teamsDirectory.orderedTeamIds.length;
        statusEl.textContent = count === 1 ? '1 team available' : `${count} teams available`;
      }
    }

    if (teamListEl) {
      teamListEl.innerHTML = '';
      if (teamsDirectory.loading) {
        const loading = document.createElement('div');
        loading.className = 'team-tile empty';
        loading.textContent = 'Loading teams…';
        teamListEl.appendChild(loading);
      } else if (teamsDirectory.error) {
        const errorTile = document.createElement('div');
        errorTile.className = 'team-tile empty';
        errorTile.textContent = 'Unable to load teams.';
        teamListEl.appendChild(errorTile);
      } else if (!teamsDirectory.orderedTeamIds.length) {
        const empty = document.createElement('div');
        empty.className = 'team-tile empty';
        empty.textContent = 'No teams yet.';
        teamListEl.appendChild(empty);
      } else {
        teamsDirectory.orderedTeamIds.forEach(id => {
          const team = teamsDirectory.data?.[id] || {};
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.teamId = id;
          btn.className = 'team-tile';
          btn.setAttribute('role', 'listitem');
          if (id === teamsDirectory.activeTeamId) btn.classList.add('active');
          const nameEl = document.createElement('div');
          nameEl.className = 'team-tile__name';
          nameEl.textContent = entityName(team, 'Unnamed team');
          const metaEl = document.createElement('div');
          metaEl.className = 'team-tile__meta';
          const playerCount = team.players && typeof team.players === 'object'
            ? Object.keys(team.players).length
            : 0;
          metaEl.textContent = playerCount
            ? `${playerCount} player${playerCount === 1 ? '' : 's'}`
            : 'No players yet';
          btn.appendChild(nameEl);
          btn.appendChild(metaEl);
          btn.addEventListener('click', () => selectTeam(id, { openPage: true }));
          teamListEl.appendChild(btn);
        });
      }
    }

    renderTeamDetailsPage();
    renderTeamStatsGrid();
  }

  function ensureTeamsListener(){
    const db = exports.db;
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

  function selectTeam(teamId, options = {}){
    if (!teamId || !teamsDirectory.data || !teamsDirectory.data[teamId]) return;
    teamsDirectory.activeTeamId = teamId;
    const team = teamsDirectory.data[teamId] || {};
    const players = team.players || {};
    teamsDirectory.orderedPlayerIds = sortKeysByName(players);
    if (!teamsDirectory.orderedPlayerIds.includes(teamsDirectory.activePlayerId)) {
      teamsDirectory.activePlayerId = teamsDirectory.orderedPlayerIds[0] || null;
    }
    renderTeamsDirectory();
    if (options.openPage && typeof exports.setPage === 'function') {
      try { exports.setPage('teamPlayers'); }
      catch (err) { console.warn('[teams] unable to open team details page', err); }
    }
  }

  function selectPlayer(playerId){
    teamsDirectory.activePlayerId = playerId || null;
    renderTeamsDirectory();
  }

  async function handleAddTeam(){
    const name = prompt('Team name');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const db = exports.db;
      let teamKey = null;
      if (db) {
        const ref = db.ref('teams').push();
        await ref.set({ name: trimmed });
        teamKey = ref.key;
      }
      if (!teamKey) {
        teamKey = `local-${Date.now()}`;
      }
      if (!teamsDirectory.data) teamsDirectory.data = {};
      teamsDirectory.data[teamKey] = { name: trimmed };
      teamsDirectory.orderedTeamIds = sortKeysByName(teamsDirectory.data);
      teamsDirectory.orderedPlayerIds = [];
      selectTeam(teamKey, { openPage: true });
    } catch (err) {
      console.warn('[teams] Unable to add team remotely', err);
      const fallbackKey = `local-${Date.now()}`;
      if (!teamsDirectory.data) teamsDirectory.data = {};
      teamsDirectory.data[fallbackKey] = { name: trimmed };
      teamsDirectory.orderedTeamIds = sortKeysByName(teamsDirectory.data);
      teamsDirectory.orderedPlayerIds = [];
      selectTeam(fallbackKey, { openPage: true });
    }
  }

  async function handleAddPlayer(){
    const db = exports.db;
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

  exports.teamsDirectory = teamsDirectory;
  exports.TEAM_STAT_FIELDS = TEAM_STAT_FIELDS;
  exports.entityName = entityName;
  exports.sortKeysByName = sortKeysByName;
  exports.valueFromField = valueFromField;
  exports.getPrimaryKeyForField = getPrimaryKeyForField;
  exports.renderTeamStatsGrid = renderTeamStatsGrid;
  exports.renderTeamsDirectory = renderTeamsDirectory;
  exports.ensureTeamsListener = ensureTeamsListener;
  exports.selectTeam = selectTeam;
  exports.selectPlayer = selectPlayer;
  exports.handleAddTeam = handleAddTeam;
  exports.handleAddPlayer = handleAddPlayer;
  exports.incPlayerStat = incPlayerStat;
  exports.fetchTeamOptions = fetchTeamOptions;

  async function setTeamName(slotIdx, newName){
    if (!newName) return;
    exports.state.teams[slotIdx].name = newName;
    if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()){
      try {
        await exports.txnField(`teams/${slotIdx}/name`, () => newName);
      } catch (e) {
        console.warn('[team name sync] failed; using local only', e);
      }
    }
    exports.renderAndPersist();
  }

  async function fetchTeamOptions(){
    const db = exports.db;
    if (!db) return [];
    const snap = await db.ref('teams').get();
    const val = snap.val() || {};
    const names = Object.values(val)
      .map(t => (t && t.name ? String(t.name).trim() : ''))
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b));
  }

  async function chooseTeamForSlot(slotIdx){
    try {
      let options = await fetchTeamOptions();
      if (!options.length) {
        const manual = prompt('Enter team name:', exports.state.teams[slotIdx].name || '');
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
      const manual = prompt('Enter team name:', exports.state.teams[slotIdx].name || '');
      if (manual) await setTeamName(slotIdx, manual.trim());
    }
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

    const current = (exports.state.teams[slotIdx] && exports.state.teams[slotIdx].name) || '';
    if (current) {
      const i = options.indexOf(current);
      if (i >= 0) select.selectedIndex = i;
    }

    anchorEl.replaceWith(select);

    const stop = (e) => e.stopPropagation();
    select.addEventListener('mousedown', stop, true);
    select.addEventListener('click', stop, true);
    select.addEventListener('touchstart', stop, true);

    const restoreSpan = () => {
      const span = document.createElement('span');
      span.className = 'name';
      span.textContent = (exports.state.teams[slotIdx] && exports.state.teams[slotIdx].name) || current || (slotIdx === 0 ? 'Home' : 'Away');
      span.addEventListener('click', (ev) => { ev.stopPropagation(); openTeamDropdown(slotIdx, span); });
      select.replaceWith(span);
      document.removeEventListener('mousedown', outsideClickOnce, true);
      document.removeEventListener('touchstart', outsideClickOnce, true);
    };

    const commit = async () => {
      const chosen = select.value;
      if (chosen && chosen !== current) {
        exports.state.teams[slotIdx].name = chosen;
        if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()) {
          try { await exports.txnField(`teams/${slotIdx}/name`, () => chosen); } catch {}
        }
        exports.renderAndPersist();
      }
      restoreSpan();
    };

    const cancel = () => restoreSpan();

    select.addEventListener('change', commit);
    select.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    const outsideClickOnce = (e) => {
      if (!select.contains(e.target)) cancel();
    };
    document.addEventListener('mousedown', outsideClickOnce, true);
    document.addEventListener('touchstart', outsideClickOnce, true);

    setTimeout(() => {
      try { select.focus({ preventScroll: true }); } catch {}
      try { select.click(); } catch {}
      try { select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch {}
      try { select.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true })); } catch {}
      try { select.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true })); } catch {}
      try { select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); } catch {}
    }, 0);
  }

  function openTeamPopover(slotIdx, anchorEl) {
    const hasExisting = document.querySelector('.team-popover, .team-popover-backdrop');
    if (hasExisting) { return; }

    const backdrop = document.createElement('div');
    backdrop.className = 'team-popover-backdrop';
    backdrop.addEventListener('mousedown', (e)=> e.stopPropagation());
    backdrop.addEventListener('click', close);

    const pop = document.createElement('div');
    pop.className = 'team-popover';
    pop.setAttribute('role', 'listbox');
    pop.addEventListener('mousedown', (e)=> e.stopPropagation());
    pop.addEventListener('click', (e)=> e.stopPropagation());

    const r = anchorEl.getBoundingClientRect();
    const gap = 6;
    const px = Math.min(r.left, window.innerWidth - 220);
    let py = r.bottom + gap;
    const belowSpace = window.innerHeight - r.bottom;
    if (belowSpace < 180) py = Math.max(12, r.top - gap - 220);

    pop.style.left = `${px}px`;
    pop.style.top  = `${py}px`;

    pop.textContent = 'Loading…';
    document.body.appendChild(backdrop);
    document.body.appendChild(pop);

    (async () => {
      try {
        const options = await fetchTeamOptions();
        const current = (exports.state.teams[slotIdx] && exports.state.teams[slotIdx].name) || '';
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
              exports.state.teams[slotIdx].name = name;
              if (typeof exports.isOnlineWriter === 'function' && exports.isOnlineWriter()) {
                try { await exports.txnField(`teams/${slotIdx}/name`, () => name); } catch {}
              }
              exports.renderAndPersist();
            }
            close();
          });
          pop.appendChild(btn);
        });

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
        setTimeout(() => { setFocus(focusIdx); }, 0);
      } catch (e) {
        pop.innerHTML = '<div style="padding:10px 12px;color:#fca5a5;font-weight:800;">Error loading teams.</div>';
        console.warn('[team popover]', e);
      }
    })();

    function close() {
      try { backdrop.remove(); } catch {}
      try { pop.remove(); } catch {}
    }

    window.addEventListener('resize', close, { once: true });
    window.addEventListener('scroll', close, { once: true }, true);
  }

  exports.setTeamName = setTeamName;
  exports.chooseTeamForSlot = chooseTeamForSlot;
  exports.openTeamDropdown = openTeamDropdown;
  exports.openTeamPopover = openTeamPopover;

})(window.App = window.App || {});
