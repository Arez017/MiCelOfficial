
// ===== Toasts abajo-derecha (estilo MVP) =====
function showToast(message, type) {
  type = type || 'ok';
  if (type === true) type = 'error'; // compat
  if (type !== 'error' && type !== 'warn' && type !== 'info' && type !== 'ok') {
    type = 'ok';
  }
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const icons = { ok: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = 'micel-toast ' + type;
  el.innerHTML =
    '<div class="t-icon">' + (icons[type] || '✓') + '</div>' +
    '<div class="t-body"></div>' +
    '<button type="button" class="t-close" aria-label="Cerrar">×</button>';
  el.querySelector('.t-body').textContent = String(message || '');
  el.querySelector('.t-close').onclick = () => dismissToast(el);
  stack.appendChild(el);
  const ttl = type === 'error' ? 5000 : 3200;
  setTimeout(() => dismissToast(el), ttl);
}
function dismissToast(el) {
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 280);
}
window.showToast = showToast;

/** Candado anti doble-clic / lag en formularios */
const _locks = Object.create(null);
function withSubmitLock(key, btnSelector, fn) {
  return async function () {
    if (_locks[key]) {
      if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
      return;
    }
    _locks[key] = true;
    const btn = btnSelector ? document.querySelector(btnSelector) : null;
    let oldText = '';
    if (btn) {
      btn.disabled = true;
      oldText = btn.textContent;
      btn.textContent = 'Guardando…';
    }
    try {
      return await fn.apply(this, arguments);
    } finally {
      _locks[key] = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || btn.textContent;
      }
    }
  };
}


// ==========================================
// APP.JS — MiCel v4.0 (API Laravel / Sanctum)
// Orden de scripts: api.js → app.js → extensions.js
// ==========================================

let currentUser = null;
let ordersData = [];
let stockData = [];
let clientesData = [];
let recibosData = [];
let tecnicos = [];
let ventasHoy = [];
let celularesInventario = [];
let celularesData = [];
let stockEditingId = null;
let toastStockCerrado = false;
let toastStockUltimoMensaje = '';

// ---------- helpers de sesión (api.js) ----------
// getToken, setSession, clearSession, getStoredUser, mapRol, mapStatusLabel, mapStatusToApi
// AuthAPI, OrdersAPI, StockAPI, ClientesAPI, VentasAPI, RecibosAPI, UsuariosAPI, CelularesAPI

function normalizeUser(u) {
  return {
    id: u.id,
    code: u.code,
    username: u.username,
    user: u.username,
    name: u.name,
    rol: mapRol(u.rol),
    rolRaw: u.rol,
    branch: u.sucursal || '',   // "branch" es el nombre local; el dato real ahora viene en u.sucursal
    sucursal_id: u.sucursal_id ?? null,
    active: u.active,
    techCode: u.code,
    telefono: u.telefono,
    foto_path: u.foto_path,
  };
}

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-error');
  if (!errEl) return;

  if (!user || !pass) {
    errEl.style.display = 'block';
    errEl.textContent = 'Ingresa usuario y contraseña.';
    return;
  }

  try {
    errEl.style.display = 'none';
    const res = await AuthAPI.login(user, pass);
    setSession(res.token, res.user);
    currentUser = normalizeUser(res.user);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    applyUserSession();
    await initApp();
  } catch (e) {
    errEl.style.display = 'block';
    errEl.textContent = e.message || 'Usuario o contraseña incorrectos';
  }
}

function applyUserSession() {
  if (!currentUser) return;
  const nameEl = document.getElementById('sidebar-name');
  if (nameEl) nameEl.textContent = currentUser.name;
  const roleEl = document.getElementById('sidebar-role');
  if (roleEl) roleEl.textContent = currentUser.rol;
  // Avatar del sidebar: foto real si existe, si no iniciales
  if (typeof updateSidebarAvatar === 'function') {
    updateSidebarAvatar();
  } else {
    const span = document.getElementById('sidebar-avatar-initials');
    if (span) span.textContent = initials(currentUser.name);
  }

  const rolBadgeEl = document.getElementById('topbar-rol');
  if (rolBadgeEl) {
    rolBadgeEl.textContent = currentUser.rol;
    rolBadgeEl.className =
      'badge ' +
      (currentUser.rol === 'Administrador' || currentUser.rol === 'Super Admin'
        ? 'badge-purple'
        : 'badge-amber');
  }

  const navUsuarios = document.getElementById('nav-usuarios');
  if (navUsuarios) {
    navUsuarios.style.display = currentUser.rol === 'Técnico' ? 'none' : '';
  }
  const navMisOrdenes = document.getElementById('nav-mis-ordenes');
  if (navMisOrdenes) {
    navMisOrdenes.style.display = currentUser.rol === 'Técnico' ? '' : 'none';
  }

  // Stock: solo Admin/SuperAdmin modifican — el técnico ve inventario en solo lectura
  aplicarPermisosStock();
}

function aplicarPermisosStock() {
  const admin = esAdminOSuper();
  // Botón superior "+ Agregar repuesto"
  const topBtn = document.getElementById('topbar-btn');
  // Si estamos en panel stock, ocultar botón para técnico
  const panelStock = document.getElementById('panel-stock');
  if (panelStock && panelStock.classList.contains('active') && topBtn) {
    topBtn.style.display = admin ? '' : 'none';
  }
  // Cualquier botón fijo de agregar en stock modal / panel
  document.querySelectorAll('button.btn-primary, button.btn-secondary').forEach(btn => {
    const oc = btn.getAttribute('onclick') || '';
    if (oc.includes("openModal('repuesto')") || oc.includes('openModal("repuesto")')) {
      btn.style.display = admin ? '' : 'none';
    }
  });
}

async function doLogout() {
  try { await AuthAPI.logout(); } catch (_) {}
  clearSession();
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  const u = document.getElementById('login-user');
  const p = document.getElementById('login-pass');
  if (u) u.value = '';
  if (p) p.value = '';
}

document.addEventListener('keydown', (e) => {
  const login = document.getElementById('login-screen');
  if (e.key === 'Enter' && login && !login.classList.contains('hidden')) doLogin();
});

// ---------- init ----------
async function initApp() {
  await loadSucursales();
  await loadUsuarios();

  window.usuarios = (tecnicos || []).map((t) => ({
    user: t.user || t.username,
    pass: '',
    techCode: t.code,
    name: t.name,
    rol: t.rol,
  }));

  await Promise.all([
    loadOrders(),
    loadStock(),
    loadClientes(),
    loadVentas(),
    loadRecibos(),
    loadCelulares(),
    loadReporteTecnicos(),
    loadHistorial(),
  ]);

  populateTechSelects();
  poblarSelectSucursal(document.getElementById('orders-filter-branch'), { conTodas: true });
  poblarSelectSucursal(document.getElementById('historial-filter-branch'), { conTodas: true });
  poblarSelectSucursal(document.getElementById('modal-branch'));
  poblarSelectSucursal(document.getElementById('nu-branch'), { conAmbas: true });
  poblarSelectSucursal(document.getElementById('recibo-sucursal'));
  poblarSelectSucursal(document.getElementById('new-cli-branch'));
  poblarSelectSucursal(document.getElementById('new-user-branch'), { conAmbas: true });
  poblarSelectSucursal(document.getElementById('cel-inv-branch'));
  poblarSelectSucursal(document.getElementById('venta-sucursal'));
  if (typeof renderUsers === 'function') renderUsers();

  // Datos reales en Dashboard y Reportes
  updateDashboard();
  renderReportesCompletos();
}

// ===== Sucursales reales (reemplaza las opciones fijas KevSolutions/Upea) =====
async function loadSucursales() {
  try {
    window._sucursales = await SucursalesAPI.list(); // [{id, nombre, activa, ...}]
  } catch (e) {
    console.error(e);
    window._sucursales = [];
  }
}

/**
 * Llena un <select> con las sucursales reales.
 * opts.conTodas: agrega "Todas las sucursales" (value="") al inicio — para filtros.
 * opts.conAmbas: agrega "Ambas" (value="") al final — para el form de usuario
 *                (Admin/SuperAdmin sin sucursal fija).
 */
function poblarSelectSucursal(selectEl, opts = {}) {
  if (!selectEl) return;
  const sucursales = window._sucursales || [];
  const partes = [];

  if (opts.conTodas) partes.push(`<option value="">Todas las sucursales</option>`);
  sucursales.forEach((s) => partes.push(`<option value="${s.id}">${s.nombre}</option>`));
  if (opts.conAmbas) partes.push(`<option value="">Ambas</option>`);

  selectEl.innerHTML = partes.join('');
}

async function loadUsuarios() {
  try {
    const list = await UsuariosAPI.list();
    tecnicos = list.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      user: u.username,
      username: u.username,
      rol: mapRol(u.rol),
      rolRaw: u.rol,
      branch: u.sucursal || '',
      sucursal_id: u.sucursal_id ?? null,
      active: u.active,
      email: u.email,
    }));
  } catch (e) {
    console.error(e);
    alert('No se pudieron cargar usuarios: ' + e.message);
  }
}

function normalizeOrder(o) {
  return {
    id: o.id,
    code: o.code,
    client: o.client,
    phone: o.phone || '',
    device: o.device,
    service: o.service,
    techCode: o.tecnico?.code || '',
    tecnico_id: o.tecnico?.id || null,
    techName: o.tecnico?.name || '—',
    branch: o.sucursal || '',
    sucursal_id: o.sucursal_id ?? null,
    status: o.status_label || mapStatusLabel(o.status),
    statusRaw: o.status,
    monto: o.monto || 0,
    obs: o.obs || '',
    date: o.created_at ? new Date(o.created_at).toLocaleDateString('es-BO') : '',
  };
}

async function loadOrders(params = {}) {
  try {
    const list = await OrdersAPI.list(params);
    ordersData = list.map(normalizeOrder);
    renderOrders(ordersData);
    renderDashOrders();
    populateReciboOrden();
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof renderReportesCompletos === 'function') renderReportesCompletos();
  } catch (e) {
    console.error(e);
  }
}

function normalizeStock(s) {
  return {
    dbId: s.id,
    id: s.code || ('REP-' + s.id),
    name: s.name || '',
    cat: s.categoria || s.cat || '',
    qty: Number(s.qty) || 0,
    min: Number(s.min) || 1,
    precio: Number(s.precio) || 0,
    foto_url: s.foto_url || null,
    foto_path: s.foto_path || null,
  };
}

async function loadStock(params = {}) {
  try {
    const list = await StockAPI.list(params);
    stockData = list.map(normalizeStock);
    renderStock(stockData);
    if (typeof updateDashboard === 'function') updateDashboard();
  } catch (e) {
    console.error(e);
  }
}


// Extender ClientesAPI (cuenta app + activar)
if (typeof ClientesAPI !== 'undefined') {
  ClientesAPI.gestionarCuenta = (id, body = {}) =>
    api('/clientes/' + id + '/cuenta', { method: 'PATCH', body: JSON.stringify(body) });
  ClientesAPI.toggleActivo = (id, active) =>
    api('/clientes/' + id + '/activar', { method: 'PATCH', body: JSON.stringify({ active: !!active }) });
}

async function loadClientes(params = {}) {
  try {
    const list = await ClientesAPI.list(params);
    clientesData = list.map((c) => ({
      id: c.code || String(c.id),
      dbId: c.id,
      name: c.name,
      phone: c.phone,
      branch: c.sucursal?.nombre || c.sucursal || '',
      sucursal_id: c.sucursal_id ?? null,
      visits: c.visits || 0,
      lastVisit: c.last_visit
        ? new Date(c.last_visit).toLocaleDateString('es-BO')
        : '—',
      username: c.username || '',
      tieneCuenta: !!(c.tiene_cuenta || c.username),
      active: c.active !== false,
    }));
    renderClientes(clientesData);
  } catch (e) {
    console.error(e);
  }
}

async function loadVentas() {
  try {
    const list = await VentasAPI.list();
    ventasHoy = list.map((v) => ({
      hora: v.hora,
      client: v.client || '—',
      detail: v.detail,
      techCode: v.tecnico?.code || '',
      techName: v.tecnico?.name || '—',
      monto: v.monto,
      pago: (v.pago || '').toLowerCase() === 'qr' ? 'QR' : 'Efectivo',
    }));
    renderVentas();
  } catch (e) {
    console.error(e);
  }
}


function fmtFechaRecibo(f) {
  if (!f) return '';
  const s = String(f);
  // ISO: 2026-10-07T00:00:00.000000Z → 07/10/2026
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    try {
      const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    } catch (_) {}
    return s.slice(0, 10);
  }
  return s;
}
function fmtHoraRecibo(h) {
  if (!h) return '';
  const s = String(h).trim();
  // "19:30:00" | "19:30"
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return m[1].padStart(2, '0') + ':' + m[2];
  return s;
}

async function loadRecibos() {
  try {
    const list = await RecibosAPI.list();
    recibosData = list.map((r) => ({
      id: r.id,
      numRecibo: r.num_recibo,
      ordenCode: r.orden?.code || r.orden_id,
      orden: r.orden?.code || '',
      cliente: r.cliente,
      telefono: r.telefono || '—',
      equipo: r.equipo,
      servicio: r.servicio,
      monto: parseFloat(r.monto) || 0,
      pago: r.pago,
      techCode: r.tecnico?.code || '',
      techName: r.tecnico?.name || '—',
      sucursal: r.sucursal?.nombre || '',
      sucursal_id: r.sucursal_id ?? null,
      obs: r.obs || '',
      tipo: r.tipo || 'Recibo de servicio técnico',
      hora: fmtHoraRecibo(r.hora),
      fecha: fmtFechaRecibo(r.fecha),
    }));
    renderRecibosHistorial();
  } catch (e) {
    console.error(e);
  }
}

// =====================================================================
// VENTA DE CELULARES (inventario + venta + Plan Cuotas MiCel)
// =====================================================================
const PAGO_FORM_A_API = {
  'Efectivo': 'efectivo',
  'QR (transferencia)': 'qr',
  'Transferencia bancaria': 'transferencia',
  'Cuotas': 'cuotas',
};
const PAGO_API_A_LABEL = {
  efectivo: 'Efectivo',
  qr: 'QR (transferencia)',
  transferencia: 'Transferencia bancaria',
  cuotas: 'Cuotas',
};

function _fechaCorta(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-BO') : '—';
}

function _nombreSucursal(id) {
  const s = (window._sucursales || []).find((x) => x.id === id);
  return s ? s.nombre : '';
}

function normalizeInventarioCel(c) {
  return {
    id: c.id,
    codigo: c.codigo,
    modelo: c.modelo,
    imei: c.imei,
    estado: c.estado,
    compra: parseFloat(c.precio_compra) || 0,
    branch: c.sucursal?.nombre || _nombreSucursal(c.sucursal_id),
    fechaIngreso: _fechaCorta(c.created_at),
    vendido: !!c.vendido,
  };
}

function normalizeVentaCel(v) {
  const p = v.plan_pago;
  const compra = parseFloat(v.equipo?.precio_compra) || 0;
  const venta = parseFloat(v.precio_venta) || 0;
  return {
    id: v.id,
    codigo: v.codigo,
    modelo: v.equipo?.modelo || '—',
    imei: v.equipo?.imei || '—',
    estado: v.equipo?.estado || '—',
    cliente: v.cliente,
    telefono: v.telefono || '—',
    compra,
    venta,
    ganancia: venta - compra, // el backend no manda el accesor "ganancia", se calcula aquí
    pago: PAGO_API_A_LABEL[v.metodo_pago] || v.metodo_pago,
    branch: _nombreSucursal(v.sucursal_id),
    fecha: _fechaCorta(v.created_at),
    planPagos: p
      ? {
          total: parseFloat(p.total) || 0,
          inicial: parseFloat(p.inicial) || 0,
          saldo: parseFloat(p.saldo) || 0,
          numero: p.numero_cuotas,
          frecuencia: p.frecuencia,
          cuotas: (p.cuotas || []).map((c) => ({
            id: c.id,
            numero: c.numero,
            fecha: _fechaCorta(c.fecha_vencimiento),
            fechaIso: c.fecha_vencimiento,
            monto: parseFloat(c.monto) || 0,
            pagada: !!c.pagada,
          })),
        }
      : null,
    documentos: p ? { ci: !!p.doc_ci, boleta: !!p.doc_boleta, luz: !!p.doc_luz, afp: !!p.doc_afp } : null,
  };
}

async function loadCelulares() {
  try {
    const [inv, ventas] = await Promise.all([
      CelularesAPI.inventario().catch(() => []),
      CelularesAPI.ventas().catch(() => []),
    ]);
    celularesInventario = (inv || []).map(normalizeInventarioCel);
    celularesData = (ventas || []).map(normalizeVentaCel);
    renderInventarioCelulares(celularesInventario);
    renderCelulares(celularesData);
  } catch (e) {
    console.error(e);
  }
}

// ---- PASO 1: ingresar equipo al inventario ----
async function agregarInventarioCelular() {
  const modelo = document.getElementById('cel-inv-modelo').value.trim();
  const imei = document.getElementById('cel-inv-imei').value.trim();
  const estado = document.getElementById('cel-inv-estado').value;
  const compra = parseFloat(document.getElementById('cel-inv-compra').value);
  const sucursal_id = document.getElementById('cel-inv-branch').value || null;

  if (!modelo) { alert('Complete la marca y modelo del equipo.'); return; }
  if (!imei || imei.length < 5) { alert('Ingrese un IMEI válido (mínimo 5 dígitos).'); return; }
  if (isNaN(compra) || compra <= 0) { alert('El precio de compra debe ser mayor a 0.'); return; }

  try {
    await CelularesAPI.agregarInventario({ modelo, imei, estado, precio_compra: compra, sucursal_id });
    await loadCelulares();
    ['cel-inv-modelo', 'cel-inv-imei', 'cel-inv-compra'].forEach((id) => (document.getElementById(id).value = ''));
    showToast('✓ Equipo agregado al inventario');
  } catch (e) {
    alert('No se pudo agregar el equipo: ' + e.message); // incluye "IMEI ya existe"
  }
}

function _filaInventario(c) {
  return `
    <tr>
      <td>${c.fechaIngreso}</td>
      <td>${c.modelo}</td>
      <td><code class="code-tag" style="font-size:10px">${c.imei}</code></td>
      <td>${c.estado}</td>
      <td>Bs ${fmtMonto(c.compra)}</td>
      <td>${c.branch}</td>
      <td><button class="btn-sm btn-sm-primary" onclick="irAVenderCelular(${c.id})">Vender</button></td>
    </tr>`;
}

function renderInventarioCelulares(data) {
  const disponibles = data.filter((c) => !c.vendido);
  const tbody = document.getElementById('inventario-cel-body');
  if (!tbody) return;

  tbody.innerHTML = disponibles.length
    ? disponibles.map(_filaInventario).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:24px">No hay equipos en inventario. Agrega uno arriba.</td></tr>';

  populateSelectVentaCelular(disponibles);
  const cont = document.getElementById('cel-inventario');
  if (cont) cont.textContent = disponibles.length;
}

function filterInventarioCelulares(q) {
  const ql = q.toLowerCase();
  const filtrado = celularesInventario.filter(
    (c) => !c.vendido && (c.modelo.toLowerCase().includes(ql) || c.imei.toLowerCase().includes(ql))
  );
  document.getElementById('inventario-cel-body').innerHTML = filtrado.length
    ? filtrado.map(_filaInventario).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:24px">Sin resultados</td></tr>';
}

// ---- PASO 2: vender un equipo del inventario ----
function populateSelectVentaCelular(disponibles) {
  const sel = document.getElementById('cel-venta-select');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML =
    '<option value="">— Seleccione un equipo del inventario —</option>' +
    disponibles.map((c) => `<option value="${c.id}">${c.modelo} — IMEI ${c.imei}</option>`).join('');
  if (disponibles.some((c) => String(c.id) === actual)) sel.value = actual;
}

