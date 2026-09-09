// ==========================================
// APP.JS — MiCel v3.0 (conectado a la API real)
// ==========================================

// Mapeo de roles
const ROL_API_TO_LABEL = {
  superadmin: 'Super Admin',
  administrador: 'Administrador',
  tecnico: 'Técnico',
};

// Declaración explícita de variables globales para evitar ReferenceError
// Remplaza 'let' por 'var' en las variables globales
var currentUser = null;
var tecnicos = tecnicos || [];
var ordersData = ordersData || [];
var stockData = stockData || [];
var clientesData = clientesData || [];
var ventasHoy = ventasHoy || [];
var recibosData = recibosData || [];
var reporteTecnicosData = reporteTecnicosData || [];
// ===== LOGIN =====
async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  try {
    const apiUser = await apiLogin(user, pass);
    currentUser = {
      ...apiUser,
      rol: ROL_API_TO_LABEL[apiUser.rol] || apiUser.rol,
      techCode: apiUser.code,
    };
    document.getElementById('login-error').classList.add('hidden');

    await cargarDatosIniciales();

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    applyUserSession();
    initApp();
  } catch (err) {
    document.getElementById('login-error').classList.remove('hidden');
  }
}

// Carga todo desde la API real y llena las variables globales
async function cargarDatosIniciales() {
  const [users, orders, stock, clientes, ventas, recibos, reporte] = await Promise.all([
    apiGetUsuarios(),
    apiGetOrders(),
    apiGetStock(),
    apiGetClientes(),
    apiGetVentas({ all: true }), // trae todas, no solo las de hoy
    apiGetRecibos(),
    apiGetReporteTecnicos(),
  ]);

  tecnicos = (users || []).map(u => ({
    _id: u.id,
    code: u.code,
    name: u.name,
    user: u.username,
    rol: ROL_API_TO_LABEL[u.rol] || u.rol,
    branch: u.branch,
    active: u.active,
  }));

  ordersData = (orders || []).map(o => ({
    _id: o.id,
    code: o.code,
    client: o.client,
    phone: o.phone,
    device: o.device,
    service: o.service,
    techCode: o.tecnico ? o.tecnico.code : null,
    branch: o.branch,
    status: o.status_label,
    date: o.created_at ? o.created_at.substring(0, 10) : nowDate(),
    monto: Number(o.monto),
    obs: o.obs,
  }));

  stockData = (stock || []).map(s => ({
    _id: s.id,
    id: s.code,
    name: s.name,
    cat: s.categoria,
    qty: s.qty,
    min: s.min,
    precio: Number(s.precio),
  }));

  clientesData = (clientes || []).map(c => ({
    _id: c.id,
    id: c.code,
    name: c.name,
    phone: c.phone,
    branch: c.branch,
    visits: c.visits,
    lastVisit: c.last_visit,
  }));

  ventasHoy = (ventas || []).map(v => ({
    hora: v.hora,
    client: v.client,
    detail: v.detail,
    techCode: v.tecnico ? v.tecnico.code : null,
    monto: Number(v.monto),
    pago: v.pago === 'qr' ? 'QR' : 'Efectivo',
  }));

  recibosData = (recibos || []).map(r => ({
    _id: r.id,
    numRecibo: r.num_recibo,
    orden: r.orden ? r.orden.code : '—',
    cliente: r.cliente,
    telefono: r.telefono,
    equipo: r.equipo,
    servicio: r.servicio,
    monto: Number(r.monto),
    pago: r.pago,
    techCode: r.tecnico ? r.tecnico.code : null,
    sucursal: r.sucursal,
    obs: r.obs,
    tipo: r.tipo,
    hora: r.hora,
    fecha: r.fecha,
  }));

  reporteTecnicosData = reporte || [];
}

function applyUserSession() {
  if (!currentUser) return;
  const ini = initials(currentUser.name);
  document.getElementById('sidebar-avatar').textContent  = ini;
  document.getElementById('sidebar-name').textContent    = currentUser.name;
  document.getElementById('sidebar-role').textContent    = currentUser.rol;
  const rolBadgeEl = document.getElementById('topbar-rol');
  if (rolBadgeEl) {
    rolBadgeEl.textContent  = currentUser.rol;
    rolBadgeEl.className    = 'badge ' + (currentUser.rol === 'Administrador' || currentUser.rol === 'Super Admin' ? 'badge-purple' : 'badge-amber');
  }
  const navUsuarios = document.getElementById('nav-usuarios');
  if (navUsuarios) navUsuarios.style.display = currentUser.rol === 'Técnico' ? 'none' : '';
}

async function doLogout() {
  await apiLogout();
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-screen').classList.contains('hidden')) doLogin();
});

// Si ya había sesión guardada (recargaste la página), la retoma sin pedir login de nuevo
document.addEventListener('DOMContentLoaded', async () => {
  const guardado = getUsuarioGuardado();
  const token = getToken();

  if (guardado && token) {
    currentUser = { ...guardado, rol: ROL_API_TO_LABEL[guardado.rol] || guardado.rol, techCode: guardado.code };
    try {
      await cargarDatosIniciales();
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      applyUserSession();
      initApp();
    } catch (err) {
      // Token vencido o error de carga: vuelve al login
      clearToken();
      currentUser = null;
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
    }
  } else {
    // Si no hay sesión activa, muestra login
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  }
});

