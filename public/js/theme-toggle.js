/** MiCEL — modo claro / oscuro (solo iconos) */
(function () {
  const KEY = 'micel_theme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (_) {}

    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;

    // Oscuro → icono sol (pasar a claro). Claro → icono luna (pasar a oscuro).
    btn.innerHTML = t === 'light'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

    btn.setAttribute('aria-label', t === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
    btn.title = t === 'light' ? 'Modo oscuro' : 'Modo claro';
  }

  window.toggleTheme = function () {
    apply(current() === 'light' ? 'dark' : 'light');
  };

  function boot() {
    let saved = 'dark';
    try { saved = localStorage.getItem(KEY) || 'dark'; } catch (_) {}
    apply(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
