// Volume → actions (safe no-ops if not in Ref view)
window.triggerGuyPlay = function () {
  try {
    if (document.body?.dataset?.view !== 'ref') return;
    if (typeof window.performGuyPlay === 'function') {
      window.performGuyPlay();
    }
  } catch (e) {
    console.warn('triggerGuyPlay error', e);
  }
};

window.triggerGirlPlay = function () {
  try {
    if (document.body?.dataset?.view !== 'ref') return;
    if (typeof window.performGirlPlay === 'function') {
      window.performGirlPlay();
    }
  } catch (e) {
    console.warn('triggerGirlPlay error', e);
  }
};