// ===== INIT =====
function initApp() {
  populateTechSelects();
  renderDashOrders();
  renderOrders(ordersData);
  renderStock(stockData);
  renderVentas();
  renderCelulares(celularesData);
  renderUsers();
  renderReportTech();
  renderClientes(clientesData);
  renderRecibosHistorial();
  populateReciboOrden();
}

// ===== NAV =====
const navConfig = {
  dashboard: { title: 'Principal',             sub: 'Resumen general del sistema',              btn: '+ Nueva Orden'    },
  ordenes:   { title: 'Órdenes de Servicio',   sub: 'Registro y seguimiento de reparaciones',   btn: '+ Nueva Orden'    },
  stock:     { title: 'Control de Stock',      sub: 'Inventario de repuestos tecnológicos',     btn: '+ Agregar repuesto'},
  ventas:    { title: 'Ventas',                sub: 'Registro de ingresos por servicio y venta',btn: '+ Registrar venta' },
  celulares: { title: 'Venta de Celulares',    sub: 'Compra y venta de equipos nuevos y usados', btn: '+ Registrar venta' },
  reportes:  { title: 'Reportes',              sub: 'Análisis operativo y financiero',          btn: 'Exportar PDF'     },
  clientes:  { title: 'Clientes',              sub: 'Base de datos de clientes atendidos',      btn: '+ Nuevo cliente'  },
  usuarios:  { title: 'Usuarios / Técnicos',   sub: 'Gestión de accesos y roles del sistema',   btn: '+ Nuevo usuario'  },
  recibos:   { title: 'Recibos',               sub: 'Generación e impresión de recibos',        btn: '+ Nuevo recibo'   },
};

function nav(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetPanel = document.getElementById('panel-' + id);
  if (targetPanel) targetPanel.classList.add('active');
  if (el) el.classList.add('active');
  const cfg = navConfig[id] || {};
  document.getElementById('topbar-title').textContent = cfg.title || id;
  document.getElementById('topbar-sub').textContent   = cfg.sub   || '';
  document.getElementById('topbar-btn').textContent   = cfg.btn   || '';
  document.getElementById('topbar-btn').onclick = () => topAction(id);
  closeSidebarMobile();
}

// ===== SIDEBAR RESPONSIVE =====
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeSidebarMobile() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

function topAction(id) {
  if (id === 'dashboard' || id === 'ordenes') openModal('orden');
  else if (id === 'stock')   openModal('repuesto');
  else if (id === 'ventas')  openModal('venta');
  else if (id === 'celulares') document.getElementById('cel-modelo')?.focus();
  else if (id === 'clientes')openModal('cliente');
  else if (id === 'recibos') openModal('recibo-manual');
  else if (id === 'usuarios') document.getElementById('new-user-name')?.focus();
  else alert(navConfig[id]?.btn || 'Acción');
}

