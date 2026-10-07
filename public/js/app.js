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
  const ini = initials(currentUser.name);
  const span = document.getElementById('sidebar-avatar-initials');
  if (span) span.textContent = ini;
  const nameEl = document.getElementById('sidebar-name');
  if (nameEl) nameEl.textContent = currentUser.name;
  const roleEl = document.getElementById('sidebar-role');
  if (roleEl) roleEl.textContent = currentUser.rol;

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
  ]);

  populateTechSelects();
  poblarSelectSucursal(document.getElementById('orders-filter-branch'), { conTodas: true });
  poblarSelectSucursal(document.getElementById('historial-filter-branch'), { conTodas: true });
  poblarSelectSucursal(document.getElementById('modal-branch'));
  poblarSelectSucursal(document.getElementById('nu-branch'), { conAmbas: true });
  poblarSelectSucursal(document.getElementById('recibo-sucursal'));
  poblarSelectSucursal(document.getElementById('new-cli-branch'));
  poblarSelectSucursal(document.getElementById('new-user-branch'), { conAmbas: true });
  if (typeof renderUsers === 'function') renderUsers();
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
  } catch (e) {
    console.error(e);
  }
}

function normalizeStock(s) {
  return {
    id: s.code || String(s.id),
    dbId: s.id,
    name: s.name,
    cat: s.categoria,
    qty: s.qty,
    min: s.min,
    precio: parseFloat(s.precio) || 0,
  };
}

async function loadStock(params = {}) {
  try {
    const list = await StockAPI.list(params);
    stockData = list.map(normalizeStock);
    renderStock(stockData);
  } catch (e) {
    console.error(e);
  }
}

async function loadClientes(params = {}) {
  try {
    const list = await ClientesAPI.list(params);
    clientesData = list.map((c) => ({
      id: c.code || String(c.id),
      dbId: c.id,
      name: c.name,
      phone: c.phone,
      branch: c.sucursal?.nombre || '',
      sucursal_id: c.sucursal_id ?? null,
      visits: c.visits || 0,
      lastVisit: c.last_visit
        ? new Date(c.last_visit).toLocaleDateString('es-BO')
        : '—',
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
      hora: r.hora,
      fecha: r.fecha,
    }));
    renderRecibosHistorial();
  } catch (e) {
    console.error(e);
  }
}

async function loadCelulares() {
  try {
    const [inv, ventas] = await Promise.all([
      CelularesAPI.inventario().catch(() => []),
      CelularesAPI.ventas().catch(() => []),
    ]);
    celularesInventario = inv || [];
    celularesData = ventas || [];
    if (typeof renderInventarioCelulares === 'function') renderInventarioCelulares(celularesInventario);
    if (typeof renderCelulares === 'function') renderCelulares(celularesData);
  } catch (e) {
    console.error(e);
  }
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
}

