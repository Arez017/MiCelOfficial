// ==========================================
// API.JS — Cliente HTTP para MiCelOfficial
// ==========================================

// ⚠️ CAMBIA ESTA URL según tu entorno
const API_BASE = 'http://micel.test/api';
// const API_BASE = 'http://micelofficial.test/api';
// const API_BASE = 'https://tu-dominio.com/api';

const TOKEN_KEY = 'micel_token';
const USER_KEY  = 'micel_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function mapRol(rol) {
  const m = {
    superadmin: 'Super Admin',
    administrador: 'Administrador',
    tecnico: 'Técnico',
  };
  return m[rol] || rol;
}

function mapStatusLabel(status) {
  const m = {
    recepcion: 'Recepción',
    diagnostico: 'Diagnóstico',
    en_proceso: 'En proceso',
    listo: 'Listo',
  };
  return m[status] || status;
}

function mapStatusToApi(label) {
  const m = {
    'Recepción': 'recepcion',
    'Diagnóstico': 'diagnostico',
    'En proceso': 'en_proceso',
    'Listo': 'listo',
  };
  return m[label] || label;
}

async function api(path, options = {}) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearSession();
    window.location.reload();
    throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      (data && data.errors && Object.values(data.errors).flat().join('\n')) ||
      `Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const AuthAPI = {
  login: (username, password) =>
    api('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => api('/logout', { method: 'POST' }),
  me: () => api('/me'),
};

const OrdersAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/orders' + (q ? `?${q}` : ''));
  },
  get: (id) => api(`/orders/${id}`),
  create: (body) => api('/orders', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  cambiarEstado: (id, status) =>
    api(`/orders/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  crearRecibo: (id, body = {}) =>
    api(`/orders/${id}/recibo`, { method: 'POST', body: JSON.stringify(body) }),
  reporteTecnicos: () => api('/reportes/tecnicos'),
};

const StockAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/stock' + (q ? `?${q}` : ''));
  },
  create: (body) => api('/stock', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/stock/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  ajustar: (id, operacion, cantidad) =>
    api(`/stock/${id}/ajuste`, { method: 'PATCH', body: JSON.stringify({ operacion, cantidad }) }),
  destroy: (id) => api(`/stock/${id}`, { method: 'DELETE' }),
};

const ClientesAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/clientes' + (q ? `?${q}` : ''));
  },
  create: (body) => api('/clientes', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  destroy: (id) => api(`/clientes/${id}`, { method: 'DELETE' }),
};

const VentasAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/ventas' + (q ? `?${q}` : ''));
  },
  create: (body) => api('/ventas', { method: 'POST', body: JSON.stringify(body) }),
  resumenHoy: () => api('/ventas/resumen'),
};

const RecibosAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/recibos' + (q ? `?${q}` : ''));
  },
  create: (body) => api('/recibos', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/recibos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
};

const UsuariosAPI = {
  list: () => api('/usuarios'),
  create: (body) => api('/usuarios', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => api(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggleActivo: (id) => api(`/usuarios/${id}/activo`, { method: 'PATCH' }),
};

const CelularesAPI = {
  inventario: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/celulares/inventario' + (q ? `?${q}` : ''));
  },
  agregarInventario: (body) =>
    api('/celulares/inventario', { method: 'POST', body: JSON.stringify(body) }),
  ventas: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api('/celulares/ventas' + (q ? `?${q}` : ''));
  },
  vender: (body) =>
    api('/celulares/ventas', { method: 'POST', body: JSON.stringify(body) }),
  resumen: () => api('/celulares/resumen'),
  estadoCuenta: (q) => api('/celulares/estado-cuenta?q=' + encodeURIComponent(q)),
  pagarCuota: (cuotaId) =>
    api(`/cuotas/${cuotaId}/pagar`, { method: 'PATCH' }),
};

const SeguimientoAPI = {
  get: (codigo) => api(`/seguimiento/${encodeURIComponent(codigo)}`),
};
