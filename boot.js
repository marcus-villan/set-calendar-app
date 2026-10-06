// Runs first, before anything is drawn. Plain script (not a module) so it blocks the first paint.
// It lives in its own file (not inline in index.html) so the Content-Security-Policy can forbid
// ALL inline scripts, which is the main defence against script injection.
(function () {
  // 1) Refuse to run inside someone else's page (clickjacking: a hidden frame tricking taps).
  //    GitHub Pages can't send the header that normally does this, so we do it here.
  if (window.top !== window.self) {
    document.documentElement.hidden = true;
    try { window.top.location = window.self.location.href; } catch (e) { /* cross-origin parent: stay hidden */ }
    return;
  }
  // 2) Apply the saved theme before first paint so nobody sees a flash of the wrong one.
  //    Mirrors View.applyAppearance().
  try {
    var mode = localStorage.getItem('theme');       // 'system' | 'light' | 'dark'
    var palette = localStorage.getItem('palette');  // a theme id
    var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    if (palette && /^[a-z]+$/.test(palette)) root.setAttribute('data-theme', palette);
  } catch (e) {}
})();