function topAction(id) {
  if (id === 'dashboard' || id === 'ordenes') openModal('orden');
  else if (id === 'stock') document.getElementById('new-rep-name')?.focus();
  else if (id === 'ventas') openModal('venta');
  else if (id === 'clientes') openModal('cliente');
  else if (id === 'recibos') openModal('recibo-manual');
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
function soloLetras(valor) {
  return !/\d/.test(valor);
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
  const opciones = ESTADOS_ORDEN.map(
    (e) => `
      <div class="status-dropdown-item ${e.value === statusRaw ? 'is-active' : ''}"
           onclick="event.stopPropagation(); cerrarStatusDropdowns(); cambiarEstado(${orderId}, '${e.value}')">
        <span class="status-dot ${e.clase}"></span>${e.label}
      </div>`
  ).join('');

  return `
    <div class="status-dropdown" id="status-dd-${orderId}">
      <button type="button" class="status-dropdown-trigger ${actual.clase}" onclick="toggleStatusDropdown(event, ${orderId})">
        ${actual.label} <span class="status-dropdown-caret">▾</span>
      </button>
      <div class="status-dropdown-menu">${opciones}</div>
    </div>`;
}

function toggleStatusDropdown(ev, orderId) {
  ev.stopPropagation();
  const abierto = document.getElementById(`status-dd-${orderId}`)?.classList.contains('is-open');
  cerrarStatusDropdowns();
  if (!abierto) document.getElementById(`status-dd-${orderId}`)?.classList.add('is-open');
}

function cerrarStatusDropdowns() {
  document.querySelectorAll('.status-dropdown.is-open').forEach((el) => el.classList.remove('is-open'));
}

document.addEventListener('click', cerrarStatusDropdowns);

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
  el.innerHTML = ordersData
    .slice(0, 6)
    .map(
      (o) => `<tr>
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
        <button class="btn-sm" onclick="editarOrden(${o.id})">Editar</button>
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

async function cambiarEstado(id, nuevoStatusRaw) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;

  try {
    await OrdersAPI.cambiarEstado(id, nuevoStatusRaw);
    await loadOrders(); // también refresca coins/VIP del cliente si quedó "listo"
    showToast(`✓ Orden ${o.code} → ${ESTADOS_ORDEN.find(e => e.value === nuevoStatusRaw)?.label}`);
  } catch (e) {
    alert('No se pudo cambiar el estado: ' + e.message);
    await loadOrders(); // revierte el select visualmente al estado real
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
  openModal('editar-orden');
}

async function guardarEdicionOrden() {
  const id = document.getElementById('edit-order-id')?.value;
  if (!id) return;
  const clientEdit = document.getElementById('edit-order-client').value.trim();
  if (!soloLetras(clientEdit)) {
    alert('El nombre del cliente no puede contener números.');
    return;
  }
  const statusVal = document.getElementById('edit-order-status').value;
  try {
    await OrdersAPI.update(id, {
      client: clientEdit,
      phone: document.getElementById('edit-order-phone').value.trim(),
      device: document.getElementById('edit-order-device').value.trim(),
      service: document.getElementById('edit-order-service').value.trim(),
      monto: parseFloat(document.getElementById('edit-order-monto').value) || 0,
      obs: document.getElementById('edit-order-obs').value.trim(),
      status: mapStatusToApi(statusVal),
      tecnico_id: document.getElementById('edit-order-tech').value || null,
    });
    closeModal();
    await loadOrders();
  } catch (e) {
    alert(e.message);
  }
}

async function guardarOrden() {
  const client = document.getElementById('modal-client').value.trim();
  const phone = document.getElementById('modal-phone').value.trim();
  const device = document.getElementById('modal-device').value.trim();
  const service = document.getElementById('modal-service').value;
  const monto = parseFloat(document.getElementById('modal-monto').value) || 0;
  const obs = document.getElementById('modal-obs').value.trim();
  const sucursal_id = document.getElementById('modal-branch').value || null;
  const tecnico_id = document.getElementById('modal-tech').value || null;

  if (!client || !device || !service) {
    alert('Complete: Cliente, Equipo y Servicio.');
    return;
  }
  if (!soloLetras(client)) {
    alert('El nombre del cliente no puede contener números.');
    return;
  }

  try {
    await OrdersAPI.create({
      client,
      phone,
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
  } catch (e) {
    alert(e.message);
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

function mostrarVistaPreviaRecibo(id) {
  const r = recibosData.find((x) => x.id === id);
  if (!r) return;
  _reciboEnPreview = r;

  document.getElementById('recibo-preview').innerHTML = `
    <div style="font-family:monospace;line-height:1.7">
      <div style="text-align:center;font-weight:700;font-size:16px">MiCel</div>
      <div style="text-align:center;font-size:11px;color:#777;margin-bottom:10px">${r.tipo}</div>
      <hr>
      <div><b>N° Recibo:</b> ${r.numRecibo}</div>
      <div><b>Fecha:</b> ${r.fecha || ''} ${r.hora || ''}</div>
      <div><b>Sucursal:</b> ${r.sucursal || '—'}</div>
      <div><b>Cliente:</b> ${r.cliente}</div>
      <div><b>Teléfono:</b> ${r.telefono}</div>
      <div><b>Equipo:</b> ${r.equipo}</div>
      <div><b>Servicio:</b> ${r.servicio}</div>
      <div><b>Técnico:</b> ${r.techName}</div>
      <div><b>Forma de pago:</b> ${r.pago}</div>
      <hr>
      <div style="font-size:18px;font-weight:700;text-align:right">Total: Bs ${fmtMonto(r.monto)}</div>
      ${r.obs ? `<div style="margin-top:8px;font-size:11px;color:#777">${r.obs}</div>` : ''}
    </div>`;

  document.getElementById('modal-recibo').classList.remove('hidden');
}

function imprimirRecibo() {
  if (!_reciboEnPreview) return;
  const html = document.getElementById('recibo-preview').innerHTML;
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`<html><head><title>${_reciboEnPreview.numRecibo}</title></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
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
}

// ---------- stock ----------
function renderStock(data) {
  revisarAlertasStock();
  const el = document.getElementById('stock-body');
  if (!el) return;
  el.innerHTML = data
    .map((s) => {
      const pct = Math.min(100, Math.round((s.qty / Math.max(s.min * 2, 1)) * 100));
      const color = stockColor(s.qty, s.min);
      return `<tr>
        <td><code class="code-tag">${s.id}</code></td>
        <td>${s.name}</td>
        <td>${s.cat}</td>
        <td style="font-weight:600">${s.qty}</td>
        <td>${s.min}</td>
        <td>Bs ${fmtMonto(s.precio)}</td>
        <td><div class="stock-bar-wrap"><div class="stock-bg"><div class="stock-fill-inner" style="width:${pct}%;background:${color}"></div></div></td>
        <td>${stockBadge(s.qty, s.min)}</td>
        <td><button class="btn-sm btn-sm-primary" onclick="editarRepuesto(${s.dbId})">Editar</button></td>
      </tr>`;
    })
    .join('');
}

function filterStock(q) {
  loadStock(q ? { q } : {});
}

function editarRepuesto(dbId) {
  const s = stockData.find((x) => x.dbId === dbId);
  if (!s) return;
  const name = prompt('Nombre', s.name);
  if (name == null) return;
  const cat = prompt('Categoría', s.cat);
  if (cat == null) return;
  const qty = parseInt(prompt('Cantidad', s.qty), 10);
  const min = parseInt(prompt('Mínimo', s.min), 10);
  const precio = parseFloat(prompt('Precio', s.precio));
  StockAPI.update(dbId, { name, categoria: cat, qty, min, precio })
    .then(() => loadStock())
    .catch((e) => alert(e.message));
}

async function guardarRepuesto() {
  const name = document.getElementById('new-rep-name').value.trim();
  const cat = document.getElementById('new-rep-cat').value.trim();
  const qty = parseInt(document.getElementById('new-rep-qty').value) || 0;
  const min = parseInt(document.getElementById('new-rep-min').value) || 1;
  const precio = parseFloat(document.getElementById('new-rep-precio').value) || 0;
  if (!name || !cat) {
    alert('Complete nombre y categoría.');
    return;
  }
  try {
    await StockAPI.create({ name, categoria: cat, qty, min, precio });
    ['new-rep-name', 'new-rep-cat', 'new-rep-qty', 'new-rep-min', 'new-rep-precio'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    await loadStock();
  } catch (e) {
    alert(e.message);
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
  const client = document.getElementById('venta-cliente')?.value.trim() || '';
  const detail = document.getElementById('venta-detalle')?.value.trim() || '';
  const monto = parseFloat(document.getElementById('venta-monto')?.value) || 0;
  const pagoRaw = (document.getElementById('venta-pago')?.value || 'efectivo').toLowerCase();
  const pago = pagoRaw.includes('qr') ? 'qr' : 'efectivo';
  if (!detail || !monto) {
    alert('Complete detalle y monto.');
    return;
  }
  try {
    await VentasAPI.create({ client: client || null, detail, monto, pago });
    await loadVentas();
    alert('Venta registrada.');
  } catch (e) {
    alert(e.message);
  }
}

// ---------- clientes / recibos / users / report ----------
function renderClientes(data) {
  const el = document.getElementById('clientes-body');
  if (!el) return;
  el.innerHTML = data
    .map(
      (c) => `<tr>
      <td><code class="code-tag">${c.id}</code></td>
      <td>${c.name}</td><td>${c.phone}</td><td>${c.visits}</td>
      <td>${c.lastVisit}</td><td>${c.branch}</td><td>—</td>
    </tr>`
    )
    .join('');
}

function renderRecibosHistorial() {
  const el = document.getElementById('recibos-body');
  if (!el) return;
  el.innerHTML = recibosData
    .map(
      (r) => `<tr>
      <td><code class="code-tag">${r.numRecibo}</code></td>
      <td>${r.orden || '—'}</td><td>${r.cliente}</td><td>${r.servicio}</td>
      <td>Bs ${fmtMonto(r.monto)}</td><td>${r.pago}</td>
      <td>${r.techName}</td><td>${r.hora}</td>
      <td>
        <button class="btn-sm" onclick="mostrarVistaPreviaRecibo(${r.id})">Ver</button>
        <button class="btn-sm" onclick="abrirEditarRecibo(${r.id})">Editar</button>
      </td>
    </tr>`
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
  const orden_id = document.getElementById('recibo-orden').value || null;
  const cliente = document.getElementById('recibo-cliente').value.trim();
  const telefono = document.getElementById('recibo-telefono').value.trim();
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
  const name = document.getElementById('new-cli-name').value.trim();
  const phone = document.getElementById('new-cli-phone').value.trim();
  const sucursal_id = document.getElementById('new-cli-branch').value || null;

  if (!name || !phone) {
    alert('Completa Nombre y Teléfono.');
    return;
  }

  try {
    const cliente = await ClientesAPI.create({ name, phone, sucursal_id });
    await loadClientes();
    document.getElementById('new-cli-name').value = '';
    document.getElementById('new-cli-phone').value = '';
    closeModal();
    showToast(`✓ Cliente "${cliente.name}" registrado (${cliente.code})`);
  } catch (e) {
    alert('No se pudo registrar el cliente: ' + e.message);
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
    'recibo-manual': 'modal-recibo',
    'estado-orden': 'modal-estado',
    'editar-recibo': 'modal-editar-recibo',
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
  tryRestoreSession();
});