// ===== HELPERS =====
function getTech(code)   { return tecnicos.find(t => t.code === code) || { name: '—', code: '—' }; }
function initials(name)  { return (name || '').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'U'; }
function fmtMonto(v)     { return parseFloat(v||0).toLocaleString('es-BO', {minimumFractionDigits:0}); }
function nowTime()       { return new Date().toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'}); }
function nowDate()       { return new Date().toLocaleDateString('es-BO'); }

function statusBadge(s) {
  const m = {'Listo':'badge-green','En proceso':'badge-blue','Diagnóstico':'badge-amber','Recepción':'badge-red'};
  return `<span class="badge ${m[s]||'badge-blue'}">${s}</span>`;
}
function stockBadge(qty, min) {
  if (qty===0)    return `<span class="badge badge-red">Sin stock</span>`;
  if (qty < min)  return `<span class="badge badge-amber">Crítico</span>`;
  return `<span class="badge badge-green">OK</span>`;
}
function stockColor(qty, min) {
  if (qty===0)  return '#e02424';
  if (qty<min)  return '#c27803';
  return '#0e9f6e';
}

function populateTechSelects() {
  const opts = tecnicos.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.code} — ${t.name}</option>`).join('');
  ['modal-tech','recibo-tech','venta-tech'].forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=opts; });
}

// ===== DASHBOARD =====
function renderDashOrders() {
  const dashEl = document.getElementById('dash-orders');
  if (!dashEl) return;
  dashEl.innerHTML = ordersData.slice(0,6).map(o=>`
    <tr>
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device} — ${o.service}</td>
      <td>${getTech(o.techCode).name}</td>
      <td>${o.branch}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>`).join('');
}

// ===== ÓRDENES =====
function renderOrders(data) {
  const tbody = document.getElementById('orders-body');
  if (!tbody) return;
  tbody.innerHTML = data.map(o=>`
    <tr>
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device}</td>
      <td>${o.service}</td>
      <td><div class="avatar-cell"><div class="avatar">${initials(getTech(o.techCode).name)}</div>${getTech(o.techCode).name}</div></td>
      <td>${o.branch}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="font-weight:600">${o.monto>0?'Bs '+fmtMonto(o.monto):'<span style="color:var(--gray-400)">—</span>'}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-sm" onclick="cambiarEstado('${o.code}')">Estado</button>
          <button class="btn-sm" onclick="editarOrden('${o.code}')">Editar</button>
          <button class="btn-sm btn-sm-primary" onclick="verReciboOrden('${o.code}')">Recibo</button>
        </div>
      </td>
    </tr>`).join('');
}

function filterOrders(q) {
  renderOrders(ordersData.filter(o=>
    o.code.toLowerCase().includes(q.toLowerCase()) ||
    o.client.toLowerCase().includes(q.toLowerCase()) ||
    o.device.toLowerCase().includes(q.toLowerCase())
  ));
}

function filterSucursal(v) {
  renderOrders(v==='all' ? ordersData : ordersData.filter(o=>o.branch.includes(v)));
}

async function verReciboOrden(code) {
  const o = ordersData.find(x=>x.code===code);
  if (!o) return;
  const existente = recibosData.find(r=>r.orden===o.code);
  if (existente) { mostrarVistaPrevia(existente); return; }
  if (o.monto <= 0) {
    alert('Esta orden aún no tiene monto asignado.\nVe a "Editar" para ingresar el precio del servicio.');
    return;
  }
  try {
    const nuevo = await apiCrearRecibo({
      orden_id: o._id,
      cliente: o.client,
      telefono: o.phone || '—',
      equipo: o.device,
      servicio: o.service,
      monto: o.monto,
      pago: 'Efectivo',
      sucursal: o.branch,
      obs: o.obs || 'Garantía de 30 días por el servicio realizado.',
      tipo: 'Recibo de servicio técnico',
    });
    await cargarDatosIniciales();
    renderRecibosHistorial();
    populateReciboOrden();
    const recibo = recibosData.find(r => r._id === nuevo.id) || recibosData[0];
    mostrarVistaPrevia(recibo);
  } catch (err) {
    alert('No se pudo generar el recibo: ' + err.message);
  }
}

function editarOrden(code) {
  const o = ordersData.find(x=>x.code===code);
  if (!o) return;
  document.getElementById('edit-order-code').value    = o.code;
  document.getElementById('edit-order-client').value  = o.client;
  document.getElementById('edit-order-phone').value   = o.phone||'';
  document.getElementById('edit-order-device').value  = o.device;
  document.getElementById('edit-order-service').value = o.service;
  document.getElementById('edit-order-monto').value   = o.monto||0;
  document.getElementById('edit-order-obs').value     = o.obs||'';
  const ss = document.getElementById('edit-order-status');
  for(let i=0;i<ss.options.length;i++) if(ss.options[i].value===o.status){ss.selectedIndex=i;break;}
  const ts = document.getElementById('edit-order-tech');
  for(let i=0;i<ts.options.length;i++) if(ts.options[i].value===o.techCode){ts.selectedIndex=i;break;}
  openModal('editar-orden');
}

async function guardarEdicionOrden() {
  const code = document.getElementById('edit-order-code').value;
  const o = ordersData.find(x=>x.code===code);
  if (!o) return;

  const techCode = document.getElementById('edit-order-tech').value;
  const tecnico = tecnicos.find(t=>t.code===techCode);
  const status = document.getElementById('edit-order-status').value;

  try {
    await apiEditarOrden(o._id, {
      client: document.getElementById('edit-order-client').value.trim(),
      phone: document.getElementById('edit-order-phone').value.trim(),
      device: document.getElementById('edit-order-device').value.trim(),
      service: document.getElementById('edit-order-service').value.trim(),
      monto: parseFloat(document.getElementById('edit-order-monto').value)||0,
      obs: document.getElementById('edit-order-obs').value.trim(),
      status: STATUS_LABEL_TO_VALUE[status] || 'recepcion',
      tecnico_id: tecnico ? tecnico._id : null,
    });
    closeModal();
    await cargarDatosIniciales();
    renderOrders(ordersData);
    renderDashOrders();
    populateReciboOrden();
  } catch (err) {
    alert('No se pudo guardar la orden: ' + err.message);
  }
}

async function guardarOrden() {
  const client  = document.getElementById('modal-client').value.trim();
  const phone   = document.getElementById('modal-phone').value.trim();
  const device  = document.getElementById('modal-device').value.trim();
  const service = document.getElementById('modal-service').value;
  const monto   = parseFloat(document.getElementById('modal-monto').value)||0;
  const obs     = document.getElementById('modal-obs').value.trim();
  const branch  = document.getElementById('modal-branch').value;
  const techCode= document.getElementById('modal-tech').value;
  if (!client||!device||!service) { alert('Complete: Cliente, Equipo y Servicio.'); return; }

  const tecnico = tecnicos.find(t=>t.code===techCode);

  try {
    await apiCrearOrden({
      client, phone, device, service, branch,
      tecnico_id: tecnico ? tecnico._id : null,
      monto, obs,
    });

    if (!clientesData.find(c=>c.phone===phone && c.name===client) && phone) {
      try { await apiCrearCliente({ name: client, phone, branch }); } catch (e) { /* no bloquea la orden */ }
    }

    closeModal();
    await cargarDatosIniciales();
    renderOrders(ordersData);
    renderDashOrders();
    renderClientes(clientesData);
    populateReciboOrden();
    nav('ordenes', document.querySelectorAll('.nav-item')[1]);
  } catch (err) {
    alert('No se pudo crear la orden: ' + err.message);
  }
}

// ===== STOCK =====
function renderStock(data) {
  const tbody = document.getElementById('stock-body');
  if (!tbody) return;
  tbody.innerHTML = data.map(s=>{
    const pct   = Math.min(100, Math.round((s.qty/Math.max(s.min*2,1))*100));
    const color = stockColor(s.qty, s.min);
    return `
      <tr>
        <td><code class="code-tag" style="font-size:10px">${s.id}</code></td>
        <td>${s.name}</td>
        <td>${s.cat}</td>
        <td style="font-weight:600;color:${s.qty<s.min?'var(--danger)':'var(--gray-800)'}">${s.qty}</td>
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
          <div style="display:flex;gap:4px">
            <button class="btn-sm" onclick="editarRepuesto('${s.id}')">Editar</button>
            <button class="btn-sm btn-sm-primary" onclick="ajustarStock('${s.id}')">Stock</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function filterStock(q) {
  renderStock(stockData.filter(s=>
    s.name.toLowerCase().includes(q.toLowerCase()) ||
    s.cat.toLowerCase().includes(q.toLowerCase()) ||
    s.id.toLowerCase().includes(q.toLowerCase())
  ));
}