function irAVenderCelular(invId) {
  document.getElementById('cel-venta-select').value = invId;
  precargarVentaCelular(invId);
  document.getElementById('card-vender-celular').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function precargarVentaCelular(invId) {
  if (!invId) return;
  const equipo = celularesInventario.find((c) => String(c.id) === String(invId));
  if (!equipo) return;
  // Sugerencia con 20% de margen sobre la compra (solo referencia, editable)
  document.getElementById('cel-venta').value = Math.round(equipo.compra * 1.2);
}

function toggleCuotasFields() {
  const esCuotas = document.getElementById('cel-pago').value === 'Cuotas';
  document.getElementById('cel-cuotas-fields').classList.toggle('hidden', !esCuotas);
  document.getElementById('cel-cuotas-docs').classList.toggle('hidden', !esCuotas);
}

async function registrarVentaCelular(confirmarPerdida = false) {
  if (_locks['venta_cel']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['venta_cel'] = true;
  const __btn_venta_cel = document.querySelector('[onclick*="registrarVentaCelular"]');
  let __old_venta_cel = '';
  if (__btn_venta_cel) {
    __btn_venta_cel.disabled = true;
    __old_venta_cel = __btn_venta_cel.textContent;
    __btn_venta_cel.textContent = 'Guardando…';
  }
  try {

  const invId = document.getElementById('cel-venta-select').value;
  const cliente = document.getElementById('cel-cliente').value.trim();
  const telefono = document.getElementById('cel-cliente-tel').value.trim();
  const venta = parseFloat(document.getElementById('cel-venta').value);
  const pagoLabel = document.getElementById('cel-pago').value;
  const metodo_pago = PAGO_FORM_A_API[pagoLabel] || 'efectivo';

  if (!invId) { alert('Seleccione un equipo del inventario para vender.'); return; }
  if (!cliente) { alert('El nombre del cliente es obligatorio.'); return; }
  if (!validarNombre(cliente, 'Cliente')) return;
  if (telefono && !validarTelefono(telefono, false)) return;
  if (isNaN(venta) || venta <= 0) { alert('El precio de venta debe ser mayor a 0.'); return; }

  const body = {
    celular_inventario_id: parseInt(invId, 10),
    cliente,
    telefono: telefono || null,
    precio_venta: venta,
    metodo_pago,
  };
  if (confirmarPerdida) body.confirmar_perdida = true;

  if (metodo_pago === 'cuotas') {
    if (!telefono) { alert('Para ventas a crédito, el teléfono/CI del cliente es obligatorio (necesario para el contrato y cobranza).'); return; }

    const inicialInput = document.getElementById('cel-cuotas-inicial').value.trim();
    const inicial = inicialInput === '' ? 0 : parseFloat(inicialInput);
    const numero = parseInt(document.getElementById('cel-cuotas-numero').value, 10);

    if (isNaN(inicial) || inicial < 0) { alert('El pago inicial no puede ser negativo.'); return; }
    if (inicial >= venta) { alert('El pago inicial no puede ser mayor o igual al precio de venta (si no, no es una venta a crédito).'); return; }
    if (isNaN(numero) || numero < 1) { alert('El número de cuotas debe ser al menos 1.'); return; }
    if (numero > 15) { alert('El Plan Cuotas MiCel financia hasta un máximo de 15 cuotas.'); return; }

    const docs = {
      doc_ci: document.getElementById('doc-ci').checked,
      doc_boleta: document.getElementById('doc-boleta').checked,
      doc_luz: document.getElementById('doc-luz').checked,
      doc_afp: document.getElementById('doc-afp').checked,
    };
    if (!docs.doc_ci || !docs.doc_boleta || !docs.doc_luz || !docs.doc_afp) {
      alert('Para aprobar una venta a crédito debes marcar que el cliente presentó los 4 documentos requeridos:\n· Documento de identidad vigente\n· Última boleta de pago\n· Aviso de luz de la vivienda actual\n· Extracto de AFP');
      return;
    }

    Object.assign(body, {
      inicial,
      numero_cuotas: numero,
      frecuencia: document.getElementById('cel-cuotas-frecuencia').value,
      ...docs,
    });
  }

  try {
    const creada = await CelularesAPI.vender(body);
    await loadCelulares();

    document.getElementById('cel-venta-select').value = '';
    document.getElementById('cel-cliente').value = '';
    document.getElementById('cel-cliente-tel').value = '';
    document.getElementById('cel-venta').value = '';
    document.getElementById('cel-pago').value = 'Efectivo';
    ['cel-cuotas-inicial', 'cel-cuotas-numero'].forEach((id) => (document.getElementById(id).value = ''));
    ['doc-ci', 'doc-boleta', 'doc-luz', 'doc-afp'].forEach((id) => (document.getElementById(id).checked = false));
    toggleCuotasFields();

    if (metodo_pago === 'cuotas') {
      showToast('✓ Venta a crédito registrada — plan de pagos generado');
      mostrarContrato(creada.id);
    } else {
      showToast('✓ Venta de celular registrada correctamente');
    }
  } catch (e) {
    // El backend pide confirmación explícita si se vende por debajo del precio de compra
    if (e.status === 409 && e.data?.requiere_confirmacion) {
      if (confirm(e.data.message + '\n\n¿Confirmas que quieres registrar esta venta con pérdida?')) {
        return registrarVentaCelular(true);
      }
      return;
    }
    alert('No se pudo registrar la venta: ' + e.message);
  }

  } finally {
    _locks['venta_cel'] = false;
    if (__btn_venta_cel) {
      __btn_venta_cel.disabled = false;
      __btn_venta_cel.textContent = __old_venta_cel || __btn_venta_cel.textContent;
    }
  }
}

// ---- Historial de ventas de celulares ----
function _filaVentaCel(v) {
  const gan = v.ganancia;
  const colorGan = gan >= 0 ? 'var(--success)' : 'var(--danger)';
  return `
    <tr>
      <td>${v.fecha}</td>
      <td>${v.modelo}</td>
      <td><code class="code-tag" style="font-size:10px">${v.imei}</code></td>
      <td>${v.estado}</td>
      <td>${v.cliente}</td>
      <td>Bs ${fmtMonto(v.compra)}</td>
      <td style="font-weight:600">Bs ${fmtMonto(v.venta)}</td>
      <td style="font-weight:600;color:${colorGan}">${gan >= 0 ? '+' : '−'} Bs ${fmtMonto(Math.abs(gan))}</td>
      <td>${v.branch}</td>
      <td>${v.pago}</td>
      <td>${v.planPagos ? `<button class="btn-sm btn-sm-primary" onclick="mostrarContrato(${v.id})">Contrato</button>` : ''}</td>
    </tr>`;
}

function renderCelulares(data) {
  const tbody = document.getElementById('celulares-body');
  if (!tbody) return;

  tbody.innerHTML = data.length
    ? data.map(_filaVentaCel).join('')
    : '<tr><td colspan="11" style="text-align:center;color:var(--gray-400);padding:24px">No se han registrado ventas de celulares aún</td></tr>';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('cel-vendidos', data.length);
  set('cel-ingresos', 'Bs ' + fmtMonto(data.reduce((a, v) => a + v.venta, 0)));
  const totalGan = data.reduce((a, v) => a + v.ganancia, 0);
  set('cel-ganancia', (totalGan < 0 ? '− ' : '') + 'Bs ' + fmtMonto(Math.abs(totalGan)));
}

function filterCelulares(q) {
  const ql = q.toLowerCase();
  renderCelulares(
    celularesData.filter(
      (v) => v.modelo.toLowerCase().includes(ql) || v.imei.toLowerCase().includes(ql) || v.cliente.toLowerCase().includes(ql)
    )
  );
}

// ---- Estado de cuenta (deuda pendiente) ----
async function consultarEstadoCuenta() {
  const q = document.getElementById('cel-consulta-input').value.trim();
  const box = document.getElementById('cel-consulta-resultado');
  if (!q) { box.innerHTML = 'Escribe un nombre de cliente o IMEI para consultar.'; return; }

  try {
    const r = await CelularesAPI.estadoCuenta(q);
    const ven = normalizeVentaCel(r.venta);
    const prox = r.proxima_cuota;
    box.innerHTML = `
      <div style="border:1px solid var(--gray-200);border-radius:8px;padding:14px;margin-top:6px">
        <div style="font-weight:600;color:var(--gray-800);margin-bottom:6px">${ven.cliente} — ${ven.modelo} (IMEI ${ven.imei})</div>
        <div>Saldo pendiente: <strong style="color:var(--accent)">Bs ${fmtMonto(r.saldo_pendiente)}</strong> de ${r.cuotas_pendientes} cuota${r.cuotas_pendientes !== 1 ? 's' : ''}</div>
        ${prox ? `<div>Próxima cuota: <strong>Bs ${fmtMonto(prox.monto)}</strong> — vence el ${_fechaCorta(prox.fecha_vencimiento)}</div>` : '<div style="color:var(--success)">✓ Este crédito ya está totalmente pagado.</div>'}
        <div style="margin-top:8px"><button class="btn-sm btn-sm-primary" onclick="mostrarContrato(${ven.id})">Ver contrato completo</button></div>
      </div>`;
  } catch (e) {
    box.innerHTML = e.status === 404 ? `No se encontró ninguna venta a crédito activa para "<strong>${q}</strong>".` : `Error: ${e.message}`;
  }
}

// ---- Contrato + cuotas ----
let contratoActualId = null;

async function marcarCuotaPagada(ventaId, cuotaId) {
  try {
    await CelularesAPI.pagarCuota(cuotaId); // el backend alterna pagada/pendiente
    await loadCelulares();
    mostrarContrato(ventaId); // refresca la vista con el nuevo estado
  } catch (e) {
    alert('No se pudo actualizar la cuota: ' + e.message);
  }
}

function toggleQrCuota(ventaId, numeroCuota, monto) {
  const fila = document.getElementById(`qr-row-${ventaId}-${numeroCuota}`);
  if (!fila) return;
  const estabaOculto = fila.classList.contains('hidden');
  fila.classList.toggle('hidden');
  if (!estabaOculto) return;

  const cont = document.getElementById(`qr-canvas-${ventaId}-${numeroCuota}`);
  if (!cont) return;
  cont.innerHTML = '';

  const cfg = typeof loadQrCobroConfig === 'function' ? loadQrCobroConfig() : null;
  const montoTxt = typeof fmtMonto === 'function' ? fmtMonto(monto) : monto;

  if (cfg && cfg.imagen) {
    cont.innerHTML =
      '<img src="' + cfg.imagen + '" alt="QR cobro" style="width:150px;height:150px;object-fit:contain;background:#fff;border-radius:8px;padding:6px;border:1px solid #e5e7eb">' +
      '<div style="font-size:11px;font-weight:600;color:#111827;margin-top:6px">' + (cfg.titulo || 'QR de pago MiCel') + '</div>' +
      '<div style="font-size:11px;color:#6b7280">Cuota ' + numeroCuota + ' · Bs ' + montoTxt + '</div>';
  } else {
    cont.innerHTML =
      '<div style="padding:12px;max-width:220px;font-size:12px;color:#6b7280;line-height:1.4">' +
      '<strong style="color:#ff1440">QR del negocio no cargado</strong><br>' +
      'Ve a <b>Usuarios → QR de cobro del negocio</b> y sube el QR de tu banco/billetera.' +
      '</div>';
    if (typeof showToast === 'function') {
      showToast('Configura el QR en Usuarios → QR de cobro', 'warn');
    }
  }
}

function _docsHtml(docs) {
  if (!docs) return '';
  return `
    <div style="background:#f9fafb;border-radius:6px;padding:12px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:6px">Documentos presentados y verificados</div>
      <div>${docs.ci ? '✅' : '❌'} Documento de identidad vigente</div>
      <div>${docs.boleta ? '✅' : '❌'} Última boleta de pago</div>
      <div>${docs.luz ? '✅' : '❌'} Aviso de luz de la vivienda actual</div>
      <div>${docs.afp ? '✅' : '❌'} Extracto de AFP</div>
    </div>`;
}


/** Bloque QR de cobro del negocio (localStorage) para contratos/recibos */
function _qrCobroNegocioHtml(opts) {
  opts = opts || {};
  let cfg = null;
  try {
    if (typeof loadQrCobroConfig === 'function') cfg = loadQrCobroConfig();
    else cfg = JSON.parse(localStorage.getItem('micel_qr_cobro_negocio') || 'null');
  } catch (_) {}
  const titulo = (cfg && cfg.titulo) || 'QR de pago MiCel';
  const extra = opts.extraLine || 'Escanea con tu banca o billetera para pagar cuotas / servicios';
  if (cfg && cfg.imagen) {
    return `
      <div style="margin:18px 0 8px;padding:16px;border:2px dashed #ff1440;border-radius:12px;text-align:center;background:#fff5f7">
        <div style="font-size:11px;font-weight:700;color:#ff1440;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Pago con QR</div>
        <div style="font-size:12px;font-weight:600;color:#111827;margin-bottom:10px">${titulo}</div>
        <img src="${cfg.imagen}" alt="QR cobro" style="width:160px;height:160px;object-fit:contain;background:#fff;border-radius:8px;padding:6px;border:1px solid #fecdd3">
        <div style="font-size:11px;color:#6b7280;margin-top:10px;line-height:1.4">${extra}</div>
      </div>`;
  }
  return `
    <div style="margin:18px 0 8px;padding:14px;border:1px dashed #d1d5db;border-radius:10px;text-align:center;background:#f9fafb;font-size:12px;color:#6b7280">
      <strong>QR de cobro no configurado.</strong><br>
      Admin → Usuarios → “QR de cobro del negocio” para subirlo (se mostrará aquí en contratos y recibos).
    </div>`;
}

function _contratoHtml(v, conAcciones) {
  const p = v.planPagos;
  const td = 'padding:6px 8px;border-bottom:1px solid #f3f4f6';
  const filas = p.cuotas
    .map(
      (c) => `
    <tr>
      <td style="${td}">Cuota ${c.numero}</td>
      <td style="${td}">${c.fecha}</td>
      <td style="${td};text-align:right">Bs ${fmtMonto(c.monto)}</td>
      <td style="${td};text-align:center"><span style="font-size:11px;font-weight:600;color:${c.pagada ? '#0e9f6e' : '#c27803'}">${c.pagada ? '✓ Pagada' : 'Pendiente'}</span></td>
      ${conAcciones ? `
      <td style="${td};text-align:center;white-space:nowrap">
        <button class="btn-sm" onclick="marcarCuotaPagada(${v.id}, ${c.id})">${c.pagada ? 'Desmarcar' : 'Marcar pagada'}</button>
        ${c.pagada ? '' : `<button class="btn-sm btn-sm-primary" onclick="toggleQrCuota(${v.id}, ${c.numero}, ${c.monto})">QR</button>`}
      </td>` : ''}
    </tr>
    ${conAcciones && !c.pagada ? `
    <tr id="qr-row-${v.id}-${c.numero}" class="hidden">
      <td colspan="5" style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:center;background:#f9fafb">
        <div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px">
          <div id="qr-canvas-${v.id}-${c.numero}"></div>
          <span style="font-size:11px;color:#6b7280">Escanea para pagar la Cuota ${c.numero} · Bs ${fmtMonto(c.monto)}</span>
        </div>
      </td>
    </tr>` : ''}`
    )
    .join('');

  return `
    <div class="doc" style="border:2px solid #e5e7eb;border-radius:12px;overflow:hidden;font-size:13px;line-height:1.7;color:#1f2937;background:#ffffff;max-width:640px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#1a1a1a,#111);color:#fff;text-align:center;padding:20px 24px;margin-bottom:0;border-bottom:3px solid #F5C518">
        <img src="img/logo-icon.svg" alt="MiCEL" style="width:56px;height:56px;margin:0 auto 8px;display:block">
        <div style="font-size:26px;font-weight:800;letter-spacing:1px">mi<span style="color:#F5C518">CEL</span></div>
        <div style="font-size:12px;opacity:.95;margin-top:4px">Contrato de venta a crédito — Plan Cuotas</div>
        <div style="font-size:11px;opacity:.85;margin-top:2px">Sucursal: ${v.branch || '—'} · El Alto, Bolivia</div>
      </div>
      <div style="padding:22px 24px 28px">
      <p style="margin-bottom:10px">
        Por medio del presente documento, <strong>${v.cliente}</strong> (Tel./CI: ${v.telefono}) declara adquirir de
        <strong>MiCel</strong> el equipo detallado a continuación, bajo la modalidad de <strong>venta a crédito en cuotas</strong>,
        comprometiéndose a cancelar el saldo pendiente según el cronograma acordado.
      </p>
      <div style="background:#f9fafb;border-radius:6px;padding:12px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:6px">Datos del equipo</div>
        <div><strong>Modelo:</strong> ${v.modelo}</div>
        <div><strong>IMEI:</strong> ${v.imei}</div>
        <div><strong>Estado:</strong> ${v.estado}</div>
      </div>
      ${_docsHtml(v.documentos)}
      <div style="display:flex;justify-content:space-between;background:#f9fafb;border-radius:6px;padding:12px;margin-bottom:14px">
        <div><strong>Precio total:</strong><br>Bs ${fmtMonto(p.total)}</div>
        <div><strong>Pago inicial:</strong><br>Bs ${fmtMonto(p.inicial)}</div>
        <div><strong>Saldo financiado:</strong><br>Bs ${fmtMonto(p.saldo)}</div>
        <div><strong>Cuotas:</strong><br>${p.numero} (${p.frecuencia})</div>
      </div>
      <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Cronograma de pagos</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:6px 8px;text-align:left;font-size:11px">Cuota</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px">Vencimiento</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px">Monto</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px">Estado</th>
          ${conAcciones ? '<th style="padding:6px 8px;text-align:center;font-size:11px"></th>' : ''}
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:12px;font-size:11.5px;color:#713f12;margin-bottom:14px">
        <strong>Cláusulas:</strong> El incumplimiento de 2 o más cuotas consecutivas faculta a MiCel a exigir el pago total del saldo
        pendiente y/o suspender la garantía del equipo. El cliente declara haber recibido el equipo en el estado descrito, conforme y en funcionamiento.
      </div>
      ${ _qrCobroNegocioHtml({ extraLine: 'Usa este QR para pagar las cuotas pendientes · Identifica el contrato ' + (v.codigo || '') + ' al transferir' }) }
      <div style="display:flex;justify-content:space-between;margin-top:28px;font-size:12px;gap:24px">
        <div style="text-align:center;flex:1;border-top:1px solid #9ca3af;padding-top:8px">Firma del Cliente</div>
        <div style="text-align:center;flex:1;border-top:1px solid #9ca3af;padding-top:8px">Firma MiCel</div>
      </div>
      </div>
    </div>`;
}

function mostrarContrato(ventaId) {
  const v = celularesData.find((x) => x.id === ventaId);
  if (!v || !v.planPagos) { alert('Esta venta no tiene un plan de pagos asociado.'); return; }
  contratoActualId = ventaId;
  document.getElementById('contrato-cel-preview').innerHTML = _contratoHtml(v, true);
  document.getElementById('modal-contrato-cel').classList.remove('hidden');
}

function imprimirContratoCelular() {
  const v = celularesData.find((x) => x.id === contratoActualId);
  if (!v || !v.planPagos) return;
  const body = _contratoHtml(v, false);
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) {
    showToast('Permite ventanas emergentes para imprimir', 'error');
    return;
  }
  w.document.write(_micelPrintShell('Contrato ' + (v.codigo || ''), body.replace(/src="img\/logo-icon.svg"/g, 'src="' + _logoUrl() + '"')));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

async function loadReporteTecnicos() {
  try {
    const reporte = await OrdersAPI.reporteTecnicos();
    window._reporteTecnicos = reporte.map((t) => ({ ...t, branch: t.sucursal || '' }));
    if (typeof renderReportTech === 'function') renderReportTech();
  } catch (e) {
    console.error(e);
  }
}

// ---------- nav ----------
const navConfig = {
  dashboard: { title: 'Principal', sub: 'Resumen general del sistema', btn: '+ Nueva Orden' },
  ordenes: { title: 'Órdenes de Servicio', sub: 'Registro y seguimiento de reparaciones', btn: '+ Nueva Orden' },
  stock: { title: 'Control de Stock', sub: 'Inventario de repuestos tecnológicos', btn: '+ Agregar repuesto' },
  ventas: { title: 'Ventas', sub: 'Registro de ingresos por servicio y venta', btn: '+ Registrar venta' },
  celulares: { title: 'Venta de Celulares', sub: 'Compra y venta de equipos', btn: '+ Registrar venta' },
  reportes: { title: 'Reportes', sub: 'Análisis operativo y financiero', btn: 'Exportar PDF' },
  clientes: { title: 'Clientes', sub: 'Base de datos de clientes', btn: '+ Nuevo cliente' },
  usuarios: { title: 'Usuarios / Técnicos', sub: 'Gestión de accesos y roles', btn: '+ Nuevo usuario' },
  recibos: { title: 'Recibos', sub: 'Generación e impresión de recibos', btn: '+ Nuevo recibo' },
  historial: { title: 'MiCel Amnesis', sub: 'Historial de reparaciones', btn: '+ Entrada' },
  'mis-ordenes': { title: 'Mis Órdenes', sub: 'Órdenes asignadas a ti', btn: '' },
};

function nav(id, el) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');
  const cfg = navConfig[id] || {};
  const t = document.getElementById('topbar-title');
  const s = document.getElementById('topbar-sub');
  const btn = document.getElementById('topbar-btn');
  if (t) t.textContent = cfg.title || id;
  if (s) s.textContent = cfg.sub || '';
  if (btn) {
    btn.textContent = cfg.btn || '';
    btn.onclick = () => topAction(id);
  }
  closeSidebarMobile();

  if (typeof aplicarPermisosStock === 'function') aplicarPermisosStock();
  if (id === 'stock') {
    const topBtn = document.getElementById('topbar-btn');
    if (topBtn) topBtn.style.display = esAdminOSuper() ? '' : 'none';
  } else if (id !== 'stock') {
    const topBtn = document.getElementById('topbar-btn');
    // restaurar visibilidad del botón según navConfig
    if (topBtn && topBtn.textContent) topBtn.style.display = topBtn.textContent.trim() ? '' : 'none';
  }
  if (id === 'mis-ordenes' && typeof renderMisOrdenes === 'function') renderMisOrdenes();
  if (id === 'reportes' && typeof renderReportesCompletos === 'function') renderReportesCompletos();
  if (id === 'dashboard' && typeof updateDashboard === 'function') updateDashboard();

}

function topAction(id) {
  if (id === 'dashboard' || id === 'ordenes') openModal('orden');
  else if (id === 'stock') {
    if (!esAdminOSuper()) {
      showToast('Solo Admin / Super Admin pueden agregar o modificar stock', 'error');
      return;
    }
    openModal('repuesto');
  }
  else if (id === 'ventas') {
    // focus form on ventas panel
    document.getElementById('venta-detalle')?.focus();
  }
  else if (id === 'clientes') openModal('cliente');
  else if (id === 'recibos') openModal('recibo-manual');
  else if (id === 'reportes') {
    if (typeof renderReportesCompletos === 'function') renderReportesCompletos();
    showToast('✓ Reporte actualizado con datos reales');
  }
  else if (id === 'celulares') document.getElementById('cel-inv-modelo')?.focus();
  else if (id === 'historial') openModal('historial-add');
}

function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-backdrop')?.classList.toggle('open');
}
function closeSidebarMobile() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

