// ==========================================
// CUOTALOCK-PANEL.JS — Panel CuotaLock del sistema MiCel
// Reemplaza al cuotalock-panel.js anterior. Usa la API /api/dispositivos
// (códigos de pago offline, un equipo por venta a crédito).
// Requiere: api.js + app.js ya cargados (se incluye después de app.js).
// ==========================================
(function () {
  'use strict';

  const ESTADOS = {
    al_dia:     { texto: 'Al día',     clase: 'badge-green' },
    por_vencer: { texto: 'Por vencer', clase: 'badge-amber' },
    vencido:    { texto: 'Vencido',    clase: 'badge-red' },
    liquidado:  { texto: 'Liquidado',  clase: 'badge-blue' },
    liberado:   { texto: 'Liberado',   clase: 'badge-purple' },
  };

  const CLAUSULA_BLOQUEO =
    ' El equipo incorpora el sistema de control CuotaLock: ante el incumplimiento de una cuota, el equipo podrá ser ' +
    'bloqueado hasta la regularización del pago, y no podrá desinstalarse ni restablecerse sin autorización de MiCel. ' +
    'Las llamadas de emergencia permanecerán disponibles y MiCel no accede a los datos personales del cliente.';

  let dispositivos = [];

  // ---------- utilidades ----------
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fecha = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  };

  const bs = (n) => 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const badge = (estado) => {
    const e = ESTADOS[estado] || ESTADOS.al_dia;
    return `<span class="badge ${e.clase}">${e.texto}</span>`;
  };

  const toast = (msg, tipo) => {
    if (typeof showToast === 'function') showToast(msg, tipo);
    else alert(msg);
  };

  function copiar(texto) {
    const ok = () => toast('Copiado al portapapeles', 'success');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(ok, () => copiarAlternativo(texto, ok));
    } else {
      copiarAlternativo(texto, ok);
    }
  }

  function copiarAlternativo(texto, ok) {
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); ok(); } catch (e) { toast('No se pudo copiar', 'error'); }
    document.body.removeChild(t);
  }

  // ---------- API ----------
  const DispositivosAPI = {
    list: () => api('/dispositivos'),
    get: (id) => api(`/dispositivos/${id}`),
    registrar: (celular_venta_id, device_id) =>
      api('/dispositivos', { method: 'POST', body: JSON.stringify({ celular_venta_id, device_id }) }),
    codigo: (id) => api(`/dispositivos/${id}/codigo`, { method: 'POST' }),
    liberar: (id) => api(`/dispositivos/${id}/liberar`, { method: 'POST' }),
  };

  async function cargarDispositivos() {
    dispositivos = await DispositivosAPI.list();
    return dispositivos;
  }

  // ---------- modal propio (no interfiere con closeModal del panel) ----------
  function asegurarModal() {
    let m = document.getElementById('modal-bloqueo');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay hidden';
    m.id = 'modal-bloqueo';
    m.style.zIndex = '1200';
    m.innerHTML = `
      <div class="modal-box" style="width:780px;max-width:96vw">
        <div class="modal-header">
          <h3 id="bloqueo-titulo">CuotaLock</h3>
          <button class="modal-close" onclick="BloqueoUI.cerrar()">✕</button>
        </div>
        <div id="bloqueo-body" style="padding:20px;max-height:70vh;overflow-y:auto"></div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="BloqueoUI.cerrar()">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    return m;
  }

  function abrirModal(titulo, html) {
    const m = asegurarModal();
    document.getElementById('bloqueo-titulo').textContent = titulo;
    document.getElementById('bloqueo-body').innerHTML = html;
    m.classList.remove('hidden');
  }

  function cerrar() {
    const m = document.getElementById('modal-bloqueo');
    if (m) m.classList.add('hidden');
  }

  // ---------- adapta el panel que ya existe en index.html ----------
  function adaptarPanel() {
    const panel = document.getElementById('panel-cuotalock');
    if (!panel || panel.dataset.adaptado) return;
    panel.dataset.adaptado = '1';

    const tarjetas = panel.querySelectorAll('.metric-card');
    const poner = (card, label, valor, trend) => {
      if (!card) return;
      const l = card.querySelector('.metric-label');
      const v = card.querySelector('.metric-value');
      const t = card.querySelector('.metric-trend');
      if (l && label) l.textContent = label;
      if (v && valor) v.textContent = valor;
      if (t && trend) t.textContent = trend;
    };
    poner(tarjetas[1], 'Vencidos', null, 'se bloquean solos');
    poner(tarjetas[2], 'Desbloqueo', 'Código offline', 'el celular no necesita internet');

    const desc = panel.querySelector('.card > p');
    if (desc) {
      desc.innerHTML =
        'Cada venta a crédito se vincula con el <strong>ID de 8 caracteres</strong> que muestra la app CuotaLock en el celular. ' +
        'El equipo se bloquea solo cuando vence su cuota (más los días de gracia) y se desbloquea con un <strong>código</strong> ' +
        'que se genera aquí al registrar el pago.';
    }

    const nombres = ['Venta', 'Cliente', 'Equipo', 'ID CuotaLock', 'Estado', 'Próxima cuota', 'Vence en el equipo', 'Acciones'];
    panel.querySelectorAll('thead th').forEach((th, i) => { if (nombres[i]) th.textContent = nombres[i]; });

    const header = panel.querySelector('.card-header');
    if (header && !document.getElementById('btn-cl-vincular')) {
      const grupo = document.createElement('div');
      grupo.style.cssText = 'display:flex;gap:8px;align-items:center';
      const actualizar = header.querySelector('button');
      const vincular = document.createElement('button');
      vincular.type = 'button';
      vincular.id = 'btn-cl-vincular';
      vincular.className = 'btn-sm btn-sm-primary';
      vincular.textContent = '＋ Vincular equipo';
      vincular.onclick = () => BloqueoUI.abrirVincular();
      grupo.appendChild(vincular);
      if (actualizar) grupo.appendChild(actualizar);
      header.appendChild(grupo);
    }
  }

  // ---------- listado en el panel CuotaLock ----------
  window.loadCuotaLock = async function loadCuotaLock() {
    adaptarPanel();
    const tbody = document.getElementById('cuotalock-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--gray-400)">Cargando equipos…</td></tr>';
    try {
      await cargarDispositivos();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger,#f87171)">${esc(e.message)}</td></tr>`;
      return;
    }
    renderLista();
  };

  function renderLista() {
    const tbody = document.getElementById('cuotalock-body');
    if (!tbody) return;

    const activos = dispositivos.filter((d) => d.estado === 'al_dia' || d.estado === 'por_vencer').length;
    const vencidos = dispositivos.filter((d) => d.estado === 'vencido').length;
    const elA = document.getElementById('cl-activos');
    const elB = document.getElementById('cl-bloqueados');
    if (elA) elA.textContent = activos;
    if (elB) elB.textContent = vencidos;

    if (!dispositivos.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--gray-400)">Aún no hay equipos vinculados. Usa «＋ Vincular equipo» o abre el contrato de una venta a crédito.</td></tr>';
      return;
    }

    tbody.innerHTML = dispositivos.map((d) => {
      const p = d.proxima_cuota;
      const dias = d.dias_restantes == null ? '' : d.dias_restantes < 0 ? `hace ${-d.dias_restantes} d` : `en ${d.dias_restantes} d`;
      const acciones =
        d.estado === 'liberado'
          ? ''
          : d.estado === 'liquidado'
            ? `<button type="button" class="btn-sm btn-sm-primary" onclick="BloqueoUI.liberar(${d.id})">Liberar</button> `
            : `<button type="button" class="btn-sm btn-sm-primary" onclick="BloqueoUI.generarCodigo(${d.id})">Generar código</button> `;
      return `<tr>
        <td><code class="code-tag">${esc(d.venta_codigo || d.celular_venta_id)}</code></td>
        <td>${esc(d.cliente)}${d.telefono ? `<br><span style="font-size:11px;color:var(--gray-400)">${esc(d.telefono)}</span>` : ''}</td>
        <td>${esc(d.modelo || '—')}<br><span style="font-size:11px;color:var(--gray-400)">IMEI ${esc(d.imei || '—')}</span></td>
        <td style="font-family:monospace;font-weight:700;letter-spacing:1px">${esc(d.device_id)}</td>
        <td>${badge(d.estado)}</td>
        <td>${p ? `Nº ${p.numero} · ${bs(p.monto)}<br><span style="font-size:11px;color:var(--gray-400)">${fecha(p.fecha_vencimiento)}${dias ? ' (' + dias + ')' : ''}</span>` : '—'}</td>
        <td>${fecha(d.vence_en)}</td>
        <td style="white-space:nowrap">${acciones}<button type="button" class="btn-sm" onclick="BloqueoUI.historial(${d.id})">Historial</button></td>
      </tr>`;
    }).join('');
  }

  // ---------- vincular un equipo desde el panel ----------
  async function abrirVincular() {
    abrirModal('Vincular equipo', '<p style="color:var(--gray-400)">Cargando ventas a crédito…</p>');
    let ventas, vinculados;
    try {
      [ventas, vinculados] = await Promise.all([api('/celulares/ventas'), DispositivosAPI.list()]);
    } catch (e) {
      abrirModal('Vincular equipo', `<p style="color:var(--danger,#f87171)">${esc(e.message)}</p>`);
      return;
    }
    const usados = new Set(vinculados.map((d) => String(d.celular_venta_id)));
    const libres = (ventas || []).filter((v) => v.plan_pago && !usados.has(String(v.id)));
    if (!libres.length) {
      abrirModal('Vincular equipo', '<p>No hay ventas a crédito sin equipo vinculado. Registra primero la venta a cuotas en «Venta de Celulares».</p>');
      return;
    }
    const opciones = libres.map((v) => {
      const modelo = v.equipo && v.equipo.modelo ? v.equipo.modelo : 'equipo';
      return `<option value="${Number(v.id)}">${esc(v.codigo)} · ${esc(v.cliente)} · ${esc(modelo)}</option>`;
    }).join('');
    abrirModal(
      'Vincular equipo',
      `<p style="font-size:13px;color:var(--gray-400);margin-bottom:14px">Instala CuotaLock en el celular del cliente, actívalo como Device Owner y escribe aquí el ID de 8 caracteres que muestra la app.</p>
       <label style="font-size:12px;color:var(--gray-400)">Venta a crédito</label>
       <select id="cl-venta-sel" class="select-branch" style="width:100%;margin:6px 0 14px">${opciones}</select>
       <label style="font-size:12px;color:var(--gray-400)">ID del equipo (8 caracteres)</label>
       <input id="cl-id-input" maxlength="8" placeholder="Ej: AC8EAA35" autocomplete="off"
         style="display:block;width:100%;margin:6px 0 16px;text-transform:uppercase;font-family:monospace;font-size:16px;letter-spacing:3px;padding:10px 12px;border:1px solid var(--border,#2a2a2e);border-radius:10px;background:var(--surface-2,#1b1b1e);color:var(--text,inherit)">
       <button class="btn-primary" onclick="BloqueoUI.vincularDesdePanel()">Vincular y generar código</button>`
    );
  }

  async function vincularDesdePanel() {
    const sel = document.getElementById('cl-venta-sel');
    const input = document.getElementById('cl-id-input');
    const ventaId = sel ? Number(sel.value) : 0;
    const id = (input ? input.value : '').trim().toUpperCase();
    if (!ventaId) return;
    if (!/^[0-9A-F]{8}$/.test(id)) {
      toast('El ID son 8 caracteres (números y letras A-F) que muestra CuotaLock.', 'error');
      return;
    }
    try {
      const r = await DispositivosAPI.registrar(ventaId, id);
      if (r.codigo) mostrarCodigo('activacion', r.dispositivo, r.codigo, r.vence_en);
      else toast('Equipo vinculado, pero no hay una fecha futura para emitir el código.', 'error');
      refrescar();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- códigos ----------
  function mensajeCodigo(tipo, d, codigo, vence) {
    const equipo = `${d.modelo || 'equipo'} (ID ${d.device_id})`;
    if (tipo === 'liberacion') {
      return `Hola ${d.cliente}, ¡felicidades! Terminaste de pagar tu ${equipo}. Tu código de liberación es: ${codigo}. Ingrésalo en la app CuotaLock para liberar el equipo. Gracias por confiar en MiCel.`;
    }
    if (tipo === 'activacion') {
      return `Hola ${d.cliente}, este es el código de activación de tu ${equipo}: ${codigo}. Ingrésalo en la app CuotaLock. Tu primer vencimiento es el ${fecha(vence)}.`;
    }
    return `Hola ${d.cliente}, recibimos tu pago. Tu código de desbloqueo para el ${equipo} es: ${codigo}. Ingrésalo en la app CuotaLock. Nuevo vencimiento: ${fecha(vence)}. Gracias por tu pago.`;
  }

  function mostrarCodigo(tipo, d, codigo, vence) {
    const titulos = { pago: 'Código de pago', activacion: 'Código de activación', liberacion: 'Código de liberación' };
    const msg = mensajeCodigo(tipo, d, codigo, vence);
    window._bloqueoMsg = msg;
    window._bloqueoCodigo = codigo;
    abrirModal(
      titulos[tipo] || 'Código',
      `<div style="text-align:center">
        <div style="font-size:12px;color:var(--gray-400)">${esc(d.cliente)} · ${esc(d.modelo || '')} · ID <b style="font-family:monospace">${esc(d.device_id)}</b></div>
        <div style="font-family:monospace;font-size:34px;font-weight:800;letter-spacing:3px;margin:14px 0;padding:14px;border:2px dashed var(--primary,#ff1440);border-radius:12px;background:var(--surface-2,#1b1b1e)">${esc(codigo)}</div>
        <div style="font-size:12.5px;color:var(--gray-400)">${tipo === 'liberacion' ? 'Libera el equipo: se quitan todas las restricciones.' : `Nuevo vencimiento del equipo: <b style="color:var(--text,inherit)">${fecha(vence)}</b>`}</div>
        <textarea readonly rows="4" style="width:100%;margin-top:14px;padding:10px;border:1px solid var(--border,#2a2a2e);border-radius:10px;font-size:12.5px;resize:none;background:var(--surface-2,#1b1b1e);color:var(--text,inherit)">${esc(msg)}</textarea>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="BloqueoUI.copiarCodigo()">Copiar código</button>
          <button class="btn-secondary" onclick="BloqueoUI.copiarMensaje()">Copiar mensaje</button>
          <button class="btn-primary" onclick="BloqueoUI.whatsapp()">Enviar por WhatsApp</button>
        </div>
      </div>`
    );
  }

  async function generarCodigo(id) {
    try {
      const r = await DispositivosAPI.codigo(id);
      mostrarCodigo('pago', r.dispositivo, r.codigo, r.vence_en);
      refrescar();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function liberar(id) {
    if (!confirm('¿Generar el código de liberación? El equipo quedará marcado como liberado.')) return;
    try {
      const r = await DispositivosAPI.liberar(id);
      mostrarCodigo('liberacion', r.dispositivo, r.codigo, null);
      refrescar();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function historial(id) {
    try {
      const d = await DispositivosAPI.get(id);
      const filas = (d.historial || []).map((h) => `<tr>
        <td>${fecha(h.fecha)}</td>
        <td>${h.tipo === 'liberacion' ? 'Liberación' : 'Pago / activación'}</td>
        <td style="font-family:monospace;font-weight:700">${esc(h.codigo)}</td>
        <td>${fecha(h.vence_en)}</td>
        <td>${esc(h.generado_por || '—')}</td>
      </tr>`).join('');
      abrirModal(
        `Historial — ${d.cliente}`,
        `<p style="font-size:12.5px;color:var(--gray-400);margin-bottom:10px">${esc(d.modelo || '')} · ID <b style="font-family:monospace">${esc(d.device_id)}</b> · ${badge(d.estado)}</p>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Código</th><th>Vence</th><th>Generó</th></tr></thead>
          <tbody>${filas || '<tr><td colspan="5" style="color:var(--gray-400)">Sin códigos todavía.</td></tr>'}</tbody>
        </table></div>`
      );
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- panel dentro del contrato de la venta ----------
  async function insertarPanelContrato(ventaId) {
    const cont = document.getElementById('contrato-cel-preview');
    if (!cont) return;
    let lista;
    try {
      lista = await cargarDispositivos();
    } catch (e) {
      return; // sin permiso (técnico) o sin conexión: no se muestra el panel
    }
    if (typeof contratoActualId !== 'undefined' && String(contratoActualId) !== String(ventaId)) return;

    const previo = document.getElementById('bloqueo-panel');
    if (previo) previo.remove();

    const d = lista.find((x) => String(x.celular_venta_id) === String(ventaId));
    const base = 'border:1px solid #c7d2fe;background:#eef2ff;border-radius:8px;padding:12px;margin-bottom:14px;font-size:12.5px;color:#1e1b4b';
    const chip = (estado) => {
      const e = ESTADOS[estado] || ESTADOS.al_dia;
      return `<b>${e.texto}</b>`;
    };
    let cuerpo;

    if (d) {
      const acciones =
        d.estado === 'liberado'
          ? '<span style="color:#6b7280">Equipo liberado.</span>'
          : d.estado === 'liquidado'
            ? `<button class="btn-sm btn-sm-primary" onclick="BloqueoUI.liberar(${d.id})">Liberar equipo</button>`
            : `<button class="btn-sm btn-sm-primary" onclick="BloqueoUI.generarCodigo(${d.id})">Generar código</button>`;
      cuerpo = `<div>ID del equipo: <b style="font-family:monospace">${esc(d.device_id)}</b> · Estado: ${chip(d.estado)} · Vence: <b>${fecha(d.vence_en)}</b></div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${acciones}
          <button class="btn-sm" onclick="BloqueoUI.historial(${d.id})">Historial</button></div>`;
    } else {
      cuerpo = `<div style="margin-bottom:8px">Este equipo aún no está vinculado. Instala CuotaLock en el celular y escribe aquí el <b>ID de 8 caracteres</b> que muestra la app.</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="bloqueo-id-input" maxlength="8" placeholder="Ej: AC8EAA35" autocomplete="off"
            style="text-transform:uppercase;font-family:monospace;font-size:14px;letter-spacing:2px;padding:6px 10px;border:1px solid #c7d2fe;border-radius:6px;width:150px;background:#fff;color:#1e1b4b">
          <button class="btn-sm btn-sm-primary" onclick="BloqueoUI.vincular(${Number(ventaId)})">Vincular equipo</button>
        </div>`;
    }

    cont.insertAdjacentHTML(
      'afterbegin',
      `<div id="bloqueo-panel" style="${base}"><div style="font-weight:700;margin-bottom:6px">🔒 Bloqueo del equipo (CuotaLock)</div>${cuerpo}</div>`
    );
  }

  async function vincular(ventaId) {
    const input = document.getElementById('bloqueo-id-input');
    const id = (input ? input.value : '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(id)) {
      toast('El ID son 8 caracteres (números y letras A-F) que muestra CuotaLock.', 'error');
      return;
    }
    try {
      const r = await DispositivosAPI.registrar(ventaId, id);
      if (r.codigo) mostrarCodigo('activacion', r.dispositivo, r.codigo, r.vence_en);
      else toast('Equipo vinculado, pero no hay una fecha futura para emitir el código.', 'error');
      refrescar();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // refresca el panel del contrato (si está abierto) y la lista del panel CuotaLock
  function refrescar() {
    if (typeof contratoActualId !== 'undefined' && contratoActualId != null) {
      const modal = document.getElementById('modal-contrato-cel');
      if (modal && !modal.classList.contains('hidden')) insertarPanelContrato(contratoActualId);
    }
    if (document.getElementById('cuotalock-body')) {
      cargarDispositivos().then(renderLista).catch(() => {});
    }
  }

  // ---------- resultado de registrar un pago de cuota ----------
  async function mostrarResultadoPago(b) {
    let d = null;
    try {
      const lista = await cargarDispositivos();
      d = lista.find((x) => x.id === b.dispositivo_id) || null;
    } catch (e) { /* se muestra sin datos extra */ }
    if (!d) d = { cliente: '', modelo: '', device_id: b.device_id };

    if (b.codigo) {
      mostrarCodigo('pago', d, b.codigo, b.vence_en);
    } else if (b.motivo === 'liquidado') {
      abrirModal(
        'Cuotas liquidadas',
        `<p>Se registró la última cuota. El cliente ya terminó de pagar.</p>
         <p style="margin-top:10px"><button class="btn-primary" onclick="BloqueoUI.liberar(${b.dispositivo_id})">Generar código de liberación</button></p>`
      );
    } else if (b.motivo === 'vencido') {
      abrirModal(
        'Pago registrado',
        '<p>El cliente todavía tiene cuotas vencidas, así que <b>no se emitió código</b>: el equipo seguirá bloqueado hasta que se ponga al día.</p>'
      );
    }
  }

  // ---------- engancha el panel existente sin tocar app.js ----------
  function instalarHooks() {
    // 1) Panel de bloqueo al abrir el contrato
    if (typeof window.mostrarContrato === 'function' && !window.mostrarContrato._cuotaLock) {
      const original = window.mostrarContrato;
      window.mostrarContrato = function (ventaId) {
        const r = original.apply(this, arguments);
        insertarPanelContrato(ventaId);
        return r;
      };
      window.mostrarContrato._cuotaLock = true;
    }

    // 2) Cláusula de bloqueo en el contrato (vista previa e impresión)
    if (typeof window._contratoHtml === 'function' && !window._contratoHtml._cuotaLock) {
      const original = window._contratoHtml;
      window._contratoHtml = function () {
        const html = original.apply(this, arguments);
        return String(html).replace('conforme y en funcionamiento.', 'conforme y en funcionamiento.' + CLAUSULA_BLOQUEO);
      };
      window._contratoHtml._cuotaLock = true;
    }

    // 3) Al registrar un pago, mostrar el código de desbloqueo
    if (typeof window.marcarCuotaPagada === 'function' && !window.marcarCuotaPagada._cuotaLock) {
      window.marcarCuotaPagada = async function (ventaId, cuotaId) {
        try {
          const r = await CelularesAPI.pagarCuota(cuotaId); // el backend alterna pagada/pendiente
          await loadCelulares();
          mostrarContrato(ventaId);
          if (r && r.bloqueo) mostrarResultadoPago(r.bloqueo);
        } catch (e) {
          toast('No se pudo actualizar la cuota: ' + e.message, 'error');
        }
      };
      window.marcarCuotaPagada._cuotaLock = true;
    }
  }

  window.BloqueoUI = {
    abrirVincular,
    vincularDesdePanel,
    generarCodigo,
    liberar,
    historial,
    vincular,
    cerrar,
    copiarCodigo: () => copiar(window._bloqueoCodigo || ''),
    copiarMensaje: () => copiar(window._bloqueoMsg || ''),
    whatsapp: () => window.open('https://wa.me/?text=' + encodeURIComponent(window._bloqueoMsg || ''), '_blank'),
  };

  instalarHooks();
  adaptarPanel();
  document.addEventListener('DOMContentLoaded', adaptarPanel);
})();
