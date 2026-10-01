// ==========================================
// APP.JS — MiCel v4.0 (conectado a API Laravel)
// Requiere: js/api.js cargado antes
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


async function initApp() {
  await loadUsuarios();

  window.usuarios = (tecnicos || []).map(t => ({
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
}
// ---------- Login / sesión ----------
async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-error');

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

function normalizeUser(u) {
  return {
    id: u.id,
    code: u.code,
    username: u.username,
    name: u.name,
    rol: mapRol(u.rol),
    rolRaw: u.rol,
    branch: u.branch,
    active: u.active,
    techCode: u.code,
    telefono: u.telefono,
    foto_path: u.foto_path,
  };
}

function applyUserSession() {
  const ini = initials(currentUser.name);
  const av = document.getElementById('sidebar-avatar');
  if (av) {
    const span = document.getElementById('sidebar-avatar-initials');
    if (span) span.textContent = ini;
    else av.textContent = ini;
  }
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-role').textContent = currentUser.rol;

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
  try {
    await AuthAPI.logout();
  } catch (_) {}
  clearSession();
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

document.addEventListener('keydown', (e) => {
  if (
    e.key === 'Enter' &&
    !document.getElementById('login-screen').classList.contains('hidden')
  ) {
    doLogin();
  }
});

// Restaurar sesión al cargar
async function tryRestoreSession() {
  const token = getToken();
  const stored = getStoredUser();
  if (!token || !stored) return false;
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

// ---------- Init ----------
async function initApp() {
  await loadUsuarios();

  window.usuarios = (tecnicos || []).map(t => ({
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

  if (typeof initExtensions === 'function') {
    initExtensions();
  }
  if (typeof renderUsers === 'function') {
    renderUsers();
  }
}

async function loadUsuarios() {
  try {
    const list = await UsuariosAPI.list();
    tecnicos = list.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      user: u.username,
      rol: mapRol(u.rol),
      rolRaw: u.rol,
      branch: u.branch,
      active: u.active,
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
    branch: o.branch || '',
    status: o.status_label || mapStatusLabel(o.status),
    statusRaw: o.status,
    monto: o.monto || 0,
    obs: o.obs || '',
    date: o.created_at
      ? new Date(o.created_at).toLocaleDateString('es-BO')
      : '',
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
    alert('Error al cargar órdenes: ' + e.message);
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
    alert('Error al cargar stock: ' + e.message);
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
      branch: c.branch || '',
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
      pago: v.pago === 'qr' ? 'QR' : 'Efectivo',
    }));
    renderVentas();
    try {
      const res = await VentasAPI.resumenHoy();
      const totalEl = document.getElementById('ventas-total');
      const countEl = document.getElementById('ventas-count');
      if (totalEl) totalEl.textContent = 'Bs ' + fmtMonto(res.total);
      if (countEl) countEl.textContent = res.cantidad + ' transacciones';
    } catch (_) {}
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
      sucursal: r.sucursal || '',
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
    const [inv, ventas, resumen] = await Promise.all([
      CelularesAPI.inventario(),
      CelularesAPI.ventas(),
      CelularesAPI.resumen().catch(() => null),
    ]);
    celularesInventario = inv;
    celularesData = ventas;
    if (typeof renderInventarioCelulares === 'function') {
      renderInventarioCelulares(celularesInventario);
    }
    if (typeof renderCelulares === 'function') {
      renderCelulares(celularesData);
    }
    if (resumen) {
      // actualiza metric-cards si existen en el HTML
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      // ajusta IDs si en tu HTML son distintos
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadReporteTecnicos() {
  try {
    const list = await OrdersAPI.reporteTecnicos();
    if (typeof renderReportTech === 'function') {
      // adapta a lo que espera tu renderReportTech
      window._reporteTecnicos = list;
      renderReportTech();
    }
  } catch (e) {
    console.error(e);
  }
}

// ---------- NAV (igual que antes) ----------
const navConfig = {
  dashboard: { title: 'Principal', sub: 'Resumen general del sistema', btn: '+ Nueva Orden' },
  ordenes: { title: 'Órdenes de Servicio', sub: 'Registro y seguimiento de reparaciones', btn: '+ Nueva Orden' },
  stock: { title: 'Control de Stock', sub: 'Inventario de repuestos tecnológicos', btn: '+ Agregar repuesto' },
  ventas: { title: 'Ventas', sub: 'Registro de ingresos por servicio y venta', btn: '+ Registrar venta' },
  celulares: { title: 'Venta de Celulares', sub: 'Compra y venta de equipos nuevos y usados', btn: '+ Registrar venta' },
  reportes: { title: 'Reportes', sub: 'Análisis operativo y financiero', btn: 'Exportar PDF' },
  clientes: { title: 'Clientes', sub: 'Base de datos de clientes atendidos', btn: '+ Nuevo cliente' },
  usuarios: { title: 'Usuarios / Técnicos', sub: 'Gestión de accesos y roles del sistema', btn: '+ Nuevo usuario' },
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
  document.getElementById('topbar-title').textContent = cfg.title || id;
  document.getElementById('topbar-sub').textContent = cfg.sub || '';
  const btn = document.getElementById('topbar-btn');
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
  else if (id === 'celulares') document.getElementById('cel-modelo')?.focus();
  else if (id === 'clientes') openModal('cliente');
  else if (id === 'recibos') openModal('recibo-manual');
  else alert(navConfig[id]?.btn || 'Acción');
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeSidebarMobile() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ---------- Helpers ----------
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
function nowTime() {
  return new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}
function nowDate() {
  return new Date().toLocaleDateString('es-BO');
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
    .filter((t) => t.active && t.rolRaw === 'tecnico')
    .map((t) => `<option value="${t.id}">${t.code} — ${t.name}</option>`)
    .join('');
  ['modal-tech', 'recibo-tech', 'venta-tech', 'edit-order-tech'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts || '<option value="">Sin técnicos</option>';
  });
}

// ---------- Dashboard ----------
function renderDashOrders() {
  const el = document.getElementById('dash-orders');
  if (!el) return;
  el.innerHTML = ordersData
    .slice(0, 6)
    .map(
      (o) => `
    <tr>
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device} — ${o.service}</td>
      <td>${o.techName || getTech(o.techCode).name}</td>
      <td>${o.branch}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>`
    )
    .join('');
}

// ---------- Órdenes ----------
function renderOrders(data) {
  const el = document.getElementById('orders-body');
  if (!el) return;
  el.innerHTML = data
    .map(
      (o) => `
    <tr>
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device}</td>
      <td>${o.service}</td>
      <td><div class="avatar-cell"><div class="avatar">${initials(o.techName || getTech(o.techCode).name)}</div>${o.techName || getTech(o.techCode).name}</div></td>
      <td>${o.branch}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="font-weight:600">${o.monto > 0 ? 'Bs ' + fmtMonto(o.monto) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-sm" onclick="cambiarEstado(${o.id})">Estado</button>
          <button class="btn-sm" onclick="editarOrden(${o.id})">Editar</button>
          <button class="btn-sm btn-sm-primary" onclick="verReciboOrden(${o.id})">Recibo</button>
        </div>
      </td>
    </tr>`
    )
    .join('');
}

function filterOrders(q) {
  loadOrders({ q: q || undefined });
}

function filterSucursal(v) {
  loadOrders(v === 'all' ? {} : { branch: v });
}

async function verReciboOrden(id) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;
  const existente = recibosData.find((r) => r.ordenCode === o.code || r.orden === o.code);
  if (existente) {
    if (typeof mostrarVistaPrevia === 'function') mostrarVistaPrevia(existente);
    return;
  }
  if (o.monto <= 0) {
    alert('Esta orden aún no tiene monto asignado.\nVe a "Editar" para ingresar el precio del servicio.');
    return;
  }
  try {
    const recibo = await OrdersAPI.crearRecibo(id, { pago: 'Efectivo' });
    await loadRecibos();
    await loadOrders();
    if (typeof mostrarVistaPrevia === 'function') {
      mostrarVistaPrevia({
        numRecibo: recibo.num_recibo,
        orden: o.code,
        cliente: recibo.cliente,
        telefono: recibo.telefono,
        equipo: recibo.equipo,
        servicio: recibo.servicio,
        monto: recibo.monto,
        pago: recibo.pago,
        hora: recibo.hora,
        fecha: recibo.fecha,
        obs: recibo.obs,
        tipo: recibo.tipo,
      });
    } else {
      alert('Recibo ' + recibo.num_recibo + ' generado.');
    }
  } catch (e) {
    alert(e.message);
  }
}

function editarOrden(id) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;
  document.getElementById('edit-order-code').value = o.code;
  document.getElementById('edit-order-id').value = o.id; // necesitas este input hidden
  document.getElementById('edit-order-client').value = o.client;
  document.getElementById('edit-order-phone').value = o.phone || '';
  document.getElementById('edit-order-device').value = o.device;
  document.getElementById('edit-order-service').value = o.service;
  document.getElementById('edit-order-monto').value = o.monto || 0;
  document.getElementById('edit-order-obs').value = o.obs || '';
  const ss = document.getElementById('edit-order-status');
  if (ss) {
    for (let i = 0; i < ss.options.length; i++) {
      if (ss.options[i].value === o.status || mapStatusToApi(ss.options[i].value) === o.statusRaw) {
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
    alert('⚠️ El nombre del cliente no puede contener números.');
    return;
  }
  const statusVal = document.getElementById('edit-order-status').value;
  const body = {
    client: clientEdit,
    phone: document.getElementById('edit-order-phone').value.trim(),
    device: document.getElementById('edit-order-device').value.trim(),
    service: document.getElementById('edit-order-service').value.trim(),
    monto: parseFloat(document.getElementById('edit-order-monto').value) || 0,
    obs: document.getElementById('edit-order-obs').value.trim(),
    status: mapStatusToApi(statusVal),
    tecnico_id: document.getElementById('edit-order-tech').value || null,
  };
  try {
    await OrdersAPI.update(id, body);
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
  const branch = document.getElementById('modal-branch').value;
  const tecnico_id = document.getElementById('modal-tech').value || null;

  if (!client || !device || !service) {
    alert('Complete: Cliente, Equipo y Servicio.');
    return;
  }
  if (!soloLetras(client)) {
    alert('⚠️ El nombre del cliente no puede contener números.');
    return;
  }

  try {
    await OrdersAPI.create({
      client,
      phone,
      device,
      service,
      branch,
      tecnico_id: currentUser.rol === 'Técnico' ? currentUser.id : tecnico_id,
      monto,
      obs,
    });
    closeModal();
    await loadOrders();
    await loadClientes();
    nav('ordenes', document.querySelectorAll('.nav-item')[1]);
  } catch (e) {
    alert(e.message);
  }
}

async function cambiarEstado(id) {
  const o = ordersData.find((x) => x.id === id);
  if (!o) return;
  const orden = ['Recepción', 'Diagnóstico', 'En proceso', 'Listo'];
  const idx = orden.indexOf(o.status);
  const siguiente = orden[Math.min(idx + 1, orden.length - 1)];
  const nuevo = prompt(
    `Estado actual: ${o.status}\nNuevo estado (Recepción / Diagnóstico / En proceso / Listo):`,
    siguiente
  );
  if (!nuevo) return;
  const apiStatus = mapStatusToApi(nuevo.trim());
  if (!['recepcion', 'diagnostico', 'en_proceso', 'listo'].includes(apiStatus)) {
    alert('Estado no válido.');
    return;
  }
  try {
    await OrdersAPI.cambiarEstado(id, apiStatus);
    await loadOrders();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- STOCK ----------
function renderStock(data) {
  revisarAlertasStock();
  const el = document.getElementById('stock-body');
  if (!el) return;
  el.innerHTML = data
    .map((s) => {
      if (s.id === stockEditingId || s.dbId === stockEditingId) return filaStockEdicion(s);
      const pct = Math.min(100, Math.round((s.qty / Math.max(s.min * 2, 1)) * 100));
      const color = stockColor(s.qty, s.min);
      return `
      <tr>
        <td><code class="code-tag" style="font-size:10px">${s.id}</code></td>
        <td>${s.name}</td>
        <td>${s.cat}</td>
        <td style="font-weight:600;color:${s.qty < s.min ? 'var(--danger)' : 'var(--gray-800)'}">${s.qty}</td>
        <td>${s.min}</td>
        <td>Bs ${fmtMonto(s.precio)}</td>
        <td>
          <div class="stock-bar-wrap">
            <div class="stock-bg"><div class="stock-fill-inner" style="width:${pct}%;background:${color}"></div></div>
            <span style="font-size:11px;color:var(--gray-400)">${pct}%</span>
          </div>
        </td>
        <td>${stockBadge(s.qty, s.min)}</td>
        <td>
          <button class="btn-sm btn-sm-primary" onclick="editarRepuesto(${s.dbId})">${s.qty === 0 ? 'Reabastecer / Editar' : 'Editar'}</button>
        </td>
      </tr>`;
    })
    .join('');
}

function filaStockEdicion(s) {
  const key = s.dbId;
  return `
    <tr style="background:var(--surface-alt)">
      <td><code class="code-tag" style="font-size:10px">${s.id}</code></td>
      <td><input type="text" id="stock-edit-name-${key}" value="${s.name}" style="width:100%;padding:5px 7px;border:1px solid var(--gray-300);border-radius:4px;background:var(--surface);color:var(--gray-800);font-size:12px"></td>
      <td><input type="text" id="stock-edit-cat-${key}" value="${s.cat}" style="width:100%;padding:5px 7px;border:1px solid var(--gray-300);border-radius:4px;background:var(--surface);color:var(--gray-800);font-size:12px"></td>
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="btn-sm" style="padding:2px 8px" onclick="pasoStockQty(${key},-1)">−</button>
          <input type="number" id="stock-edit-qty-${key}" value="${s.qty}" min="0" style="width:56px;padding:5px 4px;border:1px solid var(--gray-300);border-radius:4px;background:var(--surface);color:var(--gray-800);font-size:12px;text-align:center">
          <button class="btn-sm" style="padding:2px 8px" onclick="pasoStockQty(${key},1)">+</button>
        </div>
      </td>
      <td><input type="number" id="stock-edit-min-${key}" value="${s.min}" min="1" style="width:56px;padding:5px 4px;border:1px solid var(--gray-300);border-radius:4px;background:var(--surface);color:var(--gray-800);font-size:12px"></td>
      <td><input type="number" id="stock-edit-precio-${key}" value="${s.precio}" min="0" style="width:72px;padding:5px 4px;border:1px solid var(--gray-300);border-radius:4px;background:var(--surface);color:var(--gray-800);font-size:12px"></td>
      <td colspan="2" style="color:var(--gray-400);font-size:11px">Editando ahora...</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-sm btn-sm-primary" onclick="guardarEdicionRepuesto(${key})">Guardar</button>
          <button class="btn-sm" onclick="cancelarEdicionStock()">Cancelar</button>
        </div>
      </td>
    </tr>`;
}

function pasoStockQty(id, delta) {
  const input = document.getElementById(`stock-edit-qty-${id}`);
  if (!input) return;
  input.value = Math.max(0, (parseInt(input.value) || 0) + delta);
}

function filterStock(q) {
  loadStock({ q: q || undefined });
}

function editarRepuesto(dbId) {
  stockEditingId = dbId;
  renderStock(stockData);
}

function cancelarEdicionStock() {
  stockEditingId = null;
  renderStock(stockData);
}

async function guardarEdicionRepuesto(dbId) {
  const nuevoNombre = document.getElementById(`stock-edit-name-${dbId}`).value.trim();
  const nuevaCat = document.getElementById(`stock-edit-cat-${dbId}`).value.trim();
  const qty = parseInt(document.getElementById(`stock-edit-qty-${dbId}`).value);
  const min = parseInt(document.getElementById(`stock-edit-min-${dbId}`).value);
  const precio = parseFloat(document.getElementById(`stock-edit-precio-${dbId}`).value);

  if (!nuevoNombre || !nuevaCat) {
    alert('Complete nombre y categoría.');
    return;
  }
  if (isNaN(qty) || qty < 0) {
    alert('La cantidad no puede ser negativa.');
    return;
  }
  if (isNaN(min) || min < 1) {
    alert('El stock mínimo debe ser al menos 1.');
    return;
  }

  try {
    await StockAPI.update(dbId, {
      name: nuevoNombre,
      categoria: nuevaCat,
      qty,
      min,
      precio,
    });
    stockEditingId = null;
    await loadStock();
  } catch (e) {
    alert(e.message);
  }
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
    ['new-rep-name', 'new-rep-cat', 'new-rep-qty', 'new-rep-min', 'new-rep-precio'].forEach(
      (fid) => {
        const el = document.getElementById(fid);
        if (el) el.value = '';
      }
    );
    await loadStock();
  } catch (e) {
    alert(e.message);
  }
}

function revisarAlertasStock() {
  const sinStock = stockData.filter((s) => s.qty === 0);
  const criticos = stockData.filter((s) => s.qty > 0 && s.qty < s.min);
  const toast = document.getElementById('stock-toast');
  if (!toast) return;
  if (sinStock.length === 0 && criticos.length === 0) {
    toast.classList.add('hidden');
    return;
  }
  const partes = [];
  if (sinStock.length) {
    partes.push(
      `🔴 <strong>${sinStock.length}</strong> sin stock: ${sinStock
        .map((s) => s.name)
        .slice(0, 3)
        .join(', ')}${sinStock.length > 3 ? '…' : ''}`
    );
  }
  if (criticos.length) {
    partes.push(
      `🟡 <strong>${criticos.length}</strong> en nivel crítico: ${criticos
        .map((s) => s.name)
        .slice(0, 3)
        .join(', ')}${criticos.length > 3 ? '…' : ''}`
    );
  }
  const mensaje = partes.join('<br>');
  if (mensaje !== toastStockUltimoMensaje) {
    toastStockCerrado = false;
    toastStockUltimoMensaje = mensaje;
  }
  document.getElementById('stock-toast-msg').innerHTML = mensaje;
  toast.classList.toggle('hidden', toastStockCerrado);
}

function cerrarToastStock() {
  toastStockCerrado = true;
  document.getElementById('stock-toast').classList.add('hidden');
}

// ---------- Ventas ----------
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
      (v) => `
    <tr>
      <td>${v.hora}</td>
      <td>${v.client}</td>
      <td>${v.detail}</td>
      <td>${v.techName || getTech(v.techCode).name}</td>
      <td>${v.pago}</td>
      <td style="font-weight:600">Bs ${fmtMonto(v.monto)}</td>
    </tr>`
    )
    .join('');
}

async function registrarVenta() {
  const client = document.getElementById('venta-cliente').value.trim();
  const detail = document.getElementById('venta-detalle').value.trim();
  const monto = parseFloat(document.getElementById('venta-monto').value) || 0;
  const pagoRaw = document.getElementById('venta-pago').value;
  const pago = (pagoRaw || 'efectivo').toLowerCase().includes('qr') ? 'qr' : 'efectivo';

  if (!detail || !monto) {
    alert('Complete detalle y monto.');
    return;
  }

  try {
    await VentasAPI.create({ client: client || null, detail, monto, pago });
    document.getElementById('venta-cliente').value = '';
    document.getElementById('venta-detalle').value = '';
    document.getElementById('venta-monto').value = '';
    await loadVentas();
    alert('✓ Venta registrada correctamente.');
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Clientes (render básico) ----------
function renderClientes(data) {
  const el = document.getElementById('clientes-body');
  if (!el) return;
  el.innerHTML = data
    .map(
      (c) => `
    <tr>
      <td><code class="code-tag">${c.id}</code></td>
      <td>${c.name}</td>
      <td>${c.phone}</td>
      <td>${c.visits}</td>
      <td>${c.lastVisit}</td>
      <td>${c.branch}</td>
      <td>—</td>
    </tr>`
    )
    .join('');
}

// ---------- Recibos historial ----------
function renderRecibosHistorial() {
  const el = document.getElementById('recibos-body');
  if (!el) return;
  el.innerHTML = recibosData
    .map(
      (r) => `
    <tr>
      <td><code class="code-tag">${r.numRecibo}</code></td>
      <td>${r.orden || '—'}</td>
      <td>${r.cliente}</td>
      <td>${r.servicio}</td>
      <td>Bs ${fmtMonto(r.monto)}</td>
      <td>${r.pago}</td>
      <td>${r.techName || '—'}</td>
      <td>${r.hora}</td>
    </tr>`
    )
    .join('');
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

// ---------- Usuarios ----------
function renderUsers() {
  const el = document.getElementById('usuarios-body');
  if (!el) return;
  el.innerHTML = tecnicos
    .map(
      (t) => `
    <tr>
      <td><code class="code-tag">${t.code}</code></td>
      <td>${t.name}</td>
      <td>${t.user}</td>
      <td>${t.rol}</td>
      <td>${t.branch || '—'}</td>
      <td>${t.active ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
    </tr>`
    )
    .join('');
}

// ---------- Reportes técnicos ----------
function renderReportTech() {
  const list = window._reporteTecnicos || [];
  const el = document.getElementById('report-tech-body');
  if (!el) return;
  el.innerHTML = list
    .map(
      (t) => `
    <tr>
      <td><code class="code-tag">${t.code}</code></td>
      <td>${t.name}</td>
      <td>${t.ordenes_completadas}</td>
      <td>Bs ${fmtMonto(t.ingresos)}</td>
      <td>${t.branch || '—'}</td>
    </tr>`
    )
    .join('');
}

// Stubs para funciones que aún usan lógica local (celulares, modales, etc.)
// Si ya tienes esas funciones en extensions.js, no las pises.
// Aquí solo dejamos placeholders seguros:

function openModal(id) {
  const m = document.getElementById('modal-' + id) || document.getElementById(id);
  if (m) m.classList.add('open');
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeModal() {
  document.querySelectorAll('.modal.open, .modal-overlay.open').forEach((el) => {
    el.classList.remove('open');
  });
}
// ... todo tu código (doLogin, initApp, loadOrders, etc.) ...

// ===== LO ÚLTIMO DEL ARCHIVO =====
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
  if (typeof tryRestoreSession === 'function') {
    tryRestoreSession();
  }
});