// ---------- helpers UI ----------
function getTech(code) {
  return tecnicos.find((t) => t.code === code) || { name: '—', code: '—' };
}
function initials(name) {
  return (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
function fmtMonto(v) {
  return parseFloat(v || 0).toLocaleString('es-BO', { minimumFractionDigits: 0 });
}

/** Solo Admin / Super Admin pueden modificar stock */
function esAdminOSuper() {
  if (!currentUser) return false;
  const r = (currentUser.rolRaw || '').toLowerCase();
  const label = (currentUser.rol || '').toLowerCase();
  return r === 'administrador' || r === 'superadmin' ||
    label.includes('admin');
}

function soloLetras(valor) {
  // Solo letras, espacios y acentos (nombres de personas)
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s.'-]+$/.test((valor || '').trim()) && (valor || '').trim().length >= 2;
}

function soloTelefono(valor) {
  // Solo dígitos, opcional + al inicio, 7 a 15 dígitos
  const v = (valor || '').trim();
  if (!v) return true; // opcional en muchos formularios
  return /^\+?\d{7,15}$/.test(v.replace(/[\s\-()]/g, ''));
}

function soloEnteroNoNeg(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0;
}

function soloDecimalPositivo(valor, permitirCero = true) {
  const n = parseFloat(valor);
  if (isNaN(n)) return false;
  return permitirCero ? n >= 0 : n > 0;
}

function limpiarTelefono(valor) {
  // Solo dígitos (ignora X del placeholder, espacios, guiones, etc.)
  return (valor || '').replace(/\D+/g, '');
}

function validarNombre(valor, etiqueta) {
  if (!(valor || '').trim()) {
    showToast(etiqueta + ' es obligatorio', 'error');
    return false;
  }
  if (!soloLetras(valor)) {
    showToast(etiqueta + ': solo letras y espacios (sin números)', 'error');
    return false;
  }
  return true;
}

function validarTelefono(valor, obligatorio) {
  const digits = limpiarTelefono(valor || '');
  // Vacío o solo basura tipo placeholder 7XXXXXXX sin dígitos suficientes
  if (!digits) {
    if (obligatorio) {
      showToast('Teléfono es obligatorio', 'error');
      return false;
    }
    return true; // opcional en órdenes / muchos formularios
  }
  if (digits.length < 7 || digits.length > 15) {
    showToast('Teléfono inválido: solo números (7 a 15 dígitos)', 'error');
    return false;
  }
  return true;
}

function validarCantidad(valor, etiqueta, permitirCero) {
  if (valor === '' || valor === null || valor === undefined) {
    showToast(etiqueta + ' es obligatorio', 'error');
    return false;
  }
  if (!soloEnteroNoNeg(valor)) {
    showToast(etiqueta + ': debe ser un número entero ≥ 0', 'error');
    return false;
  }
  if (!permitirCero && parseInt(valor, 10) === 0) {
    showToast(etiqueta + ': debe ser mayor a 0', 'error');
    return false;
  }
  return true;
}

function validarMonto(valor, etiqueta, permitirCero) {
  if (valor === '' || valor === null || valor === undefined) {
    showToast(etiqueta + ' es obligatorio', 'error');
    return false;
  }
  if (!soloDecimalPositivo(valor, permitirCero)) {
    showToast(etiqueta + ': debe ser un número' + (permitirCero ? ' ≥ 0' : ' mayor a 0'), 'error');
    return false;
  }
  return true;
}
function statusBadge(s) {
  const m = {
    Listo: 'badge-green',
    'En proceso': 'badge-blue',
    Diagnóstico: 'badge-amber',
    Recepción: 'badge-red',
  };
  return `<span class="badge ${m[s] || 'badge-blue'}">${s}</span>`;
}
const ESTADOS_ORDEN = [
  { value: 'recepcion', label: 'Recepción', clase: 'badge-red' },
  { value: 'diagnostico', label: 'Diagnóstico', clase: 'badge-amber' },
  { value: 'en_proceso', label: 'En proceso', clase: 'badge-blue' },
  { value: 'listo', label: 'Listo', clase: 'badge-green' },
];

/** Select real para cambiar el estado directo desde la tabla — reemplaza
 * el botón "Estado" que antes abría un prompt() de texto libre. */
function estadoSelectHtml(orderId, statusRaw) {
  const actual = ESTADOS_ORDEN.find((e) => e.value === statusRaw) || ESTADOS_ORDEN[0];
  // Ya no hay un <div> de menú anidado en la celda — solo el botón.
  // El menú real vive una sola vez en <body> (ver #global-status-menu)
  // y se posiciona con JS, así no depende de cómo la tabla recorte su contenido.
  return `
    <button type="button" class="status-dropdown-trigger ${actual.clase}"
            onclick="toggleStatusDropdown(event, ${orderId}, '${statusRaw}')">
      ${actual.label} <span class="status-dropdown-caret">▾</span>
    </button>`;
}

function _getGlobalStatusMenu() {
  let menu = document.getElementById('global-status-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'global-status-menu';
    menu.className = 'status-dropdown-menu';
    document.body.appendChild(menu);
  }
  return menu;
}

let _statusMenuAbiertoPara = null;

function toggleStatusDropdown(ev, orderId, statusRaw) {
  ev.stopPropagation();
  const menu = _getGlobalStatusMenu();
  const yaAbiertoParaEsteMismo = _statusMenuAbiertoPara === orderId && menu.classList.contains('is-open');

  cerrarStatusDropdowns();
  if (yaAbiertoParaEsteMismo) return; // era un toggle: ya estaba abierto, lo cerramos y listo

  menu.innerHTML = ESTADOS_ORDEN.map(
    (e) => `
      <div class="status-dropdown-item ${e.clase} ${e.value === statusRaw ? 'is-active' : ''}"
           onclick="event.stopPropagation(); cerrarStatusDropdowns(); cambiarEstado(${orderId}, '${e.value}')">
        <span class="status-dot ${e.clase}"></span>${e.label}
      </div>`
  ).join('');

  const rect = ev.currentTarget.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.classList.add('is-open');
  _statusMenuAbiertoPara = orderId;
}

function cerrarStatusDropdowns() {
  document.getElementById('global-status-menu')?.classList.remove('is-open');
  _statusMenuAbiertoPara = null;
}

document.addEventListener('click', cerrarStatusDropdowns);
window.addEventListener('scroll', cerrarStatusDropdowns, true); // si scrollea, el menu quedaria mal posicionado

function stockBadge(qty, min) {
  if (qty === 0) return `<span class="badge badge-red">Sin stock</span>`;
  if (qty < min) return `<span class="badge badge-amber">Crítico</span>`;
  return `<span class="badge badge-green">OK</span>`;
}
function stockColor(qty, min) {
  if (qty === 0) return '#e02424';
  if (qty < min) return '#c27803';
  return '#0e9f6e';
}

function populateTechSelects() {
  const opts = tecnicos
    .filter((t) => t.active && (t.rolRaw === 'tecnico' || t.rol === 'Técnico'))
    .map((t) => `<option value="${t.id}">${t.code} — ${t.name}</option>`)
    .join('');
  ['modal-tech', 'recibo-tech', 'venta-tech', 'edit-order-tech'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts || '<option value="">Sin técnicos</option>';
  });
}

// ---------- render ----------
function renderDashOrders() {
  const el = document.getElementById('dash-orders');
  if (!el) return;
  const rows = (ordersData || []).slice(0, 6);
  if (!rows.length) {
    el.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">Sin órdenes aún — <a href="#" onclick="openModal(\'orden\');return false">crear una</a></td></tr>';
    return;
  }
  el.innerHTML = rows
    .map(
      (o) => `<tr class="dash-row-click" style="cursor:pointer" onclick="dashGo('ordenes')" title="Ir a órdenes">
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device} — ${o.service}</td>
      <td>${o.techName}</td>
      <td>${o.branch}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>`
    )
    .join('');
}

function renderOrders(data) {
  const el = document.getElementById('orders-body');
  if (!el) return;
  el.innerHTML = data
    .map(
      (o) => `<tr>
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device}</td>
      <td>${o.service}</td>
      <td>${o.techName}</td>
      <td>${o.branch}</td>
      <td>${estadoSelectHtml(o.id, o.statusRaw)}</td>
      <td style="font-weight:600">${o.monto > 0 ? 'Bs ' + fmtMonto(o.monto) : '—'}</td>
      <td>
        <button class="btn-sm" onclick="imprimirOrdenTrabajo(${o.id})" title="Orden de trabajo">OT</button> <button class="btn-sm" onclick="editarOrden(${o.id})">Editar</button>
        <button class="btn-sm btn-sm-primary" onclick="verReciboOrden(${o.id})">Recibo</button>
      </td>
    </tr>`
    )
    .join('');
}

function filterOrders(q) {
  loadOrders(q ? { q } : {});
}
function filterSucursal(v) {
  loadOrders(v ? { sucursal_id: v } : {});
}



// =====================================================================
// DESCUENTO AUTOMÁTICO DE STOCK al completar servicio (estado → Listo)
// Ej: "Cambio de pantalla" + "Camon 18P" → busca "Pantalla ... Camon 18P"
// =====================================================================
const STOCK_DEDUCTED_KEY = 'micel_stock_deducted_orders';

function _stockDeductedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STOCK_DEDUCTED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function _markStockDeducted(orderId) {
  const s = _stockDeductedSet();
  s.add(String(orderId));
  localStorage.setItem(STOCK_DEDUCTED_KEY, JSON.stringify([...s]));
}
function _yaDescontoStock(orderId) {
  return _stockDeductedSet().has(String(orderId));
}

/** Tipo de repuesto según el servicio */
function _tipoRepuestoPorServicio(service) {
  const s = (service || '').toLowerCase();
  if (/pantalla|display|lcd|touch/.test(s)) return ['pantalla', 'display', 'lcd', 'touch', 'screen'];
  if (/bater/.test(s)) return ['bateria', 'batería', 'battery'];
  if (/pin de carga|conector.*carga|puerto.*carga|carga/.test(s) && !/bater/.test(s))
    return ['pin', 'carga', 'conector', 'flex carga', 'puerto'];
  if (/backlight|retroilumin/.test(s)) return ['backlight', 'retroilumin', 'luz'];
  if (/flex|c[aá]mara|camara/.test(s)) return ['flex', 'camara', 'cámara'];
  if (/tapa|carcasa|housing/.test(s)) return ['tapa', 'carcasa', 'housing'];
  if (/altavoz|speaker|auricular/.test(s)) return ['altavoz', 'speaker', 'auricular'];
  // Software / cuentas → no descuenta stock físico
  if (/flasheo|firmware|cuenta google|cuenta xiaomi|samsung account|software/.test(s)) return null;
  return null;
}

/** Tokens del modelo (Camon 18P → ["camon","18p","18"]) */
function _tokensDispositivo(device) {
  const raw = (device || '').toLowerCase()
    .replace(/[^a-z0-9áéíóúñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // quitar marcas genéricas poco útiles solas
  const skip = new Set(['samsung', 'xiaomi', 'huawei', 'tecno', 'infinix', 'motorola', 'iphone', 'apple', 'redmi', 'galaxy', 'celular', 'telefono', 'teléfono']);
  const tokens = [];
  raw.forEach(t => {
    if (t.length < 2) return;
    tokens.push(t);
    // 18p → también 18
    const m = t.match(/^(\d+)([a-z]+)$/);
    if (m) tokens.push(m[1]);
  });
  return [...new Set(tokens)];
}

/**
 * Busca el mejor repuesto en stock para service + device.
 * Retorna el item de stockData o null.
 */
function buscarRepuestoParaOrden(service, device) {
  const tipos = _tipoRepuestoPorServicio(service);
  if (!tipos) return null; // servicio sin pieza física
  if (!stockData || !stockData.length) return null;

  const tokens = _tokensDispositivo(device);
  let best = null;
  let bestScore = 0;

  stockData.forEach(item => {
    const name = (item.name || '').toLowerCase();
    const cat = (item.cat || '').toLowerCase();
    const texto = name + ' ' + cat;

    // debe coincidir tipo de repuesto
    const matchTipo = tipos.some(t => texto.includes(t));
    if (!matchTipo) return;

    let score = 10; // base por tipo
    tokens.forEach(tok => {
      if (texto.includes(tok)) score += tok.length >= 3 ? 5 : 2;
    });
    // preferir con stock disponible
    if (item.qty > 0) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });

  // exigir al menos tipo + algo de modelo si hay tokens, o solo tipo si no hay tokens útiles
  if (!best) return null;
  if (tokens.length && bestScore < 12) {
    // solo match de tipo débil — igual devolvemos el de tipo con stock
    const soloTipo = stockData
      .filter(item => {
        const texto = ((item.name || '') + ' ' + (item.cat || '')).toLowerCase();
        return tipos.some(t => texto.includes(t)) && item.qty > 0;
      })
      .sort((a, b) => b.qty - a.qty)[0];
    return soloTipo || best;
  }
  return best;
}

/**
 * Verifica stock y descuenta 1 unidad al pasar a Listo.
 * @returns {{ ok: boolean, item?: object, mensaje: string, sinPieza?: boolean }}
 */
async function consumirStockPorOrden(orden, { forzarSinStock = false } = {}) {
  if (!orden) return { ok: true, mensaje: '', sinPieza: true };
  if (_yaDescontoStock(orden.id)) {
    return { ok: true, mensaje: 'Stock ya descontado para esta orden', sinPieza: true };
  }

  const tipos = _tipoRepuestoPorServicio(orden.service);
  if (!tipos) {
    return { ok: true, mensaje: 'Servicio sin repuesto físico', sinPieza: true };
  }

  // Asegurar stock fresco
  if (!stockData.length) {
    try { await loadStock(); } catch (_) {}
  }

  const item = buscarRepuestoParaOrden(orden.service, orden.device);

  if (!item) {
    const msg = 'No hay en inventario un repuesto que coincida con "' + orden.service + '" / "' + orden.device + '".';
    if (forzarSinStock) return { ok: true, mensaje: msg, sinPieza: true };
    return { ok: false, mensaje: msg + '\n\n¿Marcar Listo de todos modos sin descontar stock?', sinPieza: true };
  }

  if (item.qty <= 0) {
    const msg = 'Sin stock de "' + item.name + '" (0 unidades).';
    if (forzarSinStock) return { ok: true, mensaje: msg, sinPieza: false, item };
    return { ok: false, mensaje: msg + '\n\n¿Marcar Listo de todos modos?', item, sinPieza: false };
  }

  try {
    await StockAPI.ajustar(item.dbId, 'sub', 1);
    _markStockDeducted(orden.id);
    await loadStock();
    if (typeof updateDashboard === 'function') updateDashboard();
    return {
      ok: true,
      item,
      mensaje: '✓ Stock: −1 ' + item.name + ' (quedan ' + Math.max(0, item.qty - 1) + ')',
    };
  } catch (e) {
    return { ok: false, item, mensaje: 'No se pudo descontar stock: ' + (e.message || e) };
  }
}

/** Pre-check sin descontar: ¿hay stock? */
function verificarStockParaOrden(orden) {
  const tipos = _tipoRepuestoPorServicio(orden.service);
  if (!tipos) return { requiere: false, ok: true, mensaje: 'Sin pieza física' };
  const item = buscarRepuestoParaOrden(orden.service, orden.device);
  if (!item) return { requiere: true, ok: false, item: null, mensaje: 'No se encontró repuesto compatible en inventario' };
  if (item.qty <= 0) return { requiere: true, ok: false, item, mensaje: 'Sin stock: ' + item.name };
  return { requiere: true, ok: true, item, mensaje: item.name + ' (stock: ' + item.qty + ')' };
}

async function cambiarEstado(id, nuevoStatusRaw) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;

  const pasaAListo = nuevoStatusRaw === 'listo' && o.statusRaw !== 'listo';

  if (pasaAListo) {
    const check = verificarStockParaOrden(o);
    if (check.requiere && check.ok) {
      const ok = confirm(
        'Al marcar LISTO se descontará del stock:\n\n' +
        '• ' + check.item.name + ' (hay ' + check.item.qty + ')\n' +
        '• Servicio: ' + o.service + '\n' +
        '• Equipo: ' + o.device + '\n\n¿Continuar?'
      );
      if (!ok) { await loadOrders(); return; }
    } else if (check.requiere && !check.ok) {
      const ok = confirm(
        '⚠️ ' + check.mensaje + '\n\n' +
        'Servicio: ' + o.service + ' · Equipo: ' + o.device + '\n\n' +
        '¿Marcar Listo de todos modos SIN descontar stock?'
      );
      if (!ok) { await loadOrders(); return; }
    }
  }

  try {
    await OrdersAPI.cambiarEstado(id, nuevoStatusRaw);

    if (pasaAListo) {
      const check = verificarStockParaOrden(o);
      if (check.requiere && check.ok) {
        const r = await consumirStockPorOrden(o);
        if (r.ok && r.item) showToast(r.mensaje);
        else if (!r.ok) showToast(r.mensaje, 'error');
      }
    }

    await loadOrders();
    showToast('✓ Orden ' + o.code + ' → ' + (ESTADOS_ORDEN.find(e => e.value === nuevoStatusRaw)?.label || nuevoStatusRaw));
  } catch (e) {
    showToast('No se pudo cambiar el estado: ' + e.message, 'error');
    await loadOrders();
  }
}

function editarOrden(id) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('edit-order-id', o.id);
  set('edit-order-code', o.code);
  const lab = document.getElementById('edit-order-code-label');
  if (lab) lab.textContent = o.code;
  set('edit-order-client', o.client);
  set('edit-order-phone', o.phone);
  set('edit-order-device', o.device);
  set('edit-order-service', o.service);
  set('edit-order-monto', o.monto);
  set('edit-order-obs', o.obs);
  const ss = document.getElementById('edit-order-status');
  if (ss) {
    for (let i = 0; i < ss.options.length; i++) {
      if (ss.options[i].value === o.status) {
        ss.selectedIndex = i;
        break;
      }
    }
  }
  const ts = document.getElementById('edit-order-tech');
  if (ts && o.tecnico_id) {
    for (let i = 0; i < ts.options.length; i++) {
      if (String(ts.options[i].value) === String(o.tecnico_id)) {
        ts.selectedIndex = i;
        break;
      }
    }
  }
  const selSuc = document.getElementById('edit-order-sucursal');
  poblarSelectSucursal(selSuc);
  selSuc.value = o.sucursal_id ?? '';

  openModal('editar-orden');
}

async function guardarEdicionOrden() {
  if (_locks['orden_edit']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['orden_edit'] = true;
  const __btn_orden_edit = document.querySelector('[onclick="guardarEdicionOrden()"]');
  let __old_orden_edit = '';
  if (__btn_orden_edit) {
    __btn_orden_edit.disabled = true;
    __old_orden_edit = __btn_orden_edit.textContent;
    __btn_orden_edit.textContent = 'Guardando…';
  }
  try {

  const id = document.getElementById('edit-order-id')?.value;
  if (!id) return;
  const clientEdit = document.getElementById('edit-order-client').value.trim();
  if (!validarNombre(clientEdit, 'Cliente')) return;
  const phoneEdit = document.getElementById('edit-order-phone').value.trim();
  if (!validarTelefono(phoneEdit, false)) return;
  const montoEdit = document.getElementById('edit-order-monto').value;
  if (montoEdit !== '' && !validarMonto(montoEdit, 'Monto', true)) return;
  const statusVal = document.getElementById('edit-order-status').value;
  try {
    await OrdersAPI.update(id, {
      client: clientEdit,
      phone: limpiarTelefono(phoneEdit),
      device: document.getElementById('edit-order-device').value.trim(),
      service: document.getElementById('edit-order-service').value.trim(),
      monto: parseFloat(document.getElementById('edit-order-monto').value) || 0,
      obs: document.getElementById('edit-order-obs').value.trim(),
      status: mapStatusToApi(statusVal),
      tecnico_id: document.getElementById('edit-order-tech').value || null,
      sucursal_id: document.getElementById('edit-order-sucursal').value || null,
    });
    const nuevoStatus = mapStatusToApi(statusVal);
    const pasabaAListo = nuevoStatus === 'listo' && (ordersData.find(x => String(x.id) === String(id)) || {}).statusRaw !== 'listo';
    if (pasabaAListo) {
      const ordenLocal = { ...ordersData.find(x => String(x.id) === String(id)), service: document.getElementById('edit-order-service').value.trim(), device: document.getElementById('edit-order-device').value.trim(), id: id };
      const check = verificarStockParaOrden(ordenLocal);
      if (check.requiere && check.ok) {
        const r = await consumirStockPorOrden(ordenLocal);
        if (r.ok && r.item) showToast(r.mensaje);
      } else if (check.requiere && !check.ok) {
        showToast('⚠️ ' + check.mensaje, 'error');
      }
    }
    closeModal();
    await loadOrders();
    showToast('✓ Orden actualizada');
  } catch (e) {
    alert('No se pudo guardar: ' + e.message);
  }

  } finally {
    _locks['orden_edit'] = false;
    if (__btn_orden_edit) {
      __btn_orden_edit.disabled = false;
      __btn_orden_edit.textContent = __old_orden_edit || __btn_orden_edit.textContent;
    }
  }
}

let _guardandoOrden = false;

async function guardarOrden() {
  // Evita órdenes duplicadas por doble clic o lag
  if (_guardandoOrden) {
    showToast('Ya se está guardando la orden…', 'warn');
    return;
  }

  const client = document.getElementById('modal-client').value.trim();
  const phone = document.getElementById('modal-phone').value.trim();
  const device = document.getElementById('modal-device').value.trim();
  const service = document.getElementById('modal-service').value;
  const montoRaw = document.getElementById('modal-monto').value;
  const monto = parseFloat(montoRaw) || 0;
  const obs = document.getElementById('modal-obs').value.trim();
  const sucursal_id = document.getElementById('modal-branch').value || null;
  const tecnico_id = document.getElementById('modal-tech').value || null;

  if (!validarNombre(client, 'Cliente')) return;
  if (!validarTelefono(phone, false)) return;
  if (!device) { showToast('Equipo es obligatorio', 'error'); return; }
  if (!service) { showToast('Servicio es obligatorio', 'error'); return; }
  if (montoRaw !== '' && !validarMonto(montoRaw, 'Monto estimado', true)) return;

  const btn = document.querySelector('#modal-orden .btn-primary, [onclick="guardarOrden()"]');
  _guardandoOrden = true;
  if (btn) {
    btn.disabled = true;
    btn.dataset._oldText = btn.textContent;
    btn.textContent = 'Guardando…';
  }

  try {
    await OrdersAPI.create({
      client,
      phone: (limpiarTelefono(phone).length >= 7 ? limpiarTelefono(phone) : null),
      device,
      service,
      sucursal_id,
      tecnico_id: currentUser.rol === 'Técnico' ? currentUser.id : tecnico_id,
      monto,
      obs,
    });
    closeModal();
    await loadOrders();
    await loadClientes();
    showToast('✓ Orden creada correctamente');
  } catch (e) {
    showToast(e.message || 'Error al crear orden', 'error');
  } finally {
    _guardandoOrden = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset._oldText || 'Guardar orden';
    }
  }
}

async function verReciboOrden(id) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;
  if (o.monto <= 0) {
    alert('Asigna un monto a la orden antes de generar el recibo.');
    return;
  }

  // Si ya tiene un recibo generado, solo lo mostramos (no se duplica)
  const existente = recibosData.find((r) => r.ordenCode === o.code);
  if (existente) {
    mostrarVistaPreviaRecibo(existente.id);
    return;
  }

  try {
    const recibo = await RecibosAPI.create({
      orden_id: o.id,
      cliente: o.client,
      telefono: o.phone,
      equipo: o.device,
      servicio: o.service,
      monto: o.monto,
      pago: 'Efectivo',
      sucursal_id: o.sucursal_id,
    });
    await loadRecibos();
    await loadOrders();
    showToast(`✓ Recibo ${recibo.num_recibo} generado`);
    mostrarVistaPreviaRecibo(recibo.id);
  } catch (e) {
    alert('No se pudo generar el recibo: ' + e.message);
  }
}

