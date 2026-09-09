// ==========================================
// API.JS — Conexión con el backend Laravel (Postgres)
// Pegar ANTES de app.js en tu index.html:
// <script src="js/api.js"></script>
// <script src="js/app.js"></script>
// ==========================================

const API_BASE = 'http://micel.test/api'; // cambia esto si tu Herd usa otro dominio/puerto

// ===== Manejo del token (persiste al recargar la página) =====
function getToken() {
  return localStorage.getItem('micel_token');
}
function setToken(token) {
  localStorage.setItem('micel_token', token);
}
function clearToken() {
  localStorage.removeItem('micel_token');
  localStorage.removeItem('micel_user');
}

// ===== Fetch autenticado genérico =====
async function apiFetch(path, options = {}) {
  const token = getToken();

  // FIX 1: Si no hay token y la ruta no es el login, cancelamos la petición inmediatamente
  if (!token && path !== '/login') {
    return null;
  }

  const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // No forzar Content-Type si el body es FormData (ej. subir fotos)
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    options.body = JSON.stringify(options.body);
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // FIX 2: Si Laravel devuelve 401 (no autorizado), limpiamos el token y cancelamos
  if (res.status === 401) {
    clearToken();
    return null;
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Laravel manda los errores de validación en data.errors o data.message
    const mensaje = data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : 'Error en el servidor');
    throw new Error(mensaje);
  }

  return data;
}

// ===== AUTH =====
async function apiLogin(username, password) {
  const data = await apiFetch('/login', { method: 'POST', body: { username, password } });
  if (data && data.token) {
    setToken(data.token);
    localStorage.setItem('micel_user', JSON.stringify(data.user));
    return data.user;
  }
  throw new Error('No se pudo iniciar sesión');
}

async function apiLogout() {
  try { await apiFetch('/logout', { method: 'POST' }); } catch (e) { /* no pasa nada si ya expiró */ }
  clearToken();
}

function getUsuarioGuardado() {
  const raw = localStorage.getItem('micel_user');
  return raw ? JSON.parse(raw) : null;
}

// ===== STOCK =====
const apiGetStock       = () => apiFetch('/stock');
const apiAjustarStock   = (id, operacion, cantidad) => apiFetch(`/stock/${id}/ajuste`, { method: 'PATCH', body: { operacion, cantidad } });
const apiCrearRepuesto  = (payload) => apiFetch('/stock', { method: 'POST', body: payload });
const apiEditarRepuesto = (id, payload) => apiFetch(`/stock/${id}`, { method: 'PUT', body: payload });

// ===== ÓRDENES =====
const apiGetOrders        = () => apiFetch('/orders');
const apiCrearOrden       = (payload) => apiFetch('/orders', { method: 'POST', body: payload });
const apiEditarOrden      = (id, payload) => apiFetch(`/orders/${id}`, { method: 'PUT', body: payload });
const apiCambiarEstado    = (id, status) => apiFetch(`/orders/${id}/estado`, { method: 'PATCH', body: { status } });
const apiGetReporteTecnicos = () => apiFetch('/reportes/tecnicos');

// ===== CLIENTES =====
const apiGetClientes     = () => apiFetch('/clientes');
const apiCrearCliente    = (payload) => apiFetch('/clientes', { method: 'POST', body: payload });

// ===== VENTAS =====
const apiGetVentas = (opts = {}) => {
  const params = new URLSearchParams();
  if (opts.all) params.set('all', '1');
  if (opts.fecha) params.set('fecha', opts.fecha);
  const qs = params.toString();
  return apiFetch(qs ? `/ventas?${qs}` : '/ventas');
};
const apiCrearVenta      = (payload) => apiFetch('/ventas', { method: 'POST', body: payload });
const apiResumenVentas   = () => apiFetch('/ventas/resumen');

// ===== USUARIOS / TÉCNICOS =====
const apiGetUsuarios     = () => apiFetch('/usuarios');
const apiCrearUsuario    = (payload) => apiFetch('/usuarios', { method: 'POST', body: payload });
const apiEditarUsuario   = (id, payload) => apiFetch(`/usuarios/${id}`, { method: 'PUT', body: payload });
const apiToggleActivoUsuario = (id) => apiFetch(`/usuarios/${id}/activo`, { method: 'PATCH' });

// ===== RECIBOS =====
const apiGetRecibos      = () => apiFetch('/recibos');
const apiCrearRecibo     = (payload) => apiFetch('/recibos', { method: 'POST', body: payload });
const apiEditarRecibo    = (id, payload) => apiFetch(`/recibos/${id}`, { method: 'PUT', body: payload });

// ===== HISTORIAL =====
const apiGetHistorial    = () => apiFetch('/historial');
async function apiCrearHistorial(equipo, descripcion, fotoFile) {
  const form = new FormData();
  form.append('equipo', equipo);
  if (descripcion) form.append('descripcion', descripcion);
  if (fotoFile) form.append('foto', fotoFile);
  return apiFetch('/historial', { method: 'POST', body: form });
}

// ===== Mapeo de estados =====
const STATUS_LABEL_TO_VALUE = {
  'Recepción': 'recepcion',
  'Diagnóstico': 'diagnostico',
  'En proceso': 'en_proceso',
  'Listo': 'listo',
};