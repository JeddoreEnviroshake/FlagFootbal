(function (exports) {
  'use strict';

  if (!exports) return;

  /**
   * Minimal CSS helpers used in the dynamic markup (optional)
   * You can move these styles into your CSS file later if you like.
   */
  const injectOnce = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const style = document.createElement('style');
      style.textContent = `
        .schedule-round { margin: 12px 0 20px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; }
        .schedule-round h2 { margin: 0 0 10px; font-size: 16px; }
        .schedule-games { display: grid; gap: 8px; }
        .schedule-game { display:flex; justify-content:space-between; padding: 10px; border-radius: 8px; border:1px solid #e2e8f0; }
        .schedule-game span { font-weight: 600; }
        .schedule-config-note { color:#64748b; font-size:13px; margin: 8px 0 0; }
      `;
      document.head.appendChild(style);
    };
  })();

  function $(sel) { return document.querySelector(sel); }

  function renderEmpty() {
    const host = $('#scheduleList');
    if (!host) return;
    host.innerHTML = '<p class="empty-state">No games yet. Tap “Create Schedule” to get started.</p>';
  }

  function renderSchedule(rounds) {
    const host = $('#scheduleList');
    if (!host) return;

    if (!Array.isArray(rounds) || !rounds.length) {
      renderEmpty();
      return;
    }

    const frag = document.createDocumentFragment();

    rounds.forEach((games, idx) => {
      const section = document.createElement('section');
      section.className = 'schedule-round';
      const title = document.createElement('h2');
      title.textContent = `Round ${idx + 1}`;
      section.appendChild(title);

      const list = document.createElement('div');
      list.className = 'schedule-games';

      games.forEach(([home, away]) => {
        const row = document.createElement('div');
        row.className = 'schedule-game';
        const left = document.createElement('span');
        const right = document.createElement('span');
        left.textContent = home || 'Home';
        right.textContent = away || 'Away';
        row.appendChild(left);
        row.appendChild(document.createTextNode(' vs '));
        row.appendChild(right);
        list.appendChild(row);
      });

      section.appendChild(list);
      frag.appendChild(section);
    });

    host.innerHTML = '';
    host.appendChild(frag);
  }

  /**
   * Standard "circle method" single round-robin
   * - If odd, adds a BYE.
   * - Returns an array of rounds; each round is an array of [home, away] pairs.
   */
  function generateRoundRobin(teams, { doubleRoundRobin = false } = {}) {
    const names = (teams || []).map(s => String(s).trim()).filter(Boolean);
    if (names.length < 2) return [];

    const list = names.slice();
    const odd = list.length % 2 !== 0;
    if (odd) list.push('BYE');

    const n = list.length;
    const half = n / 2;

    // Prepare the rotation arrays
    const fixed = list[0];
    let rotating = list.slice(1);

    const rounds = [];

    for (let r = 0; r < n - 1; r++) {
      const left = [fixed].concat(rotating.slice(0, half - 1));
      const right = rotating.slice(half - 1).reverse();

      const games = [];
      for (let i = 0; i < half; i++) {
        const home = left[i];
        const away = right[i];
        if (home !== 'BYE' && away !== 'BYE') {
          // Alternate home/away a bit for balance
          const pair = (r % 2 === 0 && i % 2 === 0) ? [home, away] : [away, home];
          games.push(pair);
        }
      }
      rounds.push(games);

      // rotate
      rotating = [rotating[rotating.length - 1]].concat(rotating.slice(0, rotating.length - 1));
    }

    if (!doubleRoundRobin) return rounds;

    // Mirror: swap home/away for the second half
    const mirrored = rounds.map(games => games.map(([h, a]) => [a, h]));
    return rounds.concat(mirrored);
  }

  /**
   * Walkthrough to collect inputs & generate the schedule.
   * Uses the Teams page data via fetchTeamOptions (Firebase).
   */
  async function runScheduleWizard() {
    // Pull team names from the same place the Teams module uses
    // fetchTeamOptions() returns a sorted, de-duplicated list of team names from /teams in Firebase :contentReference[oaicite:2]{index=2}
    let options = [];
    try {
      if (typeof exports.fetchTeamOptions === 'function') {
        options = await exports.fetchTeamOptions();
      }
    } catch (e) {
      // ignore and fall back
    }

    if (!options || !options.length) {
      alert('No teams found. Add teams on the Teams page first.');
      return null;
    }

    // Step 1: choose teams (default = all)
    const numbered = options.map((n, i) => `${i + 1}) ${n}`).join('\n');
    const useAll = confirm(
      `Create a schedule using ALL teams?\n\n${numbered}\n\nClick "OK" for all teams, or "Cancel" to pick which teams.`
    );

    let chosen = options.slice();

    if (!useAll) {
      const input = prompt(
        `Enter comma-separated numbers for the teams to include:\n\n${numbered}\n\nExample: 1,3,4`,
        ''
      );
      if (!input) return null;
      const picks = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
      const filtered = [];
      picks.forEach(n => {
        const idx = n - 1;
        if (idx >= 0 && idx < options.length) filtered.push(options[idx]);
      });
      if (filtered.length < 2) {
        alert('Please select at least two teams.');
        return null;
      }
      chosen = filtered;
    }

    // Step 2: single or double round robin?
    const doubleRoundRobin = confirm('Use DOUBLE round robin (home/away swap)?\n\nOK = Double\nCancel = Single');

    // Build schedule
    const rounds = generateRoundRobin(chosen, { doubleRoundRobin });
    if (!rounds.length) {
      alert('Unable to create a schedule. Need at least two teams.');
      return null;
    }

    return { rounds, config: { doubleRoundRobin, teamCount: chosen.length } };
  }

  function wireButton() {
    const btn = $('#scheduleCreate');
    if (!btn || btn.__wired) return;
    btn.__wired = true;

    btn.addEventListener('click', async () => {
      injectOnce();

      const result = await runScheduleWizard();
      if (!result) return;

      renderSchedule(result.rounds);

      const host = $('#scheduleList');
      if (host) {
        const note = document.createElement('p');
        note.className = 'schedule-config-note';
        note.textContent = `Generated a ${result.config.doubleRoundRobin ? 'double' : 'single'} round robin for ${result.config.teamCount} teams.`;
        host.prepend(note);
      }

      // Optional: Persist later if you add a "Save" action.
      // if (exports.db) { ... save to Firebase 'schedule' path ... }
    });
  }

  function renderSchedulePageShellIfNeeded() {
    // If someone navigated to Schedule before this script loaded, make sure the shell exists.
    const page = document.querySelector('section.page[data-page="schedule"] .static-page');
    if (!page) return;
    const list = $('#scheduleList');
    const btn = $('#scheduleCreate');
    if (!list) {
      const listDiv = document.createElement('div');
      listDiv.id = 'scheduleList';
      listDiv.className = 'schedule-list';
      listDiv.innerHTML = '<p class="empty-state">No games yet. Tap “Create Schedule” to get started.</p>';
      page.appendChild(listDiv);
    }
    if (!btn) {
      const actions = document.createElement('div');
      actions.className = 'schedule-actions';
      actions.style.cssText = 'margin-top:16px; display:flex; justify-content:flex-end;';
      const button = document.createElement('button');
      button.id = 'scheduleCreate';
      button.className = 'btn primary';
      button.type = 'button';
      button.textContent = 'Create Schedule';
      actions.appendChild(button);
      page.appendChild(actions);
    }
  }

  function onReady() {
    renderSchedulePageShellIfNeeded();
    wireButton();
  }

  // Try to hook in early and also on DOM ready
  try { onReady(); } catch {}
  document.addEventListener('DOMContentLoaded', onReady);

  // Export (if we ever want to call directly)
  exports.generateRoundRobin = generateRoundRobin;
  exports.renderSchedule = renderSchedule;

})(window.App = window.App || {});