// ===== RECIBOS: vista previa / imprimir =====
let _reciboEnPreview = null;

function _logoUrl() {
  try {
    const base = (window.location.origin || '') + (window.location.pathname.replace(/\/[^/]*$/, '/') || '/');
    return base + 'img/logo-icon.svg';
  } catch {
    return 'img/logo-icon.svg';
  }
}

function _micelPrintShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #111827;
      background: #fff;
      font-size: 14px;
      line-height: 1.5;
    }
    .doc {
      max-width: 520px;
      margin: 0 auto;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    .doc-head {
      background: linear-gradient(135deg, #ff1440 0%, #c01030 100%);
      color: #fff;
      padding: 20px 24px;
      text-align: center;
    }
    .doc-head .brand {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 3px;
      margin: 0;
    }
    .doc-head .tag {
      font-size: 12px;
      opacity: .92;
      margin-top: 4px;
    }
    .doc-body { padding: 22px 24px 28px; }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 13px;
    }
    .row .lbl { color: #6b7280; font-weight: 500; }
    .row .val { font-weight: 600; text-align: right; color: #111827; }
    .total-box {
      margin-top: 18px;
      background: #fff5f7;
      border: 2px solid #ff1440;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .total-box .t-lbl { font-size: 13px; color: #6b7280; font-weight: 600; }
    .total-box .t-val { font-size: 26px; font-weight: 800; color: #ff1440; }
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
    }
    .badge-tipo {
      display: inline-block;
      margin-top: 8px;
      background: rgba(255,255,255,.2);
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }
    table.crono {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin: 12px 0 16px;
    }
    table.crono th {
      background: #f3f4f6;
      padding: 8px;
      text-align: left;
      font-size: 11px;
      color: #4b5563;
    }
    table.crono td {
      padding: 8px;
      border-bottom: 1px solid #f3f4f6;
    }
    .clausula {
      background: #fefce8;
      border: 1px solid #fde047;
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      color: #713f12;
      margin: 14px 0;
    }
    .firmas {
      display: flex;
      justify-content: space-between;
      margin-top: 36px;
      gap: 24px;
    }
    .firmas div {
      flex: 1;
      text-align: center;
      border-top: 1px solid #9ca3af;
      padding-top: 8px;
      font-size: 12px;
      color: #4b5563;
    }
    @media print {
      body { padding: 0; }
      .doc { box-shadow: none; border-color: #ccc; max-width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function _reciboDocHtml(r) {
  const logo = 'img/logo-icon.svg';
  const check = (label) =>
    `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:11px">
      <span style="display:inline-block;width:12px;height:12px;border:1.5px solid #333;border-radius:2px"></span>${label}
    </label>`;
  const fnRow = (name) =>
    `<tr>
      <td style="padding:3px 6px;font-size:11px;border-bottom:1px solid #eee">${name}</td>
      <td style="width:28px;text-align:center;border:1px solid #ccc;font-size:10px">Sí</td>
      <td style="width:28px;text-align:center;border:1px solid #ccc;font-size:10px">No</td>
      <td style="width:28px;text-align:center;border:1px solid #ccc;font-size:10px">N/A</td>
    </tr>`;

  return `
  <div class="doc ot-doc" style="max-width:700px;margin:0 auto;border:2px solid #222;border-radius:4px;overflow:hidden;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif">
    <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:2px solid #222;background:#fafafa">
      <img src="${logo}" alt="MiCEL" style="width:56px;height:56px;flex-shrink:0">
      <div style="flex:1">
        <div style="font-size:22px;font-weight:900;letter-spacing:1px">mi<span style="color:#F5C518">CEL</span></div>
        <div style="font-size:10px;color:#444;line-height:1.35">Servicio técnico de celulares<br>El Alto · Bolivia</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:800;border:2px solid #222;padding:6px 12px;display:inline-block">ORDEN DE TRABAJO</div>
        <div style="font-size:13px;font-weight:700;margin-top:6px">N° ${r.numRecibo || '—'}</div>
        <div style="font-size:11px;color:#555">${r.fecha || ''} ${r.hora || ''}</div>
      </div>
    </div>
    <div style="padding:14px 16px">
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
        <tr>
          <td style="padding:4px 6px;width:50%;border:1px solid #ccc"><b>Cliente:</b> ${r.cliente || '________________'}</td>
          <td style="padding:4px 6px;width:50%;border:1px solid #ccc"><b>Teléfono:</b> ${r.telefono || '________________'}</td>
        </tr>
        <tr>
          <td style="padding:4px 6px;border:1px solid #ccc"><b>Equipo:</b> ${r.equipo || '________________'}</td>
          <td style="padding:4px 6px;border:1px solid #ccc"><b>IMEI / Serie:</b> ${r.imei || '________________'}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:4px 6px;border:1px solid #ccc"><b>Servicio / Falla:</b> ${r.servicio || '________________'}</td>
        </tr>
        <tr>
          <td style="padding:4px 6px;border:1px solid #ccc"><b>Técnico:</b> ${r.techName || '—'}</td>
          <td style="padding:4px 6px;border:1px solid #ccc"><b>Sucursal:</b> ${r.sucursal || '—'}</td>
        </tr>
      </table>
      <div style="font-size:10px;font-weight:700;margin:8px 0 4px;text-transform:uppercase">Estado al ingreso</div>
      <div style="margin-bottom:10px;line-height:1.8">${check('Mojado')} ${check('Reparación previa')} ${check('Tornillería incompleta')} ${check('No enciende')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-start">
        <div style="flex:1.1;min-width:200px;border:1px solid #ccc;border-radius:6px;padding:10px;text-align:center">
          <div style="font-size:10px;font-weight:700;margin-bottom:6px">ESTADO FÍSICO</div>
          <svg viewBox="0 0 220 150" width="200" height="130" xmlns="http://www.w3.org/2000/svg">
            <!-- Frente -->
            <rect x="18" y="12" width="70" height="120" rx="12" fill="none" stroke="#111" stroke-width="2.2"/>
            <rect x="26" y="28" width="54" height="88" rx="3" fill="none" stroke="#444" stroke-width="1.2"/>
            <circle cx="53" cy="20" r="3" fill="none" stroke="#333" stroke-width="1.2"/>
            <rect x="44" y="122" width="18" height="4" rx="2" fill="#222"/>
            <text x="53" y="145" text-anchor="middle" font-size="8" fill="#666">Frente</text>
            <!-- Lateral -->
            <rect x="105" y="20" width="22" height="110" rx="6" fill="none" stroke="#111" stroke-width="2"/>
            <line x1="108" y1="40" x2="124" y2="40" stroke="#666" stroke-width="1"/>
            <line x1="108" y1="55" x2="124" y2="55" stroke="#666" stroke-width="1"/>
            <line x1="108" y1="95" x2="124" y2="95" stroke="#666" stroke-width="1.5"/>
            <text x="116" y="145" text-anchor="middle" font-size="8" fill="#666">Lado</text>
            <!-- Trasera -->
            <rect x="145" y="12" width="70" height="120" rx="12" fill="none" stroke="#111" stroke-width="2.2"/>
            <circle cx="168" cy="32" r="8" fill="none" stroke="#333" stroke-width="1.5"/>
            <circle cx="168" cy="32" r="3.5" fill="none" stroke="#555" stroke-width="1"/>
            <rect x="155" y="55" width="50" height="50" rx="4" fill="none" stroke="#ddd" stroke-width="1" stroke-dasharray="3 2"/>
            <text x="180" y="145" text-anchor="middle" font-size="8" fill="#666">Dorso</text>
          </svg>
          <div style="font-size:9px;color:#666;margin-top:2px">Marcar golpes, rayones o zonas dañadas</div>
        </div>
        <div style="flex:1;min-width:160px">
          <div style="font-size:10px;font-weight:700;margin-bottom:4px">FUNCIONES</div>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f3f4f6"><th style="text-align:left;padding:3px 6px;font-size:10px"></th><th style="font-size:9px">Sí</th><th style="font-size:9px">No</th><th style="font-size:9px">N/A</th></tr>
            ${fnRow('Pantalla')} ${fnRow('Botones')} ${fnRow('Centro de carga')} ${fnRow('Micrófono')}
            ${fnRow('Cámara trasera')} ${fnRow('Cámara frontal')} ${fnRow('WiFi')} ${fnRow('Bluetooth')}
          </table>
        </div>
        <div style="width:100px;border:1px solid #222;border-radius:6px;padding:8px;text-align:center;flex-shrink:0">
          <div style="font-size:9px;font-weight:700;margin-bottom:6px">CONTRASEÑA<br><span style="font-weight:500;color:#555">Patrón</span></div>
          <svg viewBox="0 0 90 90" width="78" height="78">
            <circle cx="20" cy="20" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="45" cy="20" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="70" cy="20" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="20" cy="45" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="45" cy="45" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="70" cy="45" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="20" cy="70" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="45" cy="70" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
            <circle cx="70" cy="70" r="7" fill="none" stroke="#222" stroke-width="1.8"/>
          </svg>
          <div style="font-size:8px;color:#666;margin-top:4px;line-height:1.2">Dibujar patrón<br>o anotar PIN</div>
          <div style="border-bottom:1px solid #999;margin-top:8px;height:16px;font-size:10px"></div>
        </div>
      </div>
      <div style="border:1px solid #ccc;min-height:48px;padding:8px;margin-bottom:12px;font-size:12px"><b style="font-size:10px;color:#555">OBSERVACIONES</b><br>${r.obs || '&nbsp;'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <div style="flex:1;border:2px solid #222;padding:10px;text-align:center;min-width:100px"><div style="font-size:10px;color:#555">TOTAL</div><div style="font-size:18px;font-weight:800">Bs ${fmtMonto(r.monto)}</div></div>
        <div style="flex:1;border:1px solid #ccc;padding:10px;text-align:center;min-width:100px"><div style="font-size:10px;color:#555">Forma de pago</div><div style="font-size:13px;font-weight:700">${r.pago || '—'}</div></div>
        <div style="flex:1;border:1px solid #ccc;padding:10px;text-align:center;min-width:100px"><div style="font-size:10px;color:#555">Garantía / Entrega</div><div style="font-size:12px">_______________</div></div>
      </div>
      ${typeof _qrCobroNegocioHtml === 'function' ? _qrCobroNegocioHtml({ extraLine: 'QR de pago MiCEL · Ref: ' + (r.numRecibo || '') }) : ''}
      <div style="display:flex;gap:24px;margin-top:20px">
        <div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:6px;font-size:11px">Firma del cliente</div>
        <div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:6px;font-size:11px">Firma / sello MiCEL</div>
      </div>
      <div style="font-size:9px;color:#888;text-align:center;margin-top:12px">Documento generado por MiCEL · Servicio técnico</div>
    </div>
  </div>`;
}


function mostrarVistaPreviaRecibo(id) {
  const r = recibosData.find((x) => x.id === id);
  if (!r) return;
  _reciboEnPreview = r;
  document.getElementById('recibo-preview').innerHTML = _reciboDocHtml(r);
  document.getElementById('modal-recibo').classList.remove('hidden');
}

function imprimirRecibo() {
  if (!_reciboEnPreview) return;
  const w = window.open('', '_blank', 'width=560,height=720');
  if (!w) {
    showToast('Permite ventanas emergentes para imprimir', 'error');
    return;
  }
  w.document.write(_micelPrintShell(_reciboEnPreview.numRecibo || 'Recibo', _reciboDocHtml(_reciboEnPreview).replace(/src="img\/logo-icon.svg"/g, 'src="' + _logoUrl() + '"')));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

// ===== RECIBOS: editar =====
function abrirEditarRecibo(id) {
  const r = recibosData.find((x) => x.id === id);
  if (!r) return;

  document.getElementById('edit-rec-num').value = id; // guardamos el ID real, no el texto "REC-0001"
  document.getElementById('edit-rec-num-display').textContent = r.numRecibo;
  document.getElementById('edit-rec-cliente').value = r.cliente || '';
  document.getElementById('edit-rec-telefono').value = r.telefono === '—' ? '' : r.telefono;
  document.getElementById('edit-rec-equipo').value = r.equipo || '';
  document.getElementById('edit-rec-servicio').value = r.servicio || '';
  document.getElementById('edit-rec-monto').value = r.monto || '';
  document.getElementById('edit-rec-pago').value = r.pago || 'Efectivo';
  document.getElementById('edit-rec-obs').value = r.obs || '';

  const selSuc = document.getElementById('edit-rec-sucursal');
  poblarSelectSucursal(selSuc);
  selSuc.value = r.sucursal_id ?? '';

  document.getElementById('modal-editar-recibo').classList.remove('hidden');
}

async function guardarEdicionRecibo() {
  if (_locks['recibo_edit']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['recibo_edit'] = true;
  const __btn_recibo_edit = document.querySelector('[onclick="guardarEdicionRecibo()"]');
  let __old_recibo_edit = '';
  if (__btn_recibo_edit) {
    __btn_recibo_edit.disabled = true;
    __old_recibo_edit = __btn_recibo_edit.textContent;
    __btn_recibo_edit.textContent = 'Guardando…';
  }
  try {

  const id = parseInt(document.getElementById('edit-rec-num').value, 10);
  const payload = {
    cliente: document.getElementById('edit-rec-cliente').value.trim(),
    telefono: document.getElementById('edit-rec-telefono').value.trim(),
    equipo: document.getElementById('edit-rec-equipo').value.trim(),
    servicio: document.getElementById('edit-rec-servicio').value.trim(),
    monto: parseFloat(document.getElementById('edit-rec-monto').value) || 0,
    pago: document.getElementById('edit-rec-pago').value,
    sucursal_id: document.getElementById('edit-rec-sucursal').value || null,
    obs: document.getElementById('edit-rec-obs').value.trim(),
  };

  try {
    await RecibosAPI.update(id, payload);
    await loadRecibos();
    closeModal();
    showToast('✓ Recibo actualizado');
  } catch (e) {
    alert('No se pudo actualizar el recibo: ' + e.message);
  }

  } finally {
    _locks['recibo_edit'] = false;
    if (__btn_recibo_edit) {
      __btn_recibo_edit.disabled = false;
      __btn_recibo_edit.textContent = __old_recibo_edit || __btn_recibo_edit.textContent;
    }
  }
}

// ---------- stock ----------
function renderStock(data) {
  if (typeof revisarAlertasStock === 'function') revisarAlertasStock();
  const el = document.getElementById('stock-body');
  if (!el) return;
  el.innerHTML = (data || [])
    .map((s) => {
      const pct = Math.min(100, Math.round((s.qty / Math.max(s.min * 2, 1)) * 100));
      const color = stockColor(s.qty, s.min);
      const img = s.foto_url
        ? `<img class="stock-thumb" src="${s.foto_url}" alt="" onerror="this.outerHTML='<span class=\'stock-thumb-ph\'>📦</span>'">`
        : `<span class="stock-thumb-ph">📦</span>`;
      return `<tr>
        <td>${img}</td>
        <td><code class="code-tag">${s.id}</code></td>
        <td>${s.name}</td>
        <td>${s.cat}</td>
        <td style="font-weight:600">${s.qty}</td>
        <td>${s.min}</td>
        <td>Bs ${fmtMonto(s.precio)}</td>
        <td><div class="stock-bar-wrap"><div class="stock-bg"><div class="stock-fill-inner" style="width:${pct}%;background:${color}"></div></div></td>
        <td>${stockBadge(s.qty, s.min)}</td>
        <td style="white-space:nowrap">
          ${esAdminOSuper() ? `<button class="btn-sm btn-sm-primary" onclick="editarRepuesto(${s.dbId})">Editar</button>
          <button class="btn-sm" onclick="ajustarStock(${s.dbId})" title="Ajustar cantidad">±</button>` : '<span style="color:var(--gray-400);font-size:12px">Solo lectura</span>'}
        </td>
      </tr>`;
    })
    .join('');
}

function filterStock(q) {
  loadStock(q ? { q } : {});
}

/** Acepta el id numérico real O el código de texto (REP-001) — las dos
 * pantallas de Stock (tabla simple y el modal de tarjetas) pasan cosas distintas. */
function _buscarRepuesto(idOrCode) {
  return stockData.find((x) => x.dbId === idOrCode || x.id === idOrCode);
}

function editarRepuesto(idOrCode) {
  if (!esAdminOSuper()) { showToast('Solo Admin / Super Admin pueden modificar el stock', 'error'); return; }

  const s = _buscarRepuesto(idOrCode);
  if (!s) return;

  document.getElementById('edit-rep-id').value = s.dbId;
  document.getElementById('edit-rep-name').value = s.name;
  document.getElementById('edit-rep-cat').value = s.cat;
  document.getElementById('edit-rep-precio').value = s.precio;
  document.getElementById('edit-rep-qty').value = s.qty;
  document.getElementById('edit-rep-min').value = s.min;
  const prev = document.getElementById('edit-rep-foto-prev');
  if (prev) {
    if (s.foto_url) { prev.src = s.foto_url; prev.style.display = 'block'; }
    else { prev.removeAttribute('src'); prev.style.display = 'none'; }
  }
  const fileEd = document.getElementById('edit-rep-foto');
  if (fileEd) fileEd.value = '';

  openModal('editar-repuesto');
}

async function guardarEdicionRepuesto() {
  if (!esAdminOSuper()) { showToast('Solo Admin / Super Admin pueden modificar el stock', 'error'); return; }
  const id = document.getElementById('edit-rep-id')?.value;
  const name = document.getElementById('edit-rep-name')?.value.trim() || '';
  const cat = document.getElementById('edit-rep-cat')?.value.trim() || '';
  const precio = document.getElementById('edit-rep-precio')?.value || '0';
  const qty = document.getElementById('edit-rep-qty')?.value || '0';
  const min = document.getElementById('edit-rep-min')?.value || '1';
  const foto = document.getElementById('edit-rep-foto')?.files?.[0];
  const fotoUrl = document.getElementById('edit-rep-foto-url')?.value || '';
  const autoFoto = document.getElementById('edit-rep-auto-foto')?.checked;
  if (!id || !name) { showToast('Nombre es obligatorio', 'error'); return; }
  const btn = document.querySelector('[onclick="guardarEdicionRepuesto()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('categoria', cat);
    fd.append('precio', precio);
    fd.append('qty', qty);
    fd.append('min', min);
    if (foto) fd.append('foto', foto);
    else if (fotoUrl) fd.append('foto_url', fotoUrl);
    else if (autoFoto) fd.append('auto_foto', '1');
    if (typeof StockAPI.updateForm === 'function') await StockAPI.updateForm(id, fd);
    else await StockAPI.update(id, { name, categoria: cat, precio: +precio, qty: +qty, min: +min });
    showToast('✓ Repuesto actualizado');
    closeModal();
    await loadStock();
  } catch (e) {
    showToast('No se pudo actualizar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
}

// ===== AJUSTE RÁPIDO DE STOCK (+/-/=) =====
function ajustarStock(idOrCode) {
  if (!esAdminOSuper()) { showToast('Solo Admin / Super Admin pueden modificar el stock', 'error'); return; }

  const s = _buscarRepuesto(idOrCode);
  if (!s) return;

  document.getElementById('adj-id').value = s.dbId;
  document.getElementById('adj-name').textContent = s.name;
  document.getElementById('adj-min').value = s.min;
  document.getElementById('adj-precio').value = s.precio;
  document.getElementById('adj-qty').value = s.qty;
  document.getElementById('adj-operacion').value = 'add';
  document.getElementById('adj-cantidad').value = '';

  openModal('ajuste-stock');
}

async function guardarAjusteStock() {
  if (_locks['ajuste']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['ajuste'] = true;
  const __btn_ajuste = document.querySelector('[onclick="guardarAjusteStock()"]');
  let __old_ajuste = '';
  if (__btn_ajuste) {
    __btn_ajuste.disabled = true;
    __old_ajuste = __btn_ajuste.textContent;
    __btn_ajuste.textContent = 'Guardando…';
  }
  try {

  if (!esAdminOSuper()) { showToast('Solo Admin / Super Admin pueden modificar el stock', 'error'); return; }

  const id = document.getElementById('adj-id').value;
  const operacion = document.getElementById('adj-operacion').value;
  const cantidad = parseInt(document.getElementById('adj-cantidad').value, 10);
  const min = parseInt(document.getElementById('adj-min').value, 10) || 1;
  const precio = parseFloat(document.getElementById('adj-precio').value) || 0;

  if (isNaN(cantidad) || cantidad < 0 || !Number.isInteger(cantidad)) {
    showToast('Cantidad: número entero ≥ 0', 'error');
    return;
  }
  if (operacion !== 'set' && cantidad === 0) {
    showToast('Para sumar/restar la cantidad debe ser mayor a 0', 'error');
    return;
  }

  try {
    // El ajuste de cantidad y la edición de min/precio son dos endpoints
    // distintos en el backend — se mandan los dos si hace falta.
    await StockAPI.ajustar(id, operacion, cantidad);
    await StockAPI.update(id, { min, precio });

    await loadStock();
    if (typeof renderStockModal === 'function') renderStockModal();
    if (typeof selectStockItem === 'function' && stockDetailId) {
      selectStockItem(stockDetailId); // refresca el panel de detalle si estaba abierto
    }
    closeModal();
    if (typeof updateDashboard === 'function') updateDashboard();
    showToast('✓ Stock ajustado');
  } catch (e) {
    showToast('No se pudo ajustar el stock: ' + e.message, 'error');
  }

  } finally {
    _locks['ajuste'] = false;
    if (__btn_ajuste) {
      __btn_ajuste.disabled = false;
      __btn_ajuste.textContent = __old_ajuste || __btn_ajuste.textContent;
    }
  }
}

async function guardarRepuesto() {
  if (!esAdminOSuper()) { showToast('Solo Admin / Super Admin pueden modificar el stock', 'error'); return; }
  const name = document.getElementById('new-rep-name')?.value.trim() || '';
  const cat = document.getElementById('new-rep-cat')?.value || 'General';
  const precio = document.getElementById('new-rep-precio')?.value || '0';
  const qty = document.getElementById('new-rep-qty')?.value || '0';
  const min = document.getElementById('new-rep-min')?.value || '5';
  const foto = document.getElementById('new-rep-foto')?.files?.[0];
  const fotoUrl = document.getElementById('new-rep-foto-url')?.value || '';
  const autoFoto = document.getElementById('new-rep-auto-foto')?.checked;
  if (!name) { showToast('Nombre del repuesto es obligatorio', 'error'); return; }
  const btn = document.querySelector('[onclick="guardarRepuesto()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('categoria', cat);
    fd.append('precio', precio);
    fd.append('qty', qty);
    fd.append('min', min);
    if (foto) fd.append('foto', foto);
    else if (fotoUrl) fd.append('foto_url', fotoUrl);
    else if (autoFoto) fd.append('auto_foto', '1');
    if (typeof StockAPI.createForm === 'function') await StockAPI.createForm(fd);
    else await StockAPI.create({ name, categoria: cat, precio: +precio, qty: +qty, min: +min, foto_url: fotoUrl || undefined, auto_foto: autoFoto });
    showToast('✓ Repuesto agregado');
    closeModal();
    const f = document.getElementById('new-rep-foto');
    if (f) f.value = '';
    const prev = document.getElementById('new-rep-foto-prev');
    if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
    const hu = document.getElementById('new-rep-foto-url');
    if (hu) hu.value = '';
    if (document.getElementById('new-rep-name')) document.getElementById('new-rep-name').value = '';
    await loadStock();
  } catch (e) {
    showToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Agregar repuesto'; }
  }
}

function revisarAlertasStock() {
  const toast = document.getElementById('stock-toast');
  if (!toast) return;
  const sin = stockData.filter((s) => s.qty === 0);
  const crit = stockData.filter((s) => s.qty > 0 && s.qty < s.min);
  if (!sin.length && !crit.length) {
    toast.classList.add('hidden');
    return;
  }
  const msg = document.getElementById('stock-toast-msg');
  if (msg) {
    msg.innerHTML =
      (sin.length ? `🔴 ${sin.length} sin stock<br>` : '') +
      (crit.length ? `🟡 ${crit.length} críticos` : '');
  }
  toast.classList.remove('hidden');
}
function cerrarToastStock() {
  document.getElementById('stock-toast')?.classList.add('hidden');
}

// ---------- ventas ----------
function renderVentas() {
  const total = ventasHoy.reduce((a, v) => a + v.monto, 0);
  const totalEl = document.getElementById('ventas-total');
  const countEl = document.getElementById('ventas-count');
  if (totalEl) totalEl.textContent = 'Bs ' + fmtMonto(total);
  if (countEl) countEl.textContent = ventasHoy.length + ' transacciones';
  const body = document.getElementById('ventas-body');
  if (!body) return;
  body.innerHTML = ventasHoy
    .map(
      (v) => `<tr>
      <td>${v.hora}</td><td>${v.client}</td><td>${v.detail}</td>
      <td>${v.techName}</td><td>${v.pago}</td>
      <td style="font-weight:600">Bs ${fmtMonto(v.monto)}</td>
    </tr>`
    )
    .join('');
}

async function registrarVenta() {
  if (_locks['venta']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['venta'] = true;
  const __btn_venta = document.querySelector('[onclick="registrarVenta()"]');
  let __old_venta = '';
  if (__btn_venta) {
    __btn_venta.disabled = true;
    __old_venta = __btn_venta.textContent;
    __btn_venta.textContent = 'Guardando…';
  }
  try {

  const client = document.getElementById('venta-cliente')?.value.trim() || '';
  const detail = document.getElementById('venta-detalle')?.value.trim() || '';
  const montoRaw = document.getElementById('venta-monto')?.value;
  const monto = parseFloat(montoRaw) || 0;
  const pagoRaw = (document.getElementById('venta-pago')?.value || 'efectivo').toLowerCase();
  const pago = pagoRaw.includes('qr') ? 'qr' : (pagoRaw.includes('transfer') ? 'transferencia' : 'efectivo');
  const techSel = document.getElementById('venta-tech');
  const tecnico_id = techSel && techSel.value ? techSel.value : null;
  const sucSel = document.getElementById('venta-sucursal');
  const sucursal_id = sucSel && sucSel.value ? sucSel.value : null;

  if (client && !validarNombre(client, 'Cliente')) return;
  if (!detail) { showToast('Detalle es obligatorio', 'error'); return; }
  if (!validarMonto(montoRaw, 'Monto', false)) return;

  try {
    await VentasAPI.create({
      client: client || null,
      detail,
      monto,
      pago,
      tecnico_id,
      sucursal_id,
    });
    ['venta-cliente', 'venta-detalle', 'venta-monto'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    await loadVentas();
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof renderReportesCompletos === 'function') renderReportesCompletos();
    showToast('✓ Venta registrada');
  } catch (e) {
    showToast(e.message || 'Error al registrar venta', 'error');
  }

  } finally {
    _locks['venta'] = false;
    if (__btn_venta) {
      __btn_venta.disabled = false;
      __btn_venta.textContent = __old_venta || __btn_venta.textContent;
    }
  }
}

// ---------- clientes / recibos / users / report ----------
function esSuperAdmin() {
  return currentUser && (
    currentUser.rolRaw === 'superadmin' ||
    (currentUser.rol || '').toLowerCase().includes('super')
  );
}

function renderClientes(data) {
  const el = document.getElementById('clientes-body');
  if (!el) return;
  const sa = esSuperAdmin();
  const puedeEditar = (typeof esAdminOSuper === 'function' && esAdminOSuper()) || sa;
  el.innerHTML = (data || [])
    .map(function (c) {
      const estado = c.active
        ? '<span class="badge badge-green">Activo</span>'
        : '<span class="badge badge-red">Inactivo</span>';
      const cuenta = c.tieneCuenta
        ? '<span style="font-size:11px;color:var(--gray-400)">' + (c.username || 'con cuenta') + '</span>'
        : '<span style="font-size:11px;color:var(--gray-500)">Sin cuenta app</span>';
      let acciones = '<span style="color:var(--gray-400);font-size:12px">—</span>';
      if (puedeEditar) {
        acciones = '<button class="btn-sm" onclick="abrirEditarCliente(' + c.dbId + ')">Editar</button> ';
        acciones += '<button class="btn-sm btn-sm-primary" onclick="crearCuentaAppCliente(' + c.dbId + ')" title="Usuario + clave 1234">' +
          (c.tieneCuenta ? 'Reset clave' : 'Cuenta app') + '</button> ';
        acciones += '<button class="btn-sm" onclick="toggleClienteActivo(' + c.dbId + ',' + (c.active ? 'false' : 'true') + ')">' +
          (c.active ? 'Inactivar' : 'Activar') + '</button>';
        if (sa) {
          acciones += ' <button class="btn-sm btn-sm-danger" onclick="eliminarCliente(' + c.dbId + ')" style="color:#fff;background:var(--danger,#dc2626)">Eliminar</button>';
        }
      }
      return '<tr style="' + (c.active ? '' : 'opacity:0.65') + '">' +
        '<td><code class="code-tag">' + c.id + '</code></td>' +
        '<td>' + c.name + '<div>' + cuenta + '</div></td>' +
        '<td>' + c.phone + '</td>' +
        '<td>' + c.visits + '</td>' +
        '<td>' + c.lastVisit + '</td>' +
        '<td>' + (c.branch || '—') + '</td>' +
        '<td>' + estado + '</td>' +
        '<td style="white-space:nowrap">' + acciones + '</td>' +
      '</tr>';
    })
    .join('');
}

function abrirEditarCliente(dbId) {
  if (!(esSuperAdmin() || (typeof esAdminOSuper === 'function' && esAdminOSuper()))) {
    showToast('Solo Admin / Super Admin pueden editar clientes', 'error');
    return;
  }
  const c = (clientesData || []).find(function (x) { return String(x.dbId) === String(dbId); });
  if (!c) return;
  document.getElementById('edit-cli-id').value = c.dbId;
  document.getElementById('edit-cli-name').value = c.name || '';
  document.getElementById('edit-cli-phone').value = c.phone || '';
  const sel = document.getElementById('edit-cli-branch');
  if (sel && typeof poblarSelectSucursal === 'function') {
    poblarSelectSucursal(sel);
    sel.value = c.sucursal_id != null ? String(c.sucursal_id) : '';
  }
  openModal('editar-cliente');
}

async function guardarEdicionCliente() {
  if (_locks['cliente_edit']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['cliente_edit'] = true;
  const __btn_cliente_edit = document.querySelector('[onclick="guardarEdicionCliente()"]');
  let __old_cliente_edit = '';
  if (__btn_cliente_edit) {
    __btn_cliente_edit.disabled = true;
    __old_cliente_edit = __btn_cliente_edit.textContent;
    __btn_cliente_edit.textContent = 'Guardando…';
  }
  try {

  if (!(esSuperAdmin() || (typeof esAdminOSuper === 'function' && esAdminOSuper()))) {
    showToast('Solo Admin / Super Admin pueden editar clientes', 'error');
    return;
  }
  const id = document.getElementById('edit-cli-id')?.value;
  const name = document.getElementById('edit-cli-name')?.value.trim() || '';
  const phone = document.getElementById('edit-cli-phone')?.value.trim() || '';
  const sucursal_id = document.getElementById('edit-cli-branch')?.value || null;
  if (!id) return;
  if (!validarNombre(name, 'Nombre del cliente')) return;
  if (!validarTelefono(phone, true)) return;

  // anti-duplicado teléfono (otro cliente)
  const phoneLimpio = limpiarTelefono(phone);
  const otro = (clientesData || []).find(function (c) {
    return String(c.dbId) !== String(id) && limpiarTelefono(String(c.phone || '')) === phoneLimpio;
  });
  if (otro) {
    showToast('Ese teléfono ya pertenece a ' + otro.name + ' (' + otro.id + ')', 'error');
    return;
  }

  try {
    await ClientesAPI.update(id, { name, phone: phoneLimpio, sucursal_id: sucursal_id || null });
    closeModal();
    await loadClientes();
    showToast('✓ Cliente actualizado');
  } catch (e) {
    showToast(e.message || 'No se pudo actualizar', 'error');
  }

  } finally {
    _locks['cliente_edit'] = false;
    if (__btn_cliente_edit) {
      __btn_cliente_edit.disabled = false;
      __btn_cliente_edit.textContent = __old_cliente_edit || __btn_cliente_edit.textContent;
    }
  }
}

async function eliminarCliente(dbId) {
  if (!esSuperAdmin()) {
    showToast('Solo el Super Admin puede eliminar clientes', 'error');
    return;
  }
  const c = (clientesData || []).find(function (x) { return String(x.dbId) === String(dbId); });
  const label = c ? (c.name + ' (' + c.id + ')') : ('#' + dbId);
  if (!confirm('¿Eliminar al cliente ' + label + '?\nEsta acción no se puede deshacer.')) return;
  try {
    await ClientesAPI.destroy(dbId);
    await loadClientes();
    showToast('✓ Cliente eliminado');
  } catch (e) {
    showToast(e.message || 'No se pudo eliminar', 'error');
  }
}

async function crearCuentaAppCliente(dbId) {
  if (!(esSuperAdmin() || (typeof esAdminOSuper === 'function' && esAdminOSuper()))) {
    showToast('Solo Admin / Super Admin', 'error');
    return;
  }
  const c = (clientesData || []).find(function (x) { return String(x.dbId) === String(dbId); });
  if (!c) return;
  const ok = confirm(
    (c.tieneCuenta
      ? '¿Resetear la clave de app de ' + c.name + ' a 1234?'
      : '¿Crear cuenta de app para ' + c.name + '?\nUsuario automático + contraseña 1234')
  );
  if (!ok) return;
  try {
    const resp = await ClientesAPI.gestionarCuenta(dbId, { password: '1234' });
    await loadClientes();
    const u = resp.username || (resp.cliente && resp.cliente.username) || '';
    const p = resp.password_temporal || '1234';
    alert('Cuenta lista para la app Flutter:\n\nUsuario: ' + u + '\nContraseña: ' + p + '\n\nEntrégasela al cliente.');
    showToast('✓ Cuenta app: ' + u + ' / ' + p);
  } catch (e) {
    showToast(e.message || 'No se pudo crear la cuenta', 'error');
  }
}

async function toggleClienteActivo(dbId, active) {
  if (!(esSuperAdmin() || (typeof esAdminOSuper === 'function' && esAdminOSuper()))) {
    showToast('Solo Admin / Super Admin', 'error');
    return;
  }
  const c = (clientesData || []).find(function (x) { return String(x.dbId) === String(dbId); });
  const label = c ? c.name : ('#' + dbId);
  const on = active === true || active === 'true';
  if (!confirm((on ? '¿Activar ' : '¿Inactivar ') + label + '?\n' +
    (on ? 'Podrá entrar a la app Flutter.' : 'No podrá iniciar sesión en la app.'))) return;
  try {
    await ClientesAPI.toggleActivo(dbId, on);
    await loadClientes();
    showToast(on ? '✓ Cliente activado' : '✓ Cliente inactivado');
  } catch (e) {
    showToast(e.message || 'No se pudo cambiar el estado', 'error');
  }
}


function renderRecibosHistorial() {
  const el = document.getElementById('recibos-body');
  if (!el) return;
  const n = (recibosData || []).length;
  const countEl = document.getElementById('recibo-count');
  if (countEl) {
    countEl.textContent = n + ' recibo' + (n === 1 ? '' : 's');
  }
  if (!n) {
    el.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--gray-400);padding:24px">No se han generado recibos aún</td></tr>';
    return;
  }
  el.innerHTML = recibosData
    .map(
      (r) => {
        const ordenLabel = r.orden
          ? (String(r.orden).startsWith('#') ? r.orden : '#' + r.orden)
          : '—';
        return `<tr>
      <td><code class="code-tag">${r.numRecibo}</code></td>
      <td>${ordenLabel}</td><td>${r.cliente}</td><td>${r.servicio}</td>
      <td>Bs ${fmtMonto(r.monto)}</td><td>${r.pago}</td>
      <td>${r.techName}</td><td>${r.hora}</td>
      <td>
        <button class="btn-sm" onclick="mostrarVistaPreviaRecibo(${r.id})">Ver</button>
        <button class="btn-sm" onclick="abrirEditarRecibo(${r.id})">Editar</button>
      </td>
    </tr>`;
      }
    )
    .join('');
}

// ===== RECIBOS: generar uno nuevo =====

/** Al elegir una orden en el select, autocompleta los campos del formulario
 * (el backend ya NO autocompleta desde orden_id — hay que mandarle todo). */
function precargarRecibo(ordenId) {
  if (!ordenId) return;
  const o = ordersData.find((x) => x.id === parseInt(ordenId, 10));
  if (!o) return;

  document.getElementById('recibo-cliente').value = o.client || '';
  document.getElementById('recibo-telefono').value = o.phone || '';
  document.getElementById('recibo-equipo').value = o.device || '';
  document.getElementById('recibo-servicio').value = o.service || '';
  document.getElementById('recibo-monto').value = o.monto || '';
  const selSuc = document.getElementById('recibo-sucursal');
  if (selSuc) selSuc.value = o.sucursal_id ?? '';
}

async function generarRecibo() {
  if (_locks['recibo']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['recibo'] = true;
  const __btn_recibo = document.querySelector('[onclick="generarRecibo()"]');
  let __old_recibo = '';
  if (__btn_recibo) {
    __btn_recibo.disabled = true;
    __old_recibo = __btn_recibo.textContent;
    __btn_recibo.textContent = 'Guardando…';
  }
  try {

  const orden_id = document.getElementById('recibo-orden').value || null;
  const cliente = document.getElementById('recibo-cliente').value.trim();
  const telefono = document.getElementById('recibo-telefono').value.trim();

  if (!validarNombre(cliente, 'Cliente')) return;
  if (!validarTelefono(telefono, false)) return;
  const equipo = document.getElementById('recibo-equipo').value.trim();
  const servicio = document.getElementById('recibo-servicio').value.trim();
  const monto = parseFloat(document.getElementById('recibo-monto').value) || 0;
  const pago = document.getElementById('recibo-pago').value;
  const tecnico_id = document.getElementById('recibo-tech').value || null;
  const sucursal_id = document.getElementById('recibo-sucursal').value || null;
  const obs = document.getElementById('recibo-obs').value.trim();
  const tipo = document.getElementById('recibo-tipo')?.value || null;

  if (!cliente || !equipo || !servicio) {
    alert('Completa Cliente, Equipo y Servicio.');
    return;
  }
  if (monto <= 0) {
    alert('El monto debe ser mayor a 0.');
    return;
  }

  try {
    const recibo = await RecibosAPI.create({
      orden_id, cliente, telefono, equipo, servicio, monto, pago, sucursal_id, obs, tipo,
      tecnico_id,
    });
    await loadRecibos();
    await loadOrders(); // si venía de una orden, ya quedó "Listo"
    limpiarFormRecibo();
    showToast(`✓ Recibo ${recibo.num_recibo} generado`);
    mostrarVistaPreviaRecibo(recibo.id);
  } catch (e) {
    alert('No se pudo generar el recibo: ' + e.message);
  }

  } finally {
    _locks['recibo'] = false;
    if (__btn_recibo) {
      __btn_recibo.disabled = false;
      __btn_recibo.textContent = __old_recibo || __btn_recibo.textContent;
    }
  }
}

function limpiarFormRecibo() {
  ['recibo-orden', 'recibo-num', 'recibo-cliente', 'recibo-telefono', 'recibo-equipo',
   'recibo-servicio', 'recibo-monto', 'recibo-obs'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ===== NUEVO CLIENTE =====
async function guardarCliente() {
  if (_locks['cliente']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['cliente'] = true;
  const __btn_cliente = document.querySelector('[onclick="guardarCliente()"]');
  let __old_cliente = '';
  if (__btn_cliente) {
    __btn_cliente.disabled = true;
    __old_cliente = __btn_cliente.textContent;
    __btn_cliente.textContent = 'Guardando…';
  }
  try {

  const name = document.getElementById('new-cli-name').value.trim();
  const phone = document.getElementById('new-cli-phone').value.trim();
  const sucursal_id = document.getElementById('new-cli-branch').value || null;

  if (!validarNombre(name, 'Nombre del cliente')) return;
  if (!validarTelefono(phone, true)) return;

  const phoneLimpio = limpiarTelefono(phone);

  // Anti-duplicado local (mismo teléfono)
  const existente = (clientesData || []).find(function (c) {
    return limpiarTelefono(String(c.phone || '')) === phoneLimpio;
  });
  if (existente) {
    showToast(
      'Este cliente ya está registrado: ' + existente.name + ' (' + existente.id + ') · Tel. ' + existente.phone,
      'error'
    );
    // NO filtrar la lista (eso hacía que “desaparecieran” los demás)
    // Solo recargar todos para no dejar la tabla a medias
    try { await loadClientes(); } catch (_) {}
    return;
  }

  try {
    const cliente = await ClientesAPI.create({ name, phone: phoneLimpio, sucursal_id });
    document.getElementById('new-cli-name').value = '';
    document.getElementById('new-cli-phone').value = '';
    closeModal();
    await loadClientes();
    showToast('✓ Cliente "' + cliente.name + '" registrado (' + (cliente.code || '') + ')');
  } catch (e) {
    const msg = e.message || 'Error al registrar cliente';
    showToast(msg, 'error');
    // Recargar lista completa (sin filtro) para no ocultar clientes
    try { await loadClientes(); } catch (_) {}
  }

  } finally {
    _locks['cliente'] = false;
    if (__btn_cliente) {
      __btn_cliente.disabled = false;
      __btn_cliente.textContent = __old_cliente || __btn_cliente.textContent;
    }
  }
}

function populateReciboOrden() {
  const sel = document.getElementById('recibo-orden');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">Selecciona una orden...</option>' +
    ordersData
      .filter((o) => o.monto > 0)
      .map((o) => `<option value="${o.id}">${o.code} — ${o.client}</option>`)
      .join('');
}

function renderUsers() {
  const el = document.getElementById('usuarios-body');
  if (!el) return;
  el.innerHTML = tecnicos
    .map(
      (t) => `<tr>
      <td><code class="code-tag">${t.code}</code></td>
      <td>${t.name}</td><td>${t.user}</td><td>${t.rol}</td>
      <td>${t.branch || '—'}</td>
      <td>${t.active ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
    </tr>`
    )
    .join('');
}

function renderReportTech() {
  const list = window._reporteTecnicos || [];
  const el = document.getElementById('report-tech-body');
  if (!el) return;
  el.innerHTML = list
    .map(
      (t) => `<tr>
      <td><code class="code-tag">${t.code}</code></td>
      <td>${t.name}</td><td>${t.ordenes_completadas}</td>
      <td>Bs ${fmtMonto(t.ingresos)}</td><td>${t.branch || '—'}</td>
    </tr>`
    )
    .join('');
}

// ---------- modals ----------
function openModal(tipo) {
  document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
  const map = {
    orden: 'modal',
    'editar-orden': 'modal-editar-orden',
    venta: 'modal-venta',
    cliente: 'modal-cliente',
    'editar-cliente': 'modal-editar-cliente',
    'recibo-manual': 'modal-recibo',
    'estado-orden': 'modal-estado',
    'editar-recibo': 'modal-editar-recibo',
    'editar-repuesto': 'modal-editar-repuesto',
    'ajuste-stock': 'modal-ajuste-stock',
    repuesto: 'modal-repuesto',
    'historial-add': 'modal-historial-add',
  };
  const id = map[tipo] || tipo;
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) closeModal();
});

// ---------- sesión al cargar ----------
async function tryRestoreSession() {
  const token = getToken();
  if (!token) return false;
  try {
    const me = await AuthAPI.me();
    currentUser = normalizeUser(me);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    applyUserSession();
    await initApp();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Al refrescar SIEMPRE vuelve al login (no restaura sesión)
  clearSession();
  currentUser = null;
  const app = document.getElementById('app');
  const login = document.getElementById('login-screen');
  if (app) app.classList.add('hidden');
  if (login) login.classList.remove('hidden');
});




// ==========================================
// FILTRO DE REPORTES (botones Generar / Exportar)
// ==========================================
function generarReporte() {
  const desde = document.getElementById('reporte-desde')?.value || '';
  const hasta = document.getElementById('reporte-hasta')?.value || '';
  if (desde && hasta && desde > hasta) {
    showToast('La fecha "Desde" no puede ser mayor que "Hasta"', 'error');
    return;
  }
  if (typeof renderReportesCompletos === 'function') {
    renderReportesCompletos(desde || null, hasta || null);
  }
  showToast('✓ Reporte generado' + (desde || hasta ? ' (filtrado por fechas)' : ' (todos los datos)'));
}

function exportarReportePDF() {
  // Impresión limpia del panel de reportes
  const panel = document.getElementById('panel-reportes');
  if (!panel) { showToast('No se encontró el panel de reportes', 'error'); return; }
  const win = window.open('', '_blank');
  if (!win) { showToast('Permite ventanas emergentes para exportar', 'error'); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>Reporte MiCel</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:20px;margin:0 0 8px} h2{font-size:14px;margin:18px 0 8px;color:#333}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f3f4f6}
      .metric{display:inline-block;margin:8px 16px 8px 0;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px}
      .metric b{display:block;font-size:18px}
      @media print{button{display:none}}
    </style></head><body>
    <h1>MiCel — Reporte operativo</h1>
    <p style="color:#666;font-size:12px">Generado: ${new Date().toLocaleString('es-BO')}</p>
    ${panel.innerHTML}
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  win.document.close();
  showToast('✓ Listo para imprimir / guardar PDF');
}

// ==========================================




// ---- Amnesis: múltiples fotos (biblioteca de reparaciones) ----
window._haFiles = []; // File[] pendientes de subir

function previewHistorialImgs(event) {
  const input = event.target;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const max = 12;
  const combined = (window._haFiles || []).concat(files);
  if (combined.length > max) {
    showToast('Máximo ' + max + ' fotos por entrada', 'error');
    window._haFiles = combined.slice(0, max);
  } else {
    window._haFiles = combined;
  }
  _renderHaPreviewGallery();
  // permitir volver a elegir los mismos archivos
  input.value = '';
}

function previewHistorialImg(event) {
  // compatibilidad con el handler viejo de extensions
  previewHistorialImgs(event);
}

function _renderHaPreviewGallery() {
  const gal = document.getElementById('ha-preview-gallery');
  const cnt = document.getElementById('ha-preview-count');
  if (!gal) return;
  const files = window._haFiles || [];
  gal.innerHTML = files.map(function(f, i) {
    const url = URL.createObjectURL(f);
    return '<div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid var(--gray-200)">' +
      '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover" alt="">' +
      '<button type="button" onclick="quitarHaFoto(' + i + ')" title="Quitar" style="position:absolute;top:2px;right:2px;background:#dc2626;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1">×</button>' +
    '</div>';
  }).join('');
  if (cnt) cnt.textContent = files.length ? (files.length + ' foto' + (files.length > 1 ? 's' : '') + ' seleccionada' + (files.length > 1 ? 's' : '')) : '';
}

function quitarHaFoto(index) {
  window._haFiles = (window._haFiles || []).filter(function(_, i) { return i !== index; });
  _renderHaPreviewGallery();
}

function limpiarHaFotos() {
  window._haFiles = [];
  _renderHaPreviewGallery();
  const input = document.getElementById('ha-file-input');
  if (input) input.value = '';
}

// =====================================================================
// MiCel AMNESIS — Historial real (API /historial)
// Sobrescribe el mock de extensions.js
// =====================================================================
const HistorialAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/historial' + (q ? '?' + q : ''));
  },
  create: async (body, fotoFiles) => {
    // body: { equipo, descripcion } — fotoFiles: File | File[] | null
    const files = !fotoFiles ? [] : (Array.isArray(fotoFiles) ? fotoFiles : [fotoFiles]);
    const fd = new FormData();
    fd.append('equipo', body.equipo);
    if (body.descripcion) fd.append('descripcion', body.descripcion);

    files.forEach(function(f, i) {
      // Laravel espera array "fotos" (fotos[0], fotos[1]...)
      fd.append('fotos[' + i + ']', f, f.name || ('foto_' + i + '.jpg'));
    });
    if (files[0]) fd.append('foto', files[0], files[0].name || 'foto.jpg');

    const headers = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    // NO poner Content-Type: el browser pone multipart boundary

    const res = await fetch(API_BASE + '/historial', { method: 'POST', headers, body: fd });
    if (res.status === 401) { clearSession(); window.location.reload(); throw new Error('Sesión expirada'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = data.message || data.error || ('Error ' + res.status);
      if (data.errors && typeof data.errors === 'object') {
        msg = Object.values(data.errors).flat().join(' · ');
      }
      // pistas frecuentes
      if (String(msg).toLowerCase().includes('fotos') || res.status === 500) {
        msg += ' — ¿Corriste php artisan migrate y storage:link?';
      }
      throw new Error(msg);
    }
    return data;
  },
};

function normalizeHistorial(h) {
  const tech = h.tecnico || {};
  const fecha = h.created_at ? new Date(h.created_at) : null;
  const base = API_BASE.replace(/\/api$/, '');
  function toUrl(p) {
    if (!p) return null;
    if (String(p).startsWith('http') || String(p).startsWith('data:')) return p;
    return base + '/storage/' + p;
  }
  let fotosUrl = Array.isArray(h.fotos_url) ? h.fotos_url.filter(Boolean) : [];
  if (!fotosUrl.length && Array.isArray(h.fotos)) {
    fotosUrl = h.fotos.map(toUrl).filter(Boolean);
  }
  if (!fotosUrl.length && h.foto_url) fotosUrl = [h.foto_url];
  if (!fotosUrl.length && h.foto_path) fotosUrl = [toUrl(h.foto_path)].filter(Boolean);
  return {
    id: 'H-' + h.id,
    dbId: h.id,
    titulo: h.equipo || 'Reparación',
    cliente: '',
    equipo: h.equipo || '—',
    servicio: '',
    techCode: tech.code || '',
    techName: tech.name || '—',
    branch: tech.sucursal || '',
    desc: h.descripcion || '',
    foto: fotosUrl[0] || null,
    fotos: fotosUrl,
    fecha: fecha ? fecha.toLocaleDateString('es-BO') : '—',
    hora: fecha ? fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '',
    qrData: h.qr_data || String(h.id),
    rol: tech.rol ? mapRol(tech.rol) : (tech.code ? 'Técnico' : '—'),
  };
}

async function loadHistorial() {
  try {
    const list = await HistorialAPI.list();
    window.historialData = (list || []).map(normalizeHistorial);
    // también variable libre de extensions
    if (typeof historialData !== 'undefined') {
      try { historialData.length = 0; historialData.push(...window.historialData); } catch (_) {}
    }
    if (typeof renderHistorial === 'function') renderHistorial();
  } catch (e) {
    console.error('Historial:', e);
    window.historialData = window.historialData || [];
  }
}

/** Guarda entrada real en la API (reemplaza el mock de extensions) */
async function guardarHistorialEntry() {
  if (_locks['historial']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['historial'] = true;
  const __btn_historial = document.querySelector('[onclick*="guardarHistorial"]');
  let __old_historial = '';
  if (__btn_historial) {
    __btn_historial.disabled = true;
    __old_historial = __btn_historial.textContent;
    __btn_historial.textContent = 'Guardando…';
  }
  try {

  const titulo   = document.getElementById('ha-titulo')?.value.trim() || '';
  const cliente  = document.getElementById('ha-cliente')?.value.trim() || '';
  const equipo   = document.getElementById('ha-equipo')?.value.trim() || '';
  const servicio = document.getElementById('ha-servicio')?.value.trim() || '';
  const desc     = document.getElementById('ha-desc')?.value.trim() || '';
  const imgData  = document.getElementById('ha-img-data')?.value || '';

  const equipoFinal = equipo || titulo;
  if (!equipoFinal) {
    showToast('Equipo / título es obligatorio', 'error');
    return;
  }
  if (cliente && !validarNombre(cliente, 'Cliente')) return;

  const partes = [];
  if (titulo && titulo !== equipoFinal) partes.push('Título: ' + titulo);
  if (cliente) partes.push('Cliente: ' + cliente);
  if (servicio) partes.push('Servicio: ' + servicio);
  if (desc) partes.push(desc);
  const descripcion = partes.join(' | ') || null;

  let fotoFiles = (window._haFiles || []).slice();
  // compat: si quedó una sola en ha-img-data (extensions viejo)
  if (!fotoFiles.length && imgData && imgData.startsWith('data:')) {
    try {
      const blob = await (await fetch(imgData)).blob();
      fotoFiles = [new File([blob], 'historial.jpg', { type: blob.type || 'image/jpeg' })];
    } catch (_) {}
  }

  if (!fotoFiles.length) {
    const ok = confirm('No seleccionaste fotos. ¿Guardar la entrada igual sin imágenes?');
    if (!ok) return;
  }

  try {
    showToast('Guardando entrada...', 'info');
    await HistorialAPI.create({ equipo: equipoFinal, descripcion }, fotoFiles);
    closeModal();
    await loadHistorial();
    showToast('✓ Entrada guardada' + (fotoFiles.length ? ' con ' + fotoFiles.length + ' foto(s)' : ''));
    ['ha-titulo','ha-cliente','ha-equipo','ha-servicio','ha-desc'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    if (typeof limpiarHaFotos === 'function') limpiarHaFotos();
  } catch (e) {
    console.error('Amnesis save error:', e);
    showToast(e.message || 'Error al guardar historial', 'error');
  }

  } finally {
    _locks['historial'] = false;
    if (__btn_historial) {
      __btn_historial.disabled = false;
      __btn_historial.textContent = __old_historial || __btn_historial.textContent;
    }
  }
}

// Reemplaza renderHistorial del mock para mostrar rol del técnico
function renderHistorial() {
  const grid  = document.getElementById('historial-grid');
  const empty = document.getElementById('historial-empty');
  if (!grid) return;

  const data = (typeof historialData !== 'undefined' && historialData.length)
    ? historialData
    : (window.historialData || []);

  const q      = (document.getElementById('historial-search')?.value || '').toLowerCase();
  const branch = document.getElementById('historial-filter-branch')?.value || '';

  const filtered = data.filter(h => {
    const matchQ = !q ||
      (h.titulo || '').toLowerCase().includes(q) ||
      (h.cliente || '').toLowerCase().includes(q) ||
      (h.equipo || '').toLowerCase().includes(q) ||
      (h.techName || '').toLowerCase().includes(q) ||
      (h.desc || '').toLowerCase().includes(q);
    const matchB = !branch || String(h.branch) === String(branch) ||
      (window._sucursales || []).some(s => String(s.id) === String(branch) && s.nombre === h.branch);
    return matchQ && matchB;
  });

  if (!filtered.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = filtered.map(h => {
    const fotos = (h.fotos && h.fotos.length) ? h.fotos : (h.foto ? [h.foto] : []);
    const imgHtml = fotos.length
      ? '<div style="position:relative;width:100%;height:100%">' +
          '<img src="' + fotos[0] + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;cursor:pointer" onclick="verGaleriaHistorial(' + h.dbId + ')">' +
          (fotos.length > 1
            ? '<span style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:2px 8px;border-radius:999px">+' + (fotos.length - 1) + ' fotos</span>'
            : '') +
        '</div>'
      : '<div class="historial-img-placeholder">🔧</div>';
    const techLabel = h.techName
      ? (h.techName + (h.rol ? ' · ' + h.rol : '') + (h.techCode ? ' (' + h.techCode + ')' : ''))
      : '—';
    return '<div class="historial-card">' +
      '<div class="historial-img-wrap">' + imgHtml + '</div>' +
      '<div class="historial-card-body">' +
        '<div class="historial-card-title">' + (h.titulo || h.equipo) + '</div>' +
        '<div class="historial-card-meta">' +
          '<span>' + (h.fecha || '') + (h.hora ? ' · ' + h.hora : '') + '</span>' +
          '<span>' + techLabel + '</span>' +
        '</div>' +
        (h.desc ? '<div class="historial-card-desc">' + h.desc + '</div>' : '') +
      '</div>' +
      '<div class="historial-card-footer">' +
        '<button class="btn-sm btn-sm-primary" onclick="mostrarQRDesdeHistorial(\'' + String(h.dbId || h.id).replace(/'/g, '') + '\')">QR</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function filterHistorial(q) {
  renderHistorial();
}

function mostrarQRDesdeHistorial(id) {
  const data = (typeof historialData !== 'undefined' && historialData.length)
    ? historialData
    : (window.historialData || []);
  const h = data.find(x => String(x.dbId) === String(id) || String(x.id) === String(id));
  if (!h) { showToast('Entrada no encontrada', 'error'); return; }
  if (typeof mostrarQR === 'function') {
    mostrarQR({
      titulo: h.titulo || h.equipo,
      id: h.id,
      fecha: h.fecha,
      branch: h.branch || h.techName || '',
      qrData: h.qrData,
    });
  }
}


// DASHBOARD 100% REAL
// ==========================================
function updateDashboard() {
  const activas = (ordersData || []).filter(o => o.statusRaw !== 'listo').length;
  const hoy = new Date().toLocaleDateString('es-BO');
  const ingresaronHoy = (ordersData || []).filter(o => o.date === hoy).length;

  const ingresosOrdenes = (ordersData || [])
    .filter(o => o.statusRaw === 'listo')
    .reduce((s, o) => s + (parseFloat(o.monto) || 0), 0);
  const ingresosVentas = (ventasHoy || []).reduce((s, v) => s + (parseFloat(v.monto) || 0), 0);
  const ingresosCel = (celularesData || []).reduce((s, v) => s + (parseFloat(v.venta) || 0), 0);
  const ingresosMes = ingresosOrdenes + ingresosVentas + ingresosCel;

  const criticos = (stockData || []).filter(s => s.qty <= s.min);
  const stockCritico = criticos.length;
  const clientesAtendidos = new Set((ordersData || []).map(o => o.client)).size;

  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setTxt('dash-m-activas', String(activas));
  setTxt('dash-m-activas-trend', '↑ ' + ingresaronHoy + ' ingresaron hoy · clic para ver');
  setTxt('dash-m-ingresos', 'Bs ' + fmtMonto(ingresosMes));
  setTxt('dash-m-ingresos-trend', 'Listos + ventas · clic reportes');
  setTxt('dash-m-stock', String(stockCritico));
  setTxt('dash-m-stock-trend', stockCritico ? 'bajo mínimo · clic para ver' : 'todo OK · ir a stock');
  const stockVal = document.getElementById('dash-m-stock');
  if (stockVal) stockVal.classList.toggle('danger', stockCritico > 0);
  setTxt('dash-m-clientes', String(clientesAtendidos));
  setTxt('dash-m-clientes-trend', 'con órdenes · clic para ver');

  const alertsBox = document.getElementById('dash-alerts') || document.querySelector('#panel-dashboard .alerts');
  if (alertsBox) {
    let html = '';
    if (criticos.length) {
      const lista = criticos.slice(0, 5).map(s => s.name + ' (' + s.qty + ')').join(' · ');
      html += '<div class="alert alert-warn alert-click" role="button" onclick="dashGo(\'stock\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '<span><strong>Stock crítico:</strong> ' + lista + ' <em style="opacity:.8">(clic → Stock)</em></span></div>';
    }
    const listos = (ordersData || []).filter(o => o.statusRaw === 'listo').length;
    if (listos) {
      html += '<div class="alert alert-info alert-click" role="button" onclick="dashGo(\'ordenes\')">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<span>' + listos + ' órdenes listos para entrega <em style="opacity:.8">(clic → Órdenes)</em></span></div>';
    }
    if (!html) {
      html = '<div class="alert alert-info">Todo en orden ✓ — usa los accesos rápidos o las tarjetas de arriba</div>';
    }
    alertsBox.innerHTML = html;
  }

  if (typeof renderDashOrders === 'function') renderDashOrders();
}

/** Navega desde el dashboard a un módulo (activa el item del menú correcto) */
function dashGo(panelId) {
  const items = document.querySelectorAll('.nav-item');
  let target = null;
  items.forEach((n) => {
    const oc = n.getAttribute('onclick') || '';
    if (oc.includes("'" + panelId + "'") || oc.includes('"' + panelId + '"')) target = n;
  });
  if (typeof nav === 'function') nav(panelId, target);
  else {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    const p = document.getElementById('panel-' + panelId);
    if (p) p.classList.add('active');
  }
}



// ==========================================
// REPORTES 100% REALES (ingresos + servicios + técnicos)
// ==========================================
function renderReportesCompletos(desde, hasta) {
  function enRango(fechaStr) {
    if (!desde && !hasta) return true;
    if (!fechaStr || fechaStr === '—') return !desde && !hasta;
    let d = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) d = fechaStr.slice(0, 10);
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaStr)) {
      const p = fechaStr.split('/');
      d = p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
    }
    if (!d) return true;
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  }

  // Solo órdenes LISTAS cuentan como ingreso realizado
  const ordenesFiltradas = ordersData.filter(o => o.statusRaw === 'listo' && enRango(o.date));
  const todasOrdenesRango = ordersData.filter(o => enRango(o.date));
  const celFiltradas = (celularesData || []).filter(v => enRango(v.fecha));
  const ventasFiltradas = (ventasHoy || []); // del día (API no trae fecha completa aquí)

  // GANANCIA NETA:
  // - Celulares: venta - compra (margen real)
  // - Servicios/ventas: el monto cobrado (no hay costo de repuesto registrado → se toma como neto operativo)
  const gananciaCel = celFiltradas.reduce((s, v) => s + (parseFloat(v.ganancia) || 0), 0);
  const ingresosServicios = ordenesFiltradas.reduce((s, o) => s + (parseFloat(o.monto) || 0), 0);
  const ingresosVentasRapidas = ventasFiltradas.reduce((s, v) => s + (parseFloat(v.monto) || 0), 0);
  const gananciaNeta = gananciaCel + ingresosServicios + ingresosVentasRapidas;

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('rep-metric-servicios', String(ordenesFiltradas.length));
  setTxt('rep-metric-servicios-trend', todasOrdenesRango.length + ' órdenes en el rango');

  setTxt('rep-metric-ganancia', (gananciaNeta < 0 ? '− ' : '') + 'Bs ' + fmtMonto(Math.abs(gananciaNeta)));
  setTxt('rep-metric-ganancia-trend', 'Cel Bs ' + fmtMonto(gananciaCel) + ' · Serv Bs ' + fmtMonto(ingresosServicios + ingresosVentasRapidas));
  const ganEl = document.getElementById('rep-metric-ganancia');
  if (ganEl) ganEl.style.color = gananciaNeta >= 0 ? '' : 'var(--danger)';

  const ticket = ordenesFiltradas.length
    ? (ingresosServicios / ordenesFiltradas.length)
    : 0;
  setTxt('rep-metric-ticket', 'Bs ' + fmtMonto(ticket));
  setTxt('rep-metric-ticket-trend', ordenesFiltradas.length ? 'promedio por servicio listo' : 'sin servicios listos');

  const tasa = todasOrdenesRango.length
    ? Math.round((ordenesFiltradas.length / todasOrdenesRango.length) * 100)
    : 0;
  setTxt('rep-metric-cierre', tasa + '%');
  setTxt('rep-metric-cierre-trend', ordenesFiltradas.length + ' listas de ' + todasOrdenesRango.length + ' totales');

  // ---- Servicios más frecuentes (sobre TODAS las órdenes del rango, no solo listo) ----
  const contador = {};
  todasOrdenesRango.forEach(o => {
    const s = (o.service || 'Otro').trim();
    if (!contador[s]) contador[s] = { cant: 0, ingresos: 0 };
    contador[s].cant++;
    // ingresos solo de las que están listas / con monto
    if (o.statusRaw === 'listo' || (parseFloat(o.monto) || 0) > 0) {
      contador[s].ingresos += parseFloat(o.monto) || 0;
    }
  });
  const serviciosOrdenados = Object.entries(contador)
    .sort((a, b) => b[1].cant - a[1].cant)
    .slice(0, 10);
  const maxCant = (serviciosOrdenados[0] && serviciosOrdenados[0][1].cant) || 1;

  const tbodyServ = document.getElementById('report-servicios-body');
  if (tbodyServ) {
    tbodyServ.innerHTML = serviciosOrdenados.length
      ? serviciosOrdenados.map(function(pair) {
          var nombre = pair[0], d = pair[1];
          var pct = Math.round((d.cant / maxCant) * 100);
          return '<tr>' +
            '<td>' + nombre + '</td>' +
            '<td>' + d.cant + '</td>' +
            '<td>Bs ' + fmtMonto(d.ingresos) + '</td>' +
            '<td><div class="bar-wrap"><div class="bar-fill" style="width:' + pct + '%"></div><span>' + pct + '%</span></div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--gray-400)">Sin servicios en el rango</td></tr>';
  }

  // ---- Rendimiento por técnico (órdenes listo + rol) ----
  const tbodyTech = document.getElementById('report-tech-body');
  if (tbodyTech) {
    const porTech = {};
    // base: API reporte
    (window._reporteTecnicos || []).forEach(t => {
      porTech[t.code || t.name] = {
        code: t.code || '—',
        name: t.name || '—',
        ordenes: t.ordenes_completadas || 0,
        ingresos: parseFloat(t.ingresos) || 0,
        comision: parseFloat(t.comision) || 0,
        branch: t.branch || t.sucursal || '—',
        rol: 'Técnico',
      };
    });
    // si hay filtro de fechas, recalcular desde órdenes
    if (desde || hasta) {
      Object.keys(porTech).forEach(k => { porTech[k].ordenes = 0; porTech[k].ingresos = 0; });
      ordenesFiltradas.forEach(o => {
        const key = o.techCode || o.techName || '—';
        if (!porTech[key]) {
          porTech[key] = { code: o.techCode || '—', name: o.techName || '—', ordenes: 0, ingresos: 0, comision: 0, branch: o.branch || '—', rol: 'Técnico' };
        }
        porTech[key].ordenes++;
        porTech[key].ingresos += parseFloat(o.monto) || 0;
      });
    }
    // enriquecer con rol real de usuarios
    (tecnicos || []).forEach(t => {
      const key = t.code;
      if (porTech[key]) porTech[key].rol = t.rol || mapRol(t.rolRaw) || 'Técnico';
    });

    const lista = Object.values(porTech).sort((a, b) => b.ordenes - a.ordenes);
    tbodyTech.innerHTML = lista.length
      ? lista.map(t => '<tr>' +
          '<td><code class="code-tag">' + t.code + '</code></td>' +
          '<td>' + t.name + ' <span class="badge badge-amber" style="font-size:10px">' + (t.rol || 'Técnico') + '</span></td>' +
          '<td>' + t.ordenes + '</td>' +
          '<td>Bs ' + fmtMonto(t.ingresos) + '</td>' +
          '<td>' + (t.branch || '—') + '</td>' +
        '</tr>').join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--gray-400)">Sin datos de técnicos</td></tr>';
  }

  // ---- Reporte por sucursal ----
  renderReporteSucursales(ordenesFiltradas, celFiltradas, ventasFiltradas);
}

function renderReporteSucursales(ordenesListas, celFiltradas, ventasFiltradas) {
  let box = document.getElementById('reporte-sucursales-wrap');
  if (!box) {
    const panel = document.getElementById('panel-reportes');
    if (!panel) return;
    box = document.createElement('div');
    box.className = 'card';
    box.id = 'reporte-sucursales-wrap';
    box.innerHTML = '<div class="card-header"><h3 class="card-title">Rendimiento por sucursal</h3></div>' +
      '<table class="table"><thead><tr><th>Sucursal</th><th>Órdenes listas</th><th>Ingresos servicios</th><th>Ganancia celulares</th><th>Ganancia neta</th></tr></thead>' +
      '<tbody id="report-sucursal-body"></tbody></table>';
    panel.appendChild(box);
  }
  const por = {};
  const ensure = (name) => {
    const n = name || 'Sin sucursal';
    if (!por[n]) por[n] = { ordenes: 0, serv: 0, cel: 0 };
    return por[n];
  };
  (ordenesListas || []).forEach(o => {
    const r = ensure(o.branch);
    r.ordenes++;
    r.serv += parseFloat(o.monto) || 0;
  });
  (celFiltradas || []).forEach(v => {
    const r = ensure(v.branch);
    r.cel += parseFloat(v.ganancia) || 0;
  });
  // ventas rápidas sin sucursal clara → "General"
  (ventasFiltradas || []).forEach(v => {
    const r = ensure('Ventas mostrador');
    r.serv += parseFloat(v.monto) || 0;
  });

  const tbody = document.getElementById('report-sucursal-body');
  if (!tbody) return;
  const rows = Object.entries(por).sort((a, b) => (b[1].serv + b[1].cel) - (a[1].serv + a[1].cel));
  tbody.innerHTML = rows.length
    ? rows.map(([nombre, d]) => {
        const neta = d.serv + d.cel;
        return '<tr>' +
          '<td>' + nombre + '</td>' +
          '<td>' + d.ordenes + '</td>' +
          '<td>Bs ' + fmtMonto(d.serv) + '</td>' +
          '<td style="color:' + (d.cel >= 0 ? 'var(--success)' : 'var(--danger)') + '">Bs ' + fmtMonto(d.cel) + '</td>' +
          '<td style="font-weight:600">Bs ' + fmtMonto(neta) + '</td>' +
        '</tr>';
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--gray-400)">Sin datos por sucursal</td></tr>';
}



// Re-bind Amnesis AFTER extensions.js (se carga después y pisa las funciones)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.guardarHistorialEntry = guardarHistorialEntry;
    window.guardarHistorialEntryApp = guardarHistorialEntry;
    window.renderHistorialReal = renderHistorial;
    window.renderHistorial = renderHistorial;
    window.filterHistorial = filterHistorial;
    window.mostrarQRDesdeHistorial = mostrarQRDesdeHistorial;
    window.previewHistorialImgs = previewHistorialImgs;
    window.previewHistorialImg = previewHistorialImg;
    window.quitarHaFoto = quitarHaFoto;
    window.verGaleriaHistorial = verGaleriaHistorial;
    if (typeof loadHistorial === 'function' && getToken()) {
      loadHistorial().catch(() => {});
    }
  }, 100);
});


// Bloquear stock modal técnico (extensions puede abrir modal grande de stock)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.abrirStockModal === 'function') {
      const _abrir = window.abrirStockModal;
      window.abrirStockModal = function() {
        if (!esAdminOSuper()) {
          showToast('Solo Admin / Super Admin pueden gestionar el stock', 'error');
          // Igual puede ver el panel de stock en solo lectura
          if (typeof nav === 'function') {
            const el = document.querySelector('.nav-item[onclick*="stock"]');
            nav('stock', el);
          }
          return;
        }
        return _abrir.apply(this, arguments);
      };
    }
  }, 150);
});


// =====================================================================
// PERFIL REAL: foto se guarda en servidor + SuperAdmin ve fotos de usuarios
// (pisa las funciones de extensions.js que solo guardaban base64 local)
// =====================================================================
function fotoUrlUsuario(u) {
  if (!u) return null;
  if (u.foto_url) return u.foto_url;
  if (u.foto_path) {
    if (String(u.foto_path).startsWith('http')) return u.foto_path;
    if (String(u.foto_path).startsWith('data:')) return u.foto_path;
    const base = (typeof API_BASE !== 'undefined' ? API_BASE : '').replace(/\/api$/, '');
    return base + '/storage/' + u.foto_path;
  }
  return null;
}

// Extender ProfileAPI con subida de foto (multipart)
if (typeof ProfileAPI !== 'undefined') {
  ProfileAPI.subirFoto = async function(file) {
    const fd = new FormData();
    fd.append('foto', file);
    const headers = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + '/perfil/foto', { method: 'POST', headers, body: fd });
    if (res.status === 401) { clearSession(); window.location.reload(); throw new Error('Sesión expirada'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || ('Error ' + res.status));
    return data;
  };
}

function setAvatarImg(container, url, initialsText) {
  if (!container) return;
  if (url) {
    container.style.overflow = 'hidden';
    container.style.padding = '0';
    let img = container.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block';
      container.innerHTML = '';
      container.appendChild(img);
    }
    img.src = url;
    img.style.display = 'block';
    const ini = container.querySelector('#sidebar-avatar-initials, #perfil-avatar-initials');
    if (ini) ini.style.display = 'none';
  } else {
    const text = initialsText || (currentUser ? initials(currentUser.name) : '--');
    if (container.id === 'sidebar-avatar') {
      container.innerHTML = '<span id="sidebar-avatar-initials">' + text + '</span>';
    }
  }
}

function updateSidebarAvatar() {
  if (!currentUser) return;
  const extra = (typeof perfilesExtra !== 'undefined' && perfilesExtra[currentUser.user]) || {};
  let url = fotoUrlUsuario(currentUser) || extra.foto || null;
  // cache-bust para que el navegador no muestre la imagen vieja
  if (url && !String(url).startsWith('data:') && url.indexOf('?') === -1) {
    url = url + '?t=' + Date.now();
  }
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (!sidebarAvatar) return;
  sidebarAvatar.style.overflow = 'hidden';
  sidebarAvatar.style.position = 'relative';
  if (url) {
    sidebarAvatar.innerHTML =
      '<img src="' + url + '" alt="" ' +
      'style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;position:absolute;inset:0">';
  } else {
    sidebarAvatar.innerHTML =
      '<span id="sidebar-avatar-initials" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">' +
      initials(currentUser.name) + '</span>';
  }
}

async function abrirPerfil() {
  if (!currentUser) return;

  // Cargar datos frescos del servidor (email, telefono, foto)
  try {
    if (typeof ProfileAPI !== 'undefined' && ProfileAPI.show) {
      const p = await ProfileAPI.show();
      currentUser = normalizeUser({ ...getStoredUser(), ...p });
      setSession(getToken(), { ...getStoredUser(), ...p });
    }
  } catch (e) {
    console.warn('No se pudo refrescar perfil:', e);
  }

  const extra = (typeof perfilesExtra !== 'undefined' && perfilesExtra[currentUser.user]) || {};
  const isSA = currentUser.rolRaw === 'superadmin';
  const isAdmin = currentUser.rolRaw === 'administrador' || isSA;

  const foto = fotoUrlUsuario(currentUser) || extra.foto;
  const avatarDisp = document.getElementById('perfil-avatar-display');
  const avatarIni = document.getElementById('perfil-avatar-initials');
  if (foto && avatarDisp) {
    let img = avatarDisp.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block';
      avatarDisp.insertBefore(img, avatarDisp.firstChild);
    }
    img.src = foto;
    img.style.display = 'block';
    if (avatarIni) avatarIni.style.display = 'none';
  } else if (avatarIni) {
    avatarIni.textContent = initials(currentUser.name);
    avatarIni.style.display = '';
    const img = avatarDisp && avatarDisp.querySelector('img');
    if (img) img.style.display = 'none';
  }

  updateSidebarAvatar();

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? ''; };
  setTxt('perfil-display-name', currentUser.name);
  setTxt('perfil-display-role', currentUser.rol);
  setVal('perfil-nombre', currentUser.name);

  // Email real del usuario (nunca el placeholder vacío)
  const emailReal = currentUser.email || extra.email || '';
  setVal('perfil-email', emailReal);
  setVal('perfil-telefono', currentUser.telefono || extra.telefono || '');
  setVal('perfil-pass-actual', '');
  setVal('perfil-pass-new', '');
  setVal('perfil-pass-confirm', '');

  const saBadge = document.getElementById('perfil-superadmin-badge');
  if (saBadge) saBadge.classList.toggle('hidden', !isSA);

  // Técnico: ve su correo pero no lo edita; Admin sí puede
  const emailInput = document.getElementById('perfil-email');
  if (emailInput) {
    emailInput.readOnly = !isAdmin;
    emailInput.style.opacity = isAdmin ? '1' : '0.75';
    emailInput.title = isAdmin ? '' : 'Solo un administrador puede cambiar el correo';
  }
  const hint = document.querySelector('#perfil-email-group span');
  if (hint) {
    hint.textContent = isAdmin
      ? 'Puedes actualizar tu correo'
      : (emailReal ? 'Tu correo registrado (solo admin puede cambiarlo)' : 'Sin correo — pide a un admin que te asigne uno');
  }

  const saUserGroup = document.getElementById('perfil-sa-user-group');
  const saRolGroup = document.getElementById('perfil-sa-rol-group');
  if (saUserGroup) saUserGroup.style.display = isSA ? '' : 'none';
  if (saRolGroup) saRolGroup.style.display = isSA ? '' : 'none';

  document.getElementById('modal-perfil')?.classList.remove('hidden');
}

async function cambiarFotoPerfil(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Selecciona una imagen válida (JPG, PNG, WebP)', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('La foto no debe superar 5 MB', 'error');
    return;
  }

  // Preview inmediato
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;
    if (typeof perfilesExtra !== 'undefined') {
      if (!perfilesExtra[currentUser.user]) perfilesExtra[currentUser.user] = {};
      perfilesExtra[currentUser.user].foto = data;
    }
    const avatarDisp = document.getElementById('perfil-avatar-display');
    const avatarIni = document.getElementById('perfil-avatar-initials');
    if (avatarDisp) {
      let img = avatarDisp.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block';
        avatarDisp.insertBefore(img, avatarDisp.firstChild);
      }
      img.src = data;
      img.style.display = 'block';
    }
    if (avatarIni) avatarIni.style.display = 'none';
    updateSidebarAvatar();
  };
  reader.readAsDataURL(file);

  // Subida real al servidor
  try {
    if (typeof ProfileAPI === 'undefined' || typeof ProfileAPI.subirFoto !== 'function') {
      // definir al vuelo si extensions/api no lo trajeron
      window.ProfileAPI = window.ProfileAPI || {};
      ProfileAPI.subirFoto = async function(f) {
        const fd = new FormData();
        fd.append('foto', f, f.name || 'perfil.jpg');
        const headers = { Accept: 'application/json' };
        const token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(API_BASE + '/perfil/foto', { method: 'POST', headers, body: fd });
        if (res.status === 401) { clearSession(); window.location.reload(); throw new Error('Sesión expirada'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          let msg = data.message || data.error || ('Error ' + res.status);
          if (data.errors) msg = Object.values(data.errors).flat().join(' · ');
          throw new Error(msg);
        }
        return data;
      };
    }
    showToast('Subiendo foto...', 'info');
    const actualizado = await ProfileAPI.subirFoto(file);
    currentUser = normalizeUser({ ...getStoredUser(), ...actualizado });
    setSession(getToken(), { ...getStoredUser(), ...actualizado });
    const url = fotoUrlUsuario(actualizado) || actualizado.foto_url;
    if (url && typeof perfilesExtra !== 'undefined') {
      if (!perfilesExtra[currentUser.user]) perfilesExtra[currentUser.user] = {};
      perfilesExtra[currentUser.user].foto = url;
    }
    updateSidebarAvatar();
    // refrescar preview del modal con URL del servidor
    const avatarDisp = document.getElementById('perfil-avatar-display');
    if (avatarDisp && url) {
      let img = avatarDisp.querySelector('img');
      if (img) img.src = url;
    }
    showToast('✓ Foto de perfil guardada en el servidor');
    if (typeof renderUsersEnhanced === 'function') renderUsersEnhanced();
  } catch (e) {
    console.error('Foto perfil:', e);
    showToast('No se pudo subir la foto: ' + (e.message || e) + ' — ¿php artisan storage:link?', 'error');
  }
  // permitir re-elegir la misma imagen
  if (event.target) event.target.value = '';
}

async function guardarPerfil() {
  if (_locks['perfil']) {
    if (typeof showToast === 'function') showToast('Espera, ya se está procesando…', 'warn');
    return;
  }
  _locks['perfil'] = true;
  const __btn_perfil = document.querySelector('[onclick*="guardarPerfil"]');
  let __old_perfil = '';
  if (__btn_perfil) {
    __btn_perfil.disabled = true;
    __old_perfil = __btn_perfil.textContent;
    __btn_perfil.textContent = 'Guardando…';
  }
  try {

  if (!currentUser) return;
  const nombre = document.getElementById('perfil-nombre')?.value.trim() || '';
  let email = document.getElementById('perfil-email')?.value.trim() || '';
  const telefono = document.getElementById('perfil-telefono')?.value.trim() || '';
  const passActual = document.getElementById('perfil-pass-actual')?.value || '';
  const passNew = document.getElementById('perfil-pass-new')?.value || '';
  const passConfirm = document.getElementById('perfil-pass-confirm')?.value || '';

  // Si el campo viene vacío (placeholder / readonly raro), usar el email de sesión
  if (!email) {
    email = (currentUser.email || '').trim();
  }

  if (!validarNombre(nombre, 'Nombre')) return;
  if (!email) {
    showToast('No tienes correo asignado. Pide a un admin que te configure uno.', 'error');
    return;
  }
  if (telefono && !validarTelefono(telefono, false)) return;
  if (passNew && passNew !== passConfirm) { showToast('Las contraseñas no coinciden', 'error'); return; }
  if (passNew && !passActual) { showToast('Escribe tu contraseña actual', 'error'); return; }
  if (passNew && passNew.length < 6) { showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error'); return; }

  try {
    const actualizado = await ProfileAPI.update({ name: nombre, email, telefono });

    if (passNew) {
      const resp = await ProfileAPI.updatePassword({
        password_actual: passActual,
        password_nueva: passNew,
        password_nueva_confirmation: passConfirm,
      });
      setSession(resp.token, { ...getStoredUser(), ...actualizado });
    } else {
      setSession(getToken(), { ...getStoredUser(), ...actualizado });
    }

    currentUser = normalizeUser({ ...getStoredUser(), ...actualizado, name: nombre, email, telefono });
    if (typeof perfilesExtra !== 'undefined') {
      if (!perfilesExtra[currentUser.user]) perfilesExtra[currentUser.user] = {};
      perfilesExtra[currentUser.user].telefono = telefono;
      perfilesExtra[currentUser.user].email = email;
    }

    const nameEl = document.getElementById('sidebar-name');
    if (nameEl) nameEl.textContent = nombre;
    updateSidebarAvatar();
    closeModal();
    if (typeof renderUsersEnhanced === 'function') renderUsersEnhanced();
    if (typeof loadUsuarios === 'function') await loadUsuarios();
    showToast('✓ Perfil actualizado correctamente');
  } catch (e) {
    showToast('No se pudo guardar el perfil: ' + (e.message || e), 'error');
  }

  } finally {
    _locks['perfil'] = false;
    if (__btn_perfil) {
      __btn_perfil.disabled = false;
      __btn_perfil.textContent = __old_perfil || __btn_perfil.textContent;
    }
  }
}

// normalizeUser: conservar email, telefono, foto
(function() {
  const _nu = normalizeUser;
  window.normalizeUser = function(u) {
    const n = _nu(u);
    n.email = u.email || n.email || '';
    n.telefono = u.telefono || n.telefono || '';
    n.foto_path = u.foto_path || null;
    n.foto_url = u.foto_url || fotoUrlUsuario(u);
    return n;
  };
})();

// SuperAdmin: ver foto + datos personalizados en lista de usuarios
function renderUsersEnhanced() {
  const tbody = document.getElementById('users-body');
  if (!tbody) return;
  const esSuperAdmin = currentUser && currentUser.rolRaw === 'superadmin';
  const esAdmin = currentUser && (currentUser.rolRaw === 'administrador' || esSuperAdmin);

  tbody.innerHTML = (tecnicos || []).map(t => {
    const foto = fotoUrlUsuario(t) || (perfilesExtra[t.user] || {}).foto;
    const rolBadge = t.rolRaw === 'superadmin'
      ? '<span class="superadmin-badge">⭐ Super Admin</span>'
      : t.rolRaw === 'administrador'
        ? '<span class="badge badge-purple">Administrador</span>'
        : '<span class="badge badge-amber">Técnico</span>';
    const avatarHtml = foto
      ? '<img src="' + foto + '" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover">'
      : '<div class="avatar">' + initials(t.name) + '</div>';

    let acciones = '';
    if (esSuperAdmin) {
      acciones = '<button class="btn-icon" title="Editar usuario" onclick="abrirEditarUsuario(' + t.id + ')">✎</button>' +
        '<button class="btn-icon danger" title="' + (t.active ? 'Desactivar' : 'Activar') + '" onclick="toggleUsuarioActivo(' + t.id + ')">' +
        (t.active ? '⊘' : '✓') + '</button>';
    }

    const tel = t.telefono ? '<div style="font-size:11px;color:var(--gray-400)">' + t.telefono + '</div>' : '';
    const mail = t.email ? '<div style="font-size:11px;color:var(--gray-400)">' + t.email + '</div>' : '';

    return '<tr>' +
      '<td><code class="code-tag">' + t.code + '</code></td>' +
      '<td><div class="avatar-cell">' + avatarHtml + '<div><div>' + t.name + '</div>' + tel + mail + '</div></div></td>' +
      '<td style="font-family:var(--font-mono);font-size:12px;color:var(--gray-400)">' + t.user + '</td>' +
      '<td>' + rolBadge + '</td>' +
      '<td>' + (t.branch || '—') + '</td>' +
      '<td><span class="badge ' + (t.active ? 'badge-green' : 'badge-red') + '">' + (t.active ? 'Activo' : 'Inactivo') + '</span></td>' +
      '<td style="text-align:right">' + acciones + '</td>' +
    '</tr>';
  }).join('');
}

// loadUsuarios: guardar email, telefono, foto para SuperAdmin
(function() {
  const _load = loadUsuarios;
  window.loadUsuarios = async function() {
    await _load();
    // map extra fields if API starts sending them
    try {
      const list = await UsuariosAPI.list();
      tecnicos = list.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        user: u.username,
        username: u.username,
        rol: mapRol(u.rol),
        rolRaw: u.rol,
        branch: u.sucursal || '',
        sucursal_id: u.sucursal_id ?? null,
        active: u.active,
        email: u.email || '',
        telefono: u.telefono || '',
        foto_path: u.foto_path || null,
        foto_url: u.foto_url || null,
      }));
      if (typeof renderUsersEnhanced === 'function') renderUsersEnhanced();
      else if (typeof renderUsers === 'function') renderUsers();
    } catch (_) {}
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.abrirPerfil = abrirPerfil;
    window.cambiarFotoPerfil = cambiarFotoPerfil;
    window.cambiarFotoPerfilApp = cambiarFotoPerfil;
    window.guardarPerfil = guardarPerfil;
    window.updateSidebarAvatar = updateSidebarAvatar;
    window.renderUsersEnhanced = renderUsersEnhanced;
    if (currentUser) updateSidebarAvatar();
  }, 120);
});



function verGaleriaHistorial(dbId) {
  const data = (typeof historialData !== 'undefined' && historialData.length)
    ? historialData
    : (window.historialData || []);
  const h = data.find(x => String(x.dbId) === String(dbId) || String(x.id) === String(dbId));
  if (!h) return;
  const fotos = (h.fotos && h.fotos.length) ? h.fotos : (h.foto ? [h.foto] : []);
  if (!fotos.length) { showToast('Sin fotos en esta entrada', 'error'); return; }

  let overlay = document.getElementById('historial-gallery-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'historial-gallery-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML =
    '<div style="color:#fff;font-size:14px;margin-bottom:12px;text-align:center">' +
      (h.titulo || h.equipo) + ' · ' + fotos.length + ' foto(s)' +
      ' <button type="button" onclick="document.getElementById(\'historial-gallery-overlay\').remove()" style="margin-left:12px;background:#fff;color:#111;border:none;border-radius:6px;padding:4px 10px;cursor:pointer">Cerrar</button>' +
    '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:960px;max-height:80vh;overflow:auto">' +
      fotos.map(function(src) {
        return '<img src="' + src + '" alt="" style="max-width:280px;max-height:320px;object-fit:contain;border-radius:8px;background:#111">';
      }).join('') +
    '</div>';
  overlay.style.display = 'flex';
}


// Alias públicos (index.html y rebind post-extensions)
window.guardarHistorialEntryApp = typeof guardarHistorialEntry === 'function' ? guardarHistorialEntry : null;
window.renderHistorialReal = typeof renderHistorial === 'function' ? renderHistorial : null;
function guardarHistorialEntryApp() {
  return guardarHistorialEntry.apply(this, arguments);
}


window.guardarPerfilApp = guardarPerfil;
window.abrirPerfilApp = abrirPerfil;
async function guardarPerfilApp() { return guardarPerfil.apply(this, arguments); }
async function abrirPerfilApp() { return abrirPerfil.apply(this, arguments); }

window.cambiarFotoPerfilApp = cambiarFotoPerfil;
async function cambiarFotoPerfilApp(event) { return cambiarFotoPerfil(event); }

// Preview fotos stock
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'new-rep-foto') {
    const prev = document.getElementById('new-rep-foto-prev');
    if (prev && e.target.files?.[0]) {
      prev.src = URL.createObjectURL(e.target.files[0]);
      prev.style.display = 'block';
    }
  }
  if (e.target && e.target.id === 'edit-rep-foto') {
    const prev = document.getElementById('edit-rep-foto-prev');
    if (prev && e.target.files?.[0]) {
      prev.src = URL.createObjectURL(e.target.files[0]);
      prev.style.display = 'block';
    }
  }
});