function ajustarStock(id) {
  const s = stockData.find(x=>x.id===id);
  if (!s) return;
  document.getElementById('adj-id').value    = id;
  document.getElementById('adj-name').value  = s.name;
  document.getElementById('adj-qty').value   = s.qty;
  document.getElementById('adj-min').value   = s.min;
  document.getElementById('adj-precio').value= s.precio;
  openModal('ajuste-stock');
}

async function guardarAjusteStock() {
  const id = document.getElementById('adj-id').value;
  const s  = stockData.find(x=>x.id===id);
  if (!s) return;

  const op  = document.getElementById('adj-operacion').value;
  const val = parseInt(document.getElementById('adj-cantidad').value)||0;

  let nuevaQty = s.qty;
  if (op==='set')      nuevaQty = val;
  else if (op==='add') nuevaQty = s.qty + val;
  else if (op==='sub') nuevaQty = Math.max(0, s.qty - val);

  try {
    await apiEditarRepuesto(s._id, {
      qty: nuevaQty,
      min: parseInt(document.getElementById('adj-min').value)||s.min,
      precio: parseFloat(document.getElementById('adj-precio').value)||s.precio,
    });
    closeModal();
    await cargarDatosIniciales();
    renderStock(stockData);
  } catch (err) {
    alert('No se pudo ajustar el stock: ' + err.message);
  }
}

function editarRepuesto(id) {
  const s = stockData.find(x=>x.id===id);
  if (!s) return;
  document.getElementById('edit-rep-id').value     = id;
  document.getElementById('edit-rep-name').value   = s.name;
  document.getElementById('edit-rep-cat').value    = s.cat;
  document.getElementById('edit-rep-qty').value    = s.qty;
  document.getElementById('edit-rep-min').value    = s.min;
  document.getElementById('edit-rep-precio').value = s.precio;
  openModal('editar-repuesto');
}

async function guardarEdicionRepuesto() {
  const id = document.getElementById('edit-rep-id').value;
  const s  = stockData.find(x=>x.id===id);
  if (!s) return;

  try {
    await apiEditarRepuesto(s._id, {
      name: document.getElementById('edit-rep-name').value.trim(),
      categoria: document.getElementById('edit-rep-cat').value.trim(),
      qty: parseInt(document.getElementById('edit-rep-qty').value)||0,
      min: parseInt(document.getElementById('edit-rep-min').value)||1,
      precio: parseFloat(document.getElementById('edit-rep-precio').value)||0,
    });
    closeModal();
    await cargarDatosIniciales();
    renderStock(stockData);
  } catch (err) {
    alert('No se pudo editar el repuesto: ' + err.message);
  }
}

async function guardarRepuesto() {
  const name   = document.getElementById('new-rep-name').value.trim();
  const cat    = document.getElementById('new-rep-cat').value.trim();
  const qty    = parseInt(document.getElementById('new-rep-qty').value)||0;
  const min    = parseInt(document.getElementById('new-rep-min').value)||1;
  const precio = parseFloat(document.getElementById('new-rep-precio').value)||0;
  if (!name||!cat) { alert('Complete nombre y categoría.'); return; }

  try {
    await apiCrearRepuesto({ name, categoria: cat, qty, min, precio });
    closeModal();
    await cargarDatosIniciales();
    renderStock(stockData);
  } catch (err) {
    alert('No se pudo crear el repuesto: ' + err.message);
  }
}

// ===== VENTAS =====
function renderVentas() {
  const total = ventasHoy.reduce((a,v)=>a+v.monto,0);
  const totalEl = document.getElementById('ventas-total');
  const countEl = document.getElementById('ventas-count');
  const tbody   = document.getElementById('ventas-body');

  if (totalEl) totalEl.textContent = 'Bs '+fmtMonto(total);
  if (countEl) countEl.textContent = ventasHoy.length+' transacciones';
  if (tbody) {
    tbody.innerHTML = ventasHoy.map(v=>`
      <tr>
        <td>${v.hora}</td>
        <td>${v.client}</td>
        <td>${v.detail}</td>
        <td>${getTech(v.techCode).name}</td>
        <td>${v.pago}</td>
        <td style="font-weight:600">Bs ${fmtMonto(v.monto)}</td>
      </tr>`).join('');
  }
}

