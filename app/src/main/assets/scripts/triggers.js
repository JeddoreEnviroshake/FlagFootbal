// Volume → actions (safe no-ops if not in Ref view)
window.triggerGuyPlay = function () {
  try {
    if (document.body?.dataset?.view !== 'ref') return;
    const app = window.App;
    const hadFlag = !!(app?.state?.flagged);
    if (typeof window.performGuyPlay === 'function') {
      window.performGuyPlay();
    }
    if (hadFlag && typeof app?.setFlaggedState === 'function') {
      app.setFlaggedState(false);
    }
  } catch (e) {
    console.warn('triggerGuyPlay error', e);
  }
};

window.triggerGirlPlay = function () {
  try {
    if (document.body?.dataset?.view !== 'ref') return;
    const app = window.App;
    const hadFlag = !!(app?.state?.flagged);
    if (typeof window.performGirlPlay === 'function') {
      window.performGirlPlay();
    }
    if (hadFlag && typeof app?.setFlaggedState === 'function') {
      app.setFlaggedState(false);
    }
  } catch (e) {
    console.warn('triggerGirlPlay error', e);
  }
};

// put in triggers.js (already loaded after main modules)
(function () {
  const body = document.body;
  const fieldSheet = document.getElementById('profileFieldSheet');
  const openers = document.querySelectorAll('.profile-form__field-button[data-profile-field]');
  const closers = document.querySelectorAll('[data-profile-field-close]');
  let scrollY = 0;
  let scrollLockDepth = 0;

  function lockScroll() {
    if (!body) return;
    if (scrollLockDepth === 0) {
      scrollY = window.scrollY || window.pageYOffset || 0;
      body.classList.add('profile-sheet-open');
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }
    scrollLockDepth += 1;
  }

  function unlockScroll() {
    if (!body) return;
    if (scrollLockDepth === 0) return;
    scrollLockDepth -= 1;
    if (scrollLockDepth > 0) return;

    body.classList.remove('profile-sheet-open');
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    window.scrollTo(0, scrollY);
  }

  // Helper: seed the big Edit Profile sheet preview spans from state
  function seedProfileEditorFromState(){
    const p = (window.App?.state?.profile) || {};
    const placeholders = { firstName: 'Name', teamName: 'Team', city: 'City', province: 'Province' };

    const setPreview = (k, val) => {
      const el = document.querySelector(`[data-profile-field-value="${k}"]`);
      if (!el) return;
      const txt = (val || '').trim();
      el.textContent = txt || placeholders[k];
      el.classList.toggle('is-placeholder', !txt);
    };

    setPreview('firstName', p.firstName);
    setPreview('teamName',  p.teamName);
    setPreview('city',      p.city);
    setPreview('province',  p.province);
  }

  // Helper: swap text input -> <select> populated from Firebase Teams
  // Accepts currentText so the dropdown preselects unsaved preview changes.
  async function setupProfileTeamPicker(currentText) {
    const input = document.getElementById('profileFieldInput');
    if (!input) return false;

    const select = document.createElement('select');
    select.className = 'profile-field-form__input';

    const describedBy = input.getAttribute('aria-describedby');
    if (describedBy) select.setAttribute('aria-describedby', describedBy);

    try {
      const rawOptions = typeof window.App?.fetchTeamOptions === 'function'
        ? await window.App.fetchTeamOptions()
        : [];

      const options = Array.isArray(rawOptions)
        ? rawOptions.map(name => (name == null ? '' : String(name).trim())).filter(Boolean)
        : [];

      if (!options.length) return false; // fallback: keep text input

      const fromPreview = (currentText || '').trim();
      const fromState = (window.App?.state?.profile?.teamName || '').trim();
      const current = fromPreview || fromState;

      const unique = Array.from(new Set(options));
      if (current && !unique.includes(current)) {
        unique.unshift(current);
      }

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a team';
      select.appendChild(placeholder);

      unique.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });

      select.id = 'profileFieldInput'; // preserve id for submit handler
      select.value = current || '';

      input.replaceWith(select);

      setTimeout(() => {
        try { select.focus(); } catch {}
      }, 0);

      return true;
    } catch (e) {
      console.warn('[profile team picker] falling back to text input', e);
      return false;
    }
  }

  // Open the big Edit Profile sheet (Profile card button)
  const profileOverviewBtn = document.getElementById('profileOverview');
  if (profileOverviewBtn) {
    profileOverviewBtn.addEventListener('click', () => {
      const editor = document.getElementById('profileEditor');
      if (!editor) return;
      // Seed current state into the four preview rows
      seedProfileEditorFromState();
      // Open the sheet
      editor.setAttribute('data-open', 'true');
      editor.setAttribute('aria-hidden', 'false');
      try { editor.hidden = false; } catch {}
      lockScroll();
    });
  }

  // Close buttons for the big sheet
  document.querySelectorAll('[data-profile-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const editor = document.getElementById('profileEditor');
      editor?.setAttribute('data-open', 'false');
      editor?.setAttribute('aria-hidden', 'true');
      try { if (editor) editor.hidden = true; } catch {}
      unlockScroll();
    });
  });

  // Open the single-field editor
  function openProfileFieldEditor(fieldKey, opts = {}) {
    if (fieldSheet) fieldSheet.dataset.key = fieldKey;

    // Get current preview text from big editor (not from state)
    const placeholders = { firstName: 'Name', teamName: 'Team', city: 'City', province: 'Province' };
    const previewEl = document.querySelector(`[data-profile-field-value="${fieldKey}"]`);
    const previewTextRaw = (previewEl?.textContent || '').trim();
    const previewText = previewTextRaw && previewTextRaw !== placeholders[fieldKey] ? previewTextRaw : '';

    (function normalizeInput(){
      const el = document.getElementById('profileFieldInput');
      const needsText = fieldKey !== 'teamName';
      if (needsText && el && el.tagName !== 'INPUT') {
        const input = document.createElement('input');
        input.className = 'profile-field-form__input';
        input.id = 'profileFieldInput';
        input.type = 'text';
        input.setAttribute('aria-describedby', 'profileFieldDescription profileFieldHelper');
        input.autocomplete = 'off';
        el.replaceWith(input);
      }
    })();

    const titleEl = document.getElementById('profileFieldTitle');
    const descEl  = document.getElementById('profileFieldDescription');
    const labelEl = document.getElementById('profileFieldLabel');
    const inputEl = document.getElementById('profileFieldInput');

    if (titleEl && opts.title) titleEl.textContent = opts.title;
    if (descEl) descEl.textContent = opts.description || 'Please enter your value.';
    if (labelEl && opts.name) labelEl.textContent = opts.name;
    if (inputEl && opts.placeholder) inputEl.setAttribute('placeholder', opts.placeholder);

    // Swap to dropdown for Team, otherwise seed input with preview text
    if (fieldKey === 'teamName') {
      const helper = document.getElementById('profileFieldHelper');
      if (helper) helper.textContent = 'Loading teams…';
      if (descEl) descEl.textContent = 'Select your team.';

      setupProfileTeamPicker(previewText).then((success) => {
        if (fieldSheet?.dataset?.key !== 'teamName') return;
        if (fieldSheet?.getAttribute('data-open') !== 'true') return;
        const helperEl = document.getElementById('profileFieldHelper');
        const descriptionEl = document.getElementById('profileFieldDescription');
        if (success) {
          if (helperEl) helperEl.textContent = 'Pick your team from the directory.';
        } else {
          if (helperEl) helperEl.textContent = 'Enter your team name.';
          if (descriptionEl) descriptionEl.textContent = 'Type your team.';
        }
      });
    } else {
      // Prefill text input for non-team fields
      if (inputEl) inputEl.value = previewText;
    }

    fieldSheet?.setAttribute('data-open', 'true');
    fieldSheet?.setAttribute('aria-hidden', 'false');
    try { if (fieldSheet) fieldSheet.hidden = false; } catch {}
    lockScroll();
    setTimeout(() => document.getElementById('profileFieldInput')?.focus(), 0);
  }

  // Openers → call our editor
  openers.forEach(btn => {
    btn.addEventListener('click', () => {
      const { profileField: key, profileFieldTitle, profileFieldName, profileFieldPlaceholder } = btn.dataset;
      openProfileFieldEditor(key, {
        title: profileFieldTitle,
        name: profileFieldName,
        placeholder: profileFieldPlaceholder
      });
    });
  });

  // Closers for the small single-field sheet
  closers.forEach(btn => {
    btn.addEventListener('click', () => {
      fieldSheet?.setAttribute('data-open', 'false');
      fieldSheet?.setAttribute('aria-hidden', 'true');
      if (fieldSheet && 'key' in fieldSheet.dataset) {
        delete fieldSheet.dataset.key;
      }
      try { if (fieldSheet) fieldSheet.hidden = true; } catch {}
      unlockScroll();
    });
  });

  // Submit handler — updates the big edit-profile preview only (no state write here)
  const profileFieldForm = document.getElementById('profileFieldForm');
  if (profileFieldForm) {
    profileFieldForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const key = fieldSheet?.dataset?.key;
      if (!key) return;

      const valEl = document.getElementById('profileFieldInput');
      let next = '';
      if (valEl) {
        if (valEl.tagName === 'SELECT') {
          const opt = valEl.options[valEl.selectedIndex];
          next = (opt?.value || '').trim();
        } else {
          next = (valEl.value || '').trim();
        }
      }

      // Update the visible value in the big Edit Profile sheet
      const preview = document.querySelector(`[data-profile-field-value="${key}"]`);
      if (preview) {
        const placeholders = { firstName: 'Name', teamName: 'Team', city: 'City', province: 'Province' };
        preview.textContent = next || placeholders[key] || '';
        preview.classList.toggle('is-placeholder', !next);
      }

      // Close the single-field sheet only
      fieldSheet?.setAttribute('data-open', 'false');
      fieldSheet?.setAttribute('aria-hidden', 'true');
      if (fieldSheet && 'key' in fieldSheet.dataset) {
        delete fieldSheet.dataset.key;
      }
      try { if (fieldSheet) fieldSheet.hidden = true; } catch {}
      unlockScroll();
    });
  }

  // Main Edit Profile form: persist to state.profile
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const placeholders = { firstName: 'Name', teamName: 'Team', city: 'City', province: 'Province' };
      const keys = ['firstName', 'teamName', 'city', 'province'];
      const nextProfile = { ...(window.App?.state?.profile || {}) };

      keys.forEach((k) => {
        const el = document.querySelector(`[data-profile-field-value="${k}"]`);
        const raw = (el?.textContent || '').trim();
        if (!raw || raw === placeholders[k]) {
          delete nextProfile[k];
        } else {
          nextProfile[k] = raw;
        }
      });

