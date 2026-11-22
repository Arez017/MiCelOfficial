/* ===== Ventana de confirmación con el estilo de MiCel =====
 * Uso:  if (!(await confirmarAccion({ titulo, mensaje, aceptar, cancelar }))) return;
 * Devuelve una promesa: true si se pulsa «aceptar», false si se cancela (botón, Esc o clic afuera).
 * Usa las mismas clases que los modales del sistema, así respeta el modo oscuro y el claro.
 */
(function () {
  function escapar(t) {
    return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.confirmarAccion = function ({ titulo = '¿Confirmar?', mensaje = '', detalles = [], aceptar = 'Aceptar', cancelar = 'Cancelar' } = {}) {
    return new Promise((resolver) => {
      if (!document.body) { resolver(window.confirm(titulo + '\n\n' + mensaje)); return; }

      const capa = document.createElement('div');
      capa.className = 'modal-overlay';
      capa.style.zIndex = '1000'; // por encima de cualquier modal abierto
      capa.setAttribute('role', 'dialog');
      capa.setAttribute('aria-modal', 'true');
      const lista = detalles.length
        ? '<ul style="margin:10px 0 0 18px;padding:0;color:var(--gray-900);font-size:14px;line-height:1.7">' +
          detalles.map((d) => '<li>' + escapar(d) + '</li>').join('') + '</ul>'
        : '';
      capa.innerHTML =
        '<div class="modal-box" style="width:min(440px,92vw)">' +
        '  <div class="modal-header">' +
        '    <h3 style="display:flex;align-items:center;gap:10px">' +
        '      <span style="display:inline-flex;width:28px;height:28px;border-radius:50%;align-items:center;justify-content:center;' +
        'background:var(--warning-light, rgba(255,184,0,.15));color:var(--warning, #ffb800);font-weight:800">!</span>' +
        escapar(titulo) + '</h3>' +
        '  </div>' +
        '  <div style="padding:18px 20px;color:var(--gray-600);font-size:14px;line-height:1.55">' +
        escapar(mensaje) + lista +
        '  </div>' +
        '  <div class="modal-footer">' +
        '    <button type="button" class="btn-secondary" data-r="no">' + escapar(cancelar) + '</button>' +
        '    <button type="button" class="btn-primary" data-r="si">' + escapar(aceptar) + '</button>' +
        '  </div>' +
        '</div>';

      function cerrar(valor) {
        document.removeEventListener('keydown', teclas, true);
        capa.remove();
        resolver(valor);
      }
      function teclas(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
      }

      capa.addEventListener('click', (e) => {
        if (e.target === capa) { cerrar(false); return; }
        const b = e.target.closest('[data-r]');
        if (b) cerrar(b.dataset.r === 'si');
      });
      document.addEventListener('keydown', teclas, true);
      document.body.appendChild(capa);
      // el foco queda en «Revisar/Cancelar»: un Enter apurado no guarda un 0 por error
      capa.querySelector('[data-r="no"]').focus();
    });
  };
})();