async function registrarVenta() {
  const client = document.getElementById('venta-cliente').value.trim();
  const detail = document.getElementById('venta-detalle').value.trim();
  const monto  = parseFloat(document.getElementById('venta-monto').value)||0;
  const pago   = document.getElementById('venta-pago').value;
  if (!detail||!monto) { alert('Complete detalle y monto.'); return; }

  try {
    await apiCrearVenta({ client: client||null, detail, monto, pago: pago.toLowerCase()==='qr' ? 'qr' : 'efectivo' });
    await cargarDatosIniciales();
    renderVentas();
    document.getElementById('venta-cliente').value='';
    document.getElementById('venta-detalle').value='';
    document.getElementById('venta-monto').value='';
    alert('✓ Venta registrada correctamente.');
  } catch (err) {
    alert('No se pudo registrar la venta: ' + err.message);
  }
}

// ===== VENTA DE CELULARES =====
let celularesData = [];
let celCounter = 1;

function renderCelulares(data) {
  const vendidos  = data.length;
  const ingresos  = data.reduce((a,c)=>a+c.venta, 0);
  const ganancia  = data.reduce((a,c)=>a+(c.venta - c.compra), 0);

  const vEl = document.getElementById('cel-vendidos');
  const iEl = document.getElementById('cel-ingresos');
  const gEl = document.getElementById('cel-ganancia');
  const inv = document.getElementById('cel-inventario');

  if (vEl) vEl.textContent = vendidos;
  if (iEl) iEl.textContent = 'Bs ' + fmtMonto(ingresos);
  if (gEl) gEl.textContent = 'Bs ' + fmtMonto(ganancia);
  if (inv) inv.textContent = 0;

  const tbody = document.getElementById('celulares-body');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--gray-400);padding:24px">No se han registrado ventas de celulares aún</td></tr>';
    return;
  }

  tbody.innerHTML = [...data].reverse().map(c => `
    <tr>
      <td>${c.fecha}</td>
      <td>${c.modelo}</td>
      <td><code class="code-tag" style="font-size:10px">${c.imei||'—'}</code></td>
      <td>${c.estado}</td>
      <td>${c.cliente||'—'}</td>
      <td>Bs ${fmtMonto(c.compra)}</td>
      <td style="font-weight:600">Bs ${fmtMonto(c.venta)}</td>
      <td style="font-weight:600;color:${(c.venta-c.compra)>=0?'var(--success)':'var(--danger)'}">Bs ${fmtMonto(c.venta-c.compra)}</td>
      <td>${c.branch}</td>
    </tr>`).join('');
}

function filterCelulares(q) {
  const ql = q.toLowerCase();
  renderCelulares(celularesData.filter(c =>
    c.modelo.toLowerCase().includes(ql) ||
    (c.imei||'').toLowerCase().includes(ql) ||
    (c.cliente||'').toLowerCase().includes(ql)
  ));
}

