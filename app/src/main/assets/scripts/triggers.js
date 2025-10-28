// Volume → actions (safe no-ops if not in Ref view)
window.triggerGuyPlay = function () {
  try {
    if (document.body?.dataset?.view !== 'ref') return;
    document.getElementById('g_guyPlay')?.click();
  } catch (e) {
    console.warn('triggerGuyPlay error', e);
  }
};

window.triggerGirlPlay = function () {
  try {
    if (document.body?.dataset?.view !== 'ref') return;
    document.getElementById('g_girlPlay')?.click();
  } catch (e) {
    console.warn('triggerGirlPlay error', e);
  }
};
