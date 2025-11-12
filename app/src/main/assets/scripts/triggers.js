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

  function lockScroll() {
    scrollY = window.scrollY || window.pageYOffset || 0;
    body.classList.add('profile-sheet-open');
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  }

  function unlockScroll() {
    body.classList.remove('profile-sheet-open');
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    window.scrollTo(0, scrollY);
  }

  // Helper: swap text input -> <select> populated from Firebase Teams
  async function setupProfileTeamPicker() {
    const input = document.getElementById('profileFieldInput');
    if (!input) return;

    const select = document.createElement('select');
    select.className = 'profile-field-form__input';

    try {
      const options = typeof window.App?.fetchTeamOptions === 'function'
        ? await window.App.fetchTeamOptions()
        : [];

      if (!options.length) return; // fallback: keep text input

      options.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });

      // preselect current value if present
      const current = (window.App?.state?.profile?.teamName || '').trim();
      if (current) {
        const idx = options.indexOf(current);
        if (idx >= 0) select.selectedIndex = idx;
      }

      input.replaceWith(select);
      select.id = 'profileFieldInput'; // preserve id for submit handler
    } catch (e) {
      console.warn('[profile team picker] falling back to text input', e);
    }
  }

  // Open the single-field editor
  function openProfileFieldEditor(fieldKey, opts = {}) {
    if (fieldSheet) fieldSheet.dataset.key = fieldKey;

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

    // Swap to dropdown for Team
    if (fieldKey === 'teamName') {
      setupProfileTeamPicker();
      const helper = document.getElementById('profileFieldHelper');
      if (helper) helper.textContent = 'Pick your team from the directory.';
      if (descEl) descEl.textContent = 'Select your team.';
    }

    fieldSheet?.setAttribute('data-open', 'true');
    fieldSheet?.setAttribute('aria-hidden', 'false');
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

  // Closers
  closers.forEach(btn => {
    btn.addEventListener('click', () => {
      fieldSheet?.setAttribute('data-open', 'false');
      fieldSheet?.setAttribute('aria-hidden', 'true');
      unlockScroll();
    });
  });

  // Submit handler — saves to App.state.profile and persists
  const profileFieldForm = document.getElementById('profileFieldForm');
  if (profileFieldForm) {
    profileFieldForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const key = fieldSheet?.dataset?.key;
      if (!key) return;

      const valEl = document.getElementById('profileFieldInput');
      const next = valEl ? (valEl.value || '').trim() : '';

      if (!window.App?.state?.profile) window.App.state.profile = {};
      window.App.state.profile[key] = next;
      if (typeof window.App.renderAndPersist === 'function') {
        window.App.renderAndPersist();
      }

      fieldSheet?.setAttribute('data-open', 'false');
      fieldSheet?.setAttribute('aria-hidden', 'true');
      unlockScroll();
    });
  }
})();