function registrarVentaCelular() {
  const modelo  = document.getElementById('cel-modelo').value.trim();
  const imei    = document.getElementById('cel-imei').value.trim();
  const estado  = document.getElementById('cel-estado').value;
  const cliente = document.getElementById('cel-cliente').value.trim();
  const compra  = parseFloat(document.getElementById('cel-compra').value)||0;
  const venta   = parseFloat(document.getElementById('cel-venta').value)||0;
  const pago    = document.getElementById('cel-pago').value;
  const branch  = document.getElementById('cel-branch').value;

  if (!modelo || !venta) { alert('Complete al menos Marca/Modelo y Precio de venta.'); return; }

  celularesData.push({
    id: `CEL-${String(celCounter).padStart(3,'0')}`,
    modelo, imei, estado, cliente, compra, venta, pago, branch,
    fecha: nowDate(),
  });
  celCounter++;

  renderCelulares(celularesData);

  ['cel-modelo','cel-imei','cel-cliente','cel-compra','cel-venta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  alert('✓ Venta de celular registrada correctamente.');
}

// ===== CLIENTES =====
function renderClientes(data) {
  const tbody = document.getElementById('clientes-body');
  if (!tbody) return;
  tbody.innerHTML = data.map(c=>`
    <tr>
      <td><code class="code-tag" style="font-size:10px">${c.id}</code></td>
      <td>${c.name}</td>
      <td>${c.phone}</td>
      <td>${c.visits}</td>
      <td>${c.lastVisit}</td>
      <td>${c.branch}</td>
      <td>
        <button class="btn-sm btn-sm-primary" onclick="verRecibosCliente('${c.name}')">Recibos</button>
      </td>
    </tr>`).join('');
}

function filterClientes(q) {
  renderClientes(clientesData.filter(c=>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    c.phone.includes(q)
  ));
}

async function guardarCliente() {
  const name  = document.getElementById('new-cli-name').value.trim();
  const phone = document.getElementById('new-cli-phone').value.trim();
  const branch= document.getElementById('new-cli-branch').value;
  if (!name||!phone) { alert('Complete nombre y teléfono.'); return; }

  try {
    await apiCrearCliente({ name, phone, branch });
    closeModal();
    await cargarDatosIniciales();
    renderClientes(clientesData);
  } catch (err) {
    alert('No se pudo guardar el cliente: ' + err.message);
  }
}

function verRecibosCliente(nombre) {
  const recs = recibosData.filter(r=>r.cliente===nombre);
  if (recs.length===0) { alert(`El cliente "${nombre}" no tiene recibos generados aún.`); return; }
  if (recs.length===1) { mostrarVistaPrevia(recs[0]); return; }
  const lista = recs.map((r,i)=>`${i+1}. ${r.numRecibo} — ${r.servicio} — Bs ${fmtMonto(r.monto)} — ${r.fecha}`).join('\n');
  alert(`Recibos de ${nombre}:\n\n${lista}\n\nSe mostrará el más reciente.`);
  mostrarVistaPrevia(recs[recs.length-1]);
}

// ===== USUARIOS =====
function renderUsers() {
  const tbody = document.getElementById('users-body');
  if (!tbody) return;
  tbody.innerHTML = tecnicos.map(t=>`
    <tr>
      <td><code class="code-tag">${t.code}</code></td>
      <td><div class="avatar-cell"><div class="avatar">${initials(t.name)}</div>${t.name}</div></td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--gray-400)">${t.user}</td>
      <td>${t.rol==='Administrador'||t.rol==='Super Admin'?'<span class="badge badge-purple">'+t.rol+'</span>':'<span class="badge badge-amber">Técnico</span>'}</td>
      <td>${t.branch}</td>
      <td><span class="badge ${t.active?'badge-green':'badge-red'}">${t.active?'Activo':'Inactivo'}</span></td>
      <td><button class="btn-sm ${t.active?'':'btn-sm-primary'}" onclick="toggleActivoUsuario(${t._id})">${t.active?'Desactivar':'Activar'}</button></td>
    </tr>`).join('');
}

async function guardarUsuario() {
  const name     = document.getElementById('new-user-name').value.trim();
  const username = document.getElementById('new-user-username').value.trim();
  const email    = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value.trim();
  const rol      = document.getElementById('new-user-rol').value;
  const branch   = document.getElementById('new-user-branch').value;

  if (!name || !username || !email || !password) {
    alert('Complete nombre, usuario, correo y contraseña.');
    return;
  }

  try {
    await apiCrearUsuario({ name, username, email, password, rol, branch });
    await cargarDatosIniciales();
    renderUsers();
    populateTechSelects();
    ['new-user-name','new-user-username','new-user-email','new-user-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    alert('✓ Usuario creado correctamente. Ya puede iniciar sesión.');
  } catch (err) {
    alert('No se pudo crear el usuario: ' + err.message);
  }
}

async function toggleActivoUsuario(id) {
  const t = tecnicos.find(x => x._id === id);
  if (!t) return;

  const accion = t.active ? 'desactivar' : 'activar';
  if (!confirm(`¿Seguro que quieres ${accion} a "${t.name}"?`)) return;

  try {
    await apiToggleActivoUsuario(id);
    await cargarDatosIniciales();
    renderUsers();
    populateTechSelects();
  } catch (err) {
    alert('No se pudo actualizar el usuario: ' + err.message);
  }
}

// ===== REPORTES =====
function renderReportTech() {
  const tbody = document.getElementById('report-tech-body');
  if (!tbody) return;
  tbody.innerHTML = reporteTecnicosData.map(r=>`
    <tr>
      <td><code class="code-tag">${r.code}</code></td>
      <td><div class="avatar-cell"><div class="avatar">${initials(r.name)}</div>${r.name}</div></td>
      <td>${r.ordenes_completadas}</td>
      <td style="font-weight:600">Bs ${fmtMonto(r.ingresos)}</td>
      <td style="font-weight:600;color:var(--success)">Bs ${fmtMonto(r.comision)}</td>
      <td>${r.branch}</td>
    </tr>`).join('');
}

// ===== RECIBOS =====
function populateReciboOrden() {
  const sel = document.getElementById('recibo-orden');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Seleccione una orden —</option>' +
    ordersData.map(o=>`<option value="${o.code}">${o.code} — ${o.client} · ${o.device}</option>`).join('');
}

function precargarRecibo(code) {
  if (!code) return;
  const o = ordersData.find(x=>x.code===code);
  if (!o) return;
  document.getElementById('recibo-cliente').value  = o.client;
  document.getElementById('recibo-telefono').value = o.phone||'';
  document.getElementById('recibo-equipo').value   = o.device;
  document.getElementById('recibo-servicio').value = o.service;
  document.getElementById('recibo-monto').value    = o.monto||'';
  document.getElementById('recibo-obs').value      = o.obs||'Garantía de 30 días por el servicio realizado.';
  const ts = document.getElementById('recibo-tech');
  if (ts) for(let i=0;i<ts.options.length;i++) if(ts.options[i].value===o.techCode){ts.selectedIndex=i;break;}
  const ss = document.getElementById('recibo-sucursal');
  if (ss) for(let i=0;i<ss.options.length;i++) if(o.branch.includes(ss.options[i].text)){ss.selectedIndex=i;break;}
}

async function generarRecibo() {
  const cliente  = document.getElementById('recibo-cliente').value.trim();
  const telefono = document.getElementById('recibo-telefono').value.trim();
  const equipo   = document.getElementById('recibo-equipo').value.trim();
  const servicio = document.getElementById('recibo-servicio').value.trim();
  const monto    = parseFloat(document.getElementById('recibo-monto').value)||0;
  const pago     = document.getElementById('recibo-pago').value;
  const sucursal = document.getElementById('recibo-sucursal').value;
  const obs      = document.getElementById('recibo-obs').value.trim();
  const tipo     = document.getElementById('recibo-tipo').value;
  const ordenCode= document.getElementById('recibo-orden').value;
  if (!cliente||!equipo||!servicio||!monto) { alert('Complete: Cliente, Equipo, Servicio y Monto.'); return; }

  const orden = ordersData.find(o=>o.code===ordenCode);

  try {
    const nuevo = await apiCrearRecibo({
      orden_id: orden ? orden._id : null,
      cliente, telefono, equipo, servicio, monto, pago, sucursal, obs, tipo,
    });
    await cargarDatosIniciales();
    renderRecibosHistorial();
    populateReciboOrden();
    limpiarFormRecibo();
    const recibo = recibosData.find(r=>r._id===nuevo.id) || recibosData[0];
    mostrarVistaPrevia(recibo);
  } catch (err) {
    alert('No se pudo generar el recibo: ' + err.message);
  }
}

function renderRecibosHistorial() {
  const tbody = document.getElementById('recibos-body');
  const count = document.getElementById('recibo-count');
  if (count) count.textContent = `${recibosData.length} recibo${recibosData.length!==1?'s':''}`;
  if (!tbody) return;

  if (!recibosData.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--gray-400);padding:24px">No se han generado recibos aún</td></tr>';
    return;
  }
  tbody.innerHTML = [...recibosData].reverse().map(r=>`
    <tr>
      <td><code class="code-tag">${r.numRecibo}</code></td>
      <td><code class="code-tag" style="font-size:10px">${r.orden}</code></td>
      <td>${r.cliente}</td>
      <td>${r.servicio}</td>
      <td style="font-weight:600">Bs ${fmtMonto(r.monto)}</td>
      <td>${r.pago}</td>
      <td>${getTech(r.techCode).name}</td>
      <td>${r.hora}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-sm" onclick='editarRecibo("${r.numRecibo}")'>Editar</button>
        <button class="btn-sm btn-sm-primary" onclick='mostrarVistaPrevia(${JSON.stringify(r)})'>Ver</button>
      </td>
    </tr>`).join('');
}

function mostrarVistaPrevia(recibo) {
  const tech = getTech(recibo.techCode);
  const previewEl = document.getElementById('recibo-preview');
  if (!previewEl) return;

  previewEl.innerHTML = `
    <div style="border:2px solid #e5e7eb;border-radius:8px;padding:24px;font-size:13px;line-height:1.9">
      <div style="text-align:center;margin-bottom:18px;border-bottom:2px dashed #e5e7eb;padding-bottom:16px">
        <div style="font-size:24px;font-weight:700;color:#ff1440;letter-spacing:2px">MICEL</div>
        <div style="font-size:11px;color:#6b7280">Servicio técnico especializado en dispositivos móviles</div>
        <div style="font-size:11px;color:#6b7280">Sucursal: ${recibo.sucursal} · El Alto, Bolivia</div>
        <div style="font-size:11px;color:#6b7280">Tel: 13245698 · miceltech@gmail.com</div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;font-weight:600;letter-spacing:.05em">${recibo.tipo}</div>
          <div style="font-size:20px;font-weight:700;color:#111827">${recibo.numRecibo}</div>
        </div>
        <div style="text-align:right;font-size:12px">
          <div style="color:#9ca3af">Fecha: <strong style="color:#374151">${recibo.fecha}</strong></div>
          <div style="color:#9ca3af">Hora: <strong style="color:#374151">${recibo.hora}</strong></div>
          <div style="color:#9ca3af">Orden: <strong style="color:#374151">${recibo.orden}</strong></div>
        </div>
      </div>
      <div style="background:#f9fafb;border-radius:6px;padding:12px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Datos del cliente</div>
        <div><strong>Cliente:</strong> ${recibo.cliente}</div>
        ${recibo.telefono&&recibo.telefono!=='—'?`<div><strong>Teléfono:</strong> ${recibo.telefono}</div>`:''}
        <div><strong>Equipo:</strong> ${recibo.equipo}</div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Detalle del servicio</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:8px;text-align:left;font-size:11px;border-radius:4px 0 0 0">Descripción</th>
            <th style="padding:8px;text-align:right;font-size:11px;border-radius:0 4px 0 0">Importe</th>
          </tr></thead>
          <tbody><tr>
            <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6">${recibo.servicio}</td>
            <td style="padding:10px 8px;text-align:right;border-bottom:1px solid #f3f4f6">Bs ${fmtMonto(recibo.monto)}</td>
          </tr></tbody>
          <tfoot><tr style="font-weight:700">
            <td style="padding:10px 8px;color:#ff1440;font-size:14px">TOTAL</td>
            <td style="padding:10px 8px;text-align:right;font-size:18px;color:#ff1440">Bs ${fmtMonto(recibo.monto)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#4b5563;margin-bottom:12px;background:#f9fafb;padding:10px;border-radius:6px">
        <div>💳 <strong>Pago:</strong> ${recibo.pago}</div>
        <div>🔧 <strong>Técnico:</strong> ${tech.name} (${tech.code})</div>
      </div>
      ${recibo.obs?`<div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:10px;font-size:12px;color:#713f12;margin-bottom:14px">⚠️ <strong>Garantía / Nota:</strong> ${recibo.obs}</div>`:''}
      <div style="text-align:center;border-top:2px dashed #e5e7eb;padding-top:14px;font-size:11px;color:#9ca3af">
        Gracias por su confianza en MiCel 🙏<br>
        Conserve este recibo como comprobante del servicio realizado.
      </div>
    </div>`;
  document.getElementById('modal-recibo').classList.remove('hidden');
}

function imprimirRecibo() {
  const contenido = document.getElementById('recibo-preview').innerHTML;
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Recibo MiCel</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',sans-serif;padding:30px;max-width:500px;margin:auto;color:#1f2937}@media print{body{padding:10px}}</style>
    </head><body>${contenido}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function limpiarFormRecibo() {
  ['recibo-num','recibo-cliente','recibo-telefono','recibo-equipo','recibo-servicio','recibo-monto','recibo-obs'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const so=document.getElementById('recibo-orden'); if(so) so.selectedIndex=0;
}

// ===== MODALES =====
function openModal(tipo) {
  document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.add('hidden'));
  const map = {
    'orden':          'modal',
    'editar-orden':   'modal-editar-orden',
    'repuesto':       'modal-repuesto',
    'editar-repuesto':'modal-editar-repuesto',
    'ajuste-stock':   'modal-ajuste-stock',
    'venta':          'modal-venta',
    'cliente':        'modal-cliente',
    'recibo-manual':  'modal-recibo',
    'estado-orden':   'modal-estado',
    'editar-recibo':  'modal-editar-recibo',
  };
  const id = map[tipo];
  if (id && document.getElementById(id)) document.getElementById(id).classList.remove('hidden');
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.add('hidden'));
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal();
});

// ===== CAMBIO RÁPIDO DE ESTADO =====
function cambiarEstado(code) {
  const o = ordersData.find(x => x.code === code);
  if (!o) return;
  document.getElementById('estado-order-code').textContent = o.code;
  document.getElementById('estado-order-info').textContent = `${o.client} · ${o.device}`;
  document.getElementById('estado-hidden-code').value = o.code;
  const ss = document.getElementById('estado-select');
  for (let i = 0; i < ss.options.length; i++) {
    if (ss.options[i].value === o.status) { ss.selectedIndex = i; break; }
  }
  document.getElementById('modal-estado').classList.remove('hidden');
}

async function guardarEstado() {
  const code   = document.getElementById('estado-hidden-code').value;
  const status = document.getElementById('estado-select').value;
  const o = ordersData.find(x => x.code === code);
  if (!o) return;

  try {
    await apiCambiarEstado(o._id, STATUS_LABEL_TO_VALUE[status] || 'recepcion');
    closeModal();
    await cargarDatosIniciales();
    renderOrders(ordersData);
    renderDashOrders();
  } catch (err) {
    alert('No se pudo cambiar el estado: ' + err.message);
  }
}

// ===== EDITAR RECIBO YA GENERADO =====
function editarRecibo(numRecibo) {
  const r = recibosData.find(x => x.numRecibo === numRecibo);
  if (!r) return;

  document.getElementById('edit-rec-num-display').textContent = numRecibo;
  document.getElementById('edit-rec-num').value       = r.numRecibo;
  document.getElementById('edit-rec-cliente').value   = r.cliente;
  document.getElementById('edit-rec-telefono').value  = r.telefono || '';
  document.getElementById('edit-rec-equipo').value    = r.equipo;
  document.getElementById('edit-rec-servicio').value  = r.servicio;
  document.getElementById('edit-rec-monto').value     = r.monto;
  document.getElementById('edit-rec-obs').value       = r.obs || '';

  const ps = document.getElementById('edit-rec-pago');
  for (let i = 0; i < ps.options.length; i++) {
    if (ps.options[i].value === r.pago) { ps.selectedIndex = i; break; }
  }
  const ss = document.getElementById('edit-rec-sucursal');
  for (let i = 0; i < ss.options.length; i++) {
    if (r.sucursal && r.sucursal.includes(ss.options[i].text)) { ss.selectedIndex = i; break; }
  }
  const ts = document.getElementById('edit-rec-tech');
  ts.innerHTML = tecnicos.filter(t => t.active)
    .map(t => `<option value="${t.code}" ${t.code === r.techCode ? 'selected' : ''}>${t.code} — ${t.name}</option>`)
    .join('');

  document.getElementById('modal-editar-recibo').classList.remove('hidden');
}

async function guardarEdicionRecibo() {
  const numRecibo = document.getElementById('edit-rec-num').value;
  const r = recibosData.find(x => x.numRecibo === numRecibo);
  if (!r) return;

  try {
    await apiEditarRecibo(r._id, {
      cliente: document.getElementById('edit-rec-cliente').value.trim(),
      telefono: document.getElementById('edit-rec-telefono').value.trim(),
      equipo: document.getElementById('edit-rec-equipo').value.trim(),
      servicio: document.getElementById('edit-rec-servicio').value.trim(),
      monto: parseFloat(document.getElementById('edit-rec-monto').value) || 0,
      pago: document.getElementById('edit-rec-pago').value,
      sucursal: document.getElementById('edit-rec-sucursal').value,
      obs: document.getElementById('edit-rec-obs').value.trim(),
    });
    closeModal();
    await cargarDatosIniciales();
    renderRecibosHistorial();
  } catch (err) {
    alert('No se pudo editar el recibo: ' + err.message);
  }
}