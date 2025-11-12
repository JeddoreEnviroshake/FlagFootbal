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
    body.classList.add('profile-sheet-open'); // already used by CSS
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

  openers.forEach(btn => {
    btn.addEventListener('click', () => {
      // open the sheet UI (your existing code) and then lock:
      fieldSheet?.setAttribute('data-open', 'true');
      fieldSheet?.setAttribute('aria-hidden', 'false');
      lockScroll();
      // move focus into the input for good UX
      setTimeout(() => document.getElementById('profileFieldInput')?.focus(), 0);
    });
  });

  closers.forEach(btn => {
    btn.addEventListener('click', () => {
      fieldSheet?.setAttribute('data-open', 'false');
      fieldSheet?.setAttribute('aria-hidden', 'true');
      unlockScroll();
    });
  });
})();