// ===== Foto libre (Openverse / CC) para stock =====

// ===== Foto libre: API Laravel O directo Openverse (si la ruta 404) =====
async function buscarFotoLibreRepuesto(modo) {
  const isNew = modo === 'new';
  const nameEl = document.getElementById(isNew ? 'new-rep-name' : 'edit-rep-name');
  const catEl = document.getElementById(isNew ? 'new-rep-cat' : 'edit-rep-cat');
  const name = (nameEl?.value || '').trim();
  const cat = (catEl?.value || '').trim();
  if (!name && !cat) {
    showToast('Escribe el nombre del repuesto primero', 'error');
    return;
  }

  showToast('Buscando imagen de uso libre…', 'info');

  let url = null;
  let fuente = '';

  // 1) Openverse directo (no depende de routes/api.php → sin 404)
  try {
    url = await buscarFotoOpenverseDirecto(name, cat);
    if (url) fuente = 'Openverse (CC / uso libre)';
  } catch (e) {
    console.warn('Openverse:', e);
  }

  // 2) API Laravel solo si Openverse falló y la ruta existe
  if (!url && typeof StockAPI !== 'undefined' && StockAPI.buscarFoto) {
    try {
      const res = await StockAPI.buscarFoto(name || cat, cat);
      url = res.foto_url || res.url || null;
      if (url) fuente = res.fuente || 'API MiCel';
    } catch (_) {
      /* silencioso: ruta a menudo no registrada */
    }
  }

  // 3) Fallback Wikimedia siempre disponible
  if (!url) {
    url = fallbackFotoPorCategoria(name, cat);
    fuente = 'Wikimedia (referencia libre)';
  }

  const prev = document.getElementById(isNew ? 'new-rep-foto-prev' : 'edit-rep-foto-prev');
  const hidden = document.getElementById(isNew ? 'new-rep-foto-url' : 'edit-rep-foto-url');
  const src = document.getElementById(isNew ? 'new-rep-foto-src' : 'edit-rep-foto-src');
  if (hidden) hidden.value = url;
  if (prev) {
    prev.src = url;
    prev.style.display = 'block';
    prev.onerror = function () {
      const fb = fallbackFotoPorCategoria(name, cat);
      this.onerror = null;
      this.src = fb;
      if (hidden) hidden.value = fb;
      if (src) src.textContent = 'Fuente: Wikimedia (respaldo)';
    };
  }
  if (src) src.textContent = 'Fuente: ' + fuente;
  const file = document.getElementById(isNew ? 'new-rep-foto' : 'edit-rep-foto');
  if (file) file.value = '';
  showToast('✓ Foto libre lista — recuerda Guardar cambios');
}