<<<<<<< HEAD
      const sanitizeProfile = typeof (app?.sanitizeProfile) === 'function'
        ? app.sanitizeProfile
        : (profile) => profile;
      const sanitizeInput = { ...nextProfile };
      if (app?.state?.profile?.photoData != null && sanitizeInput.photoData == null) {
        sanitizeInput.photoData = app.state.profile.photoData;
      }
      const sanitizedProfile = sanitizeProfile(sanitizeInput) || {};

      if (app?.state) {
        app.state.profile = sanitizedProfile;
      }
      if (typeof app?.renderAndPersist === 'function') {
        app.renderAndPersist();
      }

      const db = app?.db;
      const requireAuth = typeof app?.requireAuth === 'function' ? app.requireAuth : null;
      if (db && typeof db.ref === 'function' && requireAuth) {
        let user = null;
        try {
          user = requireAuth();
        } catch (err) {
          console.warn('[profile sync] authentication required', err);
        }
        if (user) {
          try {
            const ref = db.ref(`users/${user.uid}/profile`);
            if (ref && typeof ref.set === 'function') {
              const payload = sanitizeProfile(app?.state?.profile || sanitizedProfile) || sanitizedProfile;
              const remotePayload = { ...payload };
              const writerMetaFactory = typeof app?.createWriterMeta === 'function' ? app.createWriterMeta : null;
              const meta = writerMetaFactory ? writerMetaFactory(user, { includeCreatedAt: !remotePayload.meta }) : {
                writerUid: user.uid,
                writerEmail: user.email || null,
                writerDisplayName: user.displayName || null,
                updatedAt: (typeof app?.serverTimestamp === 'function' ? app.serverTimestamp() : Date.now())
              };
              if (remotePayload.meta && typeof remotePayload.meta === 'object') {
                remotePayload.meta = { ...remotePayload.meta, ...meta };
              } else {
                remotePayload.meta = meta;
              }
              const result = ref.set(remotePayload);
              if (result && typeof result.catch === 'function') {
                result.catch((err) => console.warn('[profile sync] failed to save remote profile', err));
              }
            }
          } catch (err) {
            console.warn('[profile sync] skipped due to error', err);
          }
        }
=======
      window.App.state.profile = nextProfile;
      if (typeof window.App.renderAndPersist === 'function') {
        window.App.renderAndPersist();
>>>>>>> parent of a1cee85 (Merge pull request #102 from JeddoreEnviroshake/codex/implement-user-profile-hydration-on-auth-change)
      }

      const editor = document.getElementById('profileEditor');
      editor?.setAttribute('data-open', 'false');
      editor?.setAttribute('aria-hidden', 'true');
      try { if (editor) editor.hidden = true; } catch {}
      unlockScroll();
    });
  }
})();
