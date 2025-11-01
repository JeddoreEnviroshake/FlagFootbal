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
