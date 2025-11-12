(function (App) {
  'use strict';

  if (!App) return;

  try {
    App.initializeControls?.();

    if (typeof App.populateSyncForm === 'function') App.populateSyncForm();
    if (typeof App.updateRemoteStatus === 'function') App.updateRemoteStatus();

    if (typeof App.remoteConfigured === 'function' && App.remoteConfigured()) {
      if (typeof App.connectRemote === 'function') App.connectRemote();
    }

    console.log('About to render()');
    if (typeof App.render === 'function') App.render();

  } catch (err) {
    if (window.report) window.report(err, { module: 'main' });
    else console.error('Startup error:', err);
  }

})(window.App = window.App || {});