async function buscarFotoOpenverseDirecto(name, cat) {
  const q = mapQueryFotoLibre(name, cat);
  try {
    const u =
      'https://api.openverse.org/v1/images/?page_size=5&q=' + encodeURIComponent(q);
    const res = await fetch(u, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    for (const img of results) {
      const url = img.thumbnail || img.url;
      if (url && String(url).startsWith('http')) return url;
    }
  } catch (e) {
    console.warn('Openverse directo:', e);
  }
  return null;
}

function mapQueryFotoLibre(name, cat) {
  const n = ((name || '') + ' ' + (cat || '')).toLowerCase();
  if (n.includes('pantalla') || n.includes('screen')) return 'smartphone display';
  if (n.includes('pin') || n.includes('tipo c') || n.includes('usb') || n.includes('conector'))
    return 'usb type c cable';
  if (n.includes('bater')) return 'phone battery';
  if (n.includes('audio') || n.includes('altavoz')) return 'earphones';
  if (n.includes('flex')) return 'flex cable';
  // inglés corto
  const clean = (name || cat || 'smartphone').replace(/[0-9]+/g, ' ').trim();
  return clean + ' phone';
}

function fallbackFotoPorCategoria(name, cat) {
  const c = ((name || '') + ' ' + (cat || '')).toLowerCase();
  if (c.includes('pin') || c.includes('usb') || c.includes('conector') || c.includes('tipo c') || c.includes('v8'))
    return 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/USB_Type-C_port.jpg/320px-USB_Type-C_port.jpg';
  if (c.includes('pantalla'))
    return 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Smartphone.jpg/320px-Smartphone.jpg';
  if (c.includes('bater'))
    return 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Nokia_battery.jpg/320px-Nokia_battery.jpg';
  return 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Smartphone.jpg/320px-Smartphone.jpg';
}



// ===== QR de cobro del negocio (Usuarios → card) =====
const QR_COBRO_KEY = 'micel_qr_cobro_negocio';

function loadQrCobroConfig() {
  try {
    return JSON.parse(localStorage.getItem(QR_COBRO_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveQrCobroConfig(cfg) {
  localStorage.setItem(QR_COBRO_KEY, JSON.stringify(cfg));
}

function refreshQrCobroUI() {
  const cfg = loadQrCobroConfig();
  const img = document.getElementById('qr-cobro-preview');
  const ph = document.getElementById('qr-cobro-placeholder');
  const titulo = document.getElementById('qr-cobro-titulo');
  if (titulo && cfg && cfg.titulo) titulo.value = cfg.titulo;
  if (img && ph) {
    if (cfg && cfg.imagen) {
      img.src = cfg.imagen;
      img.style.display = 'block';
      ph.style.display = 'none';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      ph.style.display = 'block';
    }
  }
  // Solo admin ve la card (técnico no debería estar en usuarios, pero por si acaso)
  const card = document.getElementById('card-qr-cobro');
  if (card && typeof esAdminOSuper === 'function') {
    card.style.display = esAdminOSuper() ? '' : 'none';
  }
}

function guardarQrCobro() {
  if (typeof esAdminOSuper === 'function' && !esAdminOSuper()) {
    showToast('Solo Admin / Super Admin pueden configurar el QR', 'error');
    return;
  }
  const file = document.getElementById('qr-cobro-file')?.files?.[0];
  const titulo = document.getElementById('qr-cobro-titulo')?.value.trim() || 'QR de pago MiCel';
  const prev = loadQrCobroConfig();

  const finish = (imagen) => {
    if (!imagen) {
      showToast('Selecciona una imagen del QR', 'error');
      return;
    }
    saveQrCobroConfig({ titulo, imagen, updatedAt: new Date().toISOString() });
    refreshQrCobroUI();
    const f = document.getElementById('qr-cobro-file');
    if (f) f.value = '';
    showToast('✓ QR de cobro guardado');
  };

  if (file) {
    if (file.size > 2.5 * 1024 * 1024) {
      showToast('Imagen muy pesada (máx ~2.5 MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => finish(reader.result);
    reader.onerror = () => showToast('No se pudo leer la imagen', 'error');
    reader.readAsDataURL(file);
  } else if (prev && prev.imagen) {
    finish(prev.imagen); // solo actualiza título
  } else {
    showToast('Selecciona una imagen del QR', 'error');
  }
}

function eliminarQrCobro() {
  if (typeof esAdminOSuper === 'function' && !esAdminOSuper()) {
    showToast('Solo Admin / Super Admin', 'error');
    return;
  }
  if (!confirm('¿Quitar el QR de cobro del negocio?')) return;
  localStorage.removeItem(QR_COBRO_KEY);
  const titulo = document.getElementById('qr-cobro-titulo');
  if (titulo) titulo.value = '';
  const f = document.getElementById('qr-cobro-file');
  if (f) f.value = '';
  refreshQrCobroUI();
  showToast('QR de cobro eliminado');
}

function mostrarQrCobro() {
  const cfg = loadQrCobroConfig();
  if (!cfg || !cfg.imagen) {
    showToast('Aún no hay QR cargado. Súbelo en Usuarios → QR de cobro.', 'warn');
    return;
  }
  const t = document.getElementById('modal-qr-cobro-titulo');
  const img = document.getElementById('modal-qr-cobro-img');
  if (t) t.textContent = cfg.titulo || 'Pagar con QR — MiCel';
  if (img) img.src = cfg.imagen;
  if (typeof openModal === 'function') openModal('qr-cobro');
  else {
    const m = document.getElementById('modal-qr-cobro');
    if (m) m.classList.remove('hidden');
  }
}

function mostrarQrCobroSiAplica(valorPago) {
  const v = String(valorPago || '').toLowerCase();
  if (v.includes('qr') || v.includes('transfer')) {
    const cfg = loadQrCobroConfig();
    if (cfg && cfg.imagen) {
      // pequeña demora para no interrumpir el select
      setTimeout(() => mostrarQrCobro(), 200);
    }
  }
}

// Preview al elegir archivo
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'qr-cobro-file' && e.target.files?.[0]) {
    const img = document.getElementById('qr-cobro-preview');
    const ph = document.getElementById('qr-cobro-placeholder');
    const url = URL.createObjectURL(e.target.files[0]);
    if (img) {
      img.src = url;
      img.style.display = 'block';
    }
    if (ph) ph.style.display = 'none';
  }
});

// Cargar UI del QR al entrar a usuarios / al login
(function hookQrCobroOnNav() {
  const _nav = window.nav;
  if (typeof _nav === 'function' && !_nav._qrHooked) {
    window.nav = function (id, el) {
      const r = _nav.apply(this, arguments);
      if (id === 'usuarios') setTimeout(refreshQrCobroUI, 50);
      return r;
    };
    window.nav._qrHooked = true;
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(refreshQrCobroUI, 400));
  setTimeout(refreshQrCobroUI, 800);
})();



function imprimirOrdenTrabajo(orderId) {
  const o = (ordersData || []).find((x) => x.id == orderId || x.dbId == orderId || x.code == orderId);
  if (!o) { showToast('Orden no encontrada', 'error'); return; }
  const fakeRecibo = {
    numRecibo: o.code || ('OT-' + (o.id || '')),
    fecha: o.date || '',
    hora: '',
    cliente: o.client || o.cliente || '',
    telefono: o.phone || o.telefono || '',
    equipo: o.device || o.equipo || '',
    imei: o.imei || '',
    servicio: o.service || o.servicio || '',
    techName: o.techName || o.tecnico || '',
    sucursal: o.branch || o.sucursal || '',
    monto: o.monto || 0,
    pago: o.pago || '—',
    obs: o.obs || o.observaciones || '',
    tipo: 'Orden de trabajo',
  };
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) { showToast('Permite ventanas emergentes', 'error'); return; }
  const html = _reciboDocHtml(fakeRecibo).replace(/src="img\/logo-icon.svg"/g, 'src="' + _logoUrl() + '"');
  w.document.write(_micelPrintShell(fakeRecibo.numRecibo, html));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
