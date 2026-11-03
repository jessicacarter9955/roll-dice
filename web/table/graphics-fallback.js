// A missing GPU/WebGL context must not strand players behind the dice loader.
// Keep the original artwork visible, but never pretend the 3D game is playable.
(() => {
  const show = () => {
    document.getElementById('loader')?.remove();
    document.getElementById('loading-overlay')?.remove();
    const fallback = document.getElementById('graphics-error');
    if (fallback) fallback.hidden = false;
    window.parent.postMessage(JSON.stringify({
      type: 'graphics-error',
      message: 'WebGL is unavailable in this browser. Try a WebGL-enabled device.',
    }), location.origin);
  };
  window.addEventListener('error', event => {
    if (/webgl context|error creating webgl/i.test(String(event.message))) show();
  });
  window.addEventListener('unhandledrejection', event => {
    if (/webgl context|error creating webgl/i.test(String(event.reason))) show();
  });
})();
