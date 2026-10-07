// ==========================================
// EXTENSIONS.JS — MiCel v3.0 AddOns
// Requiere: data.js + app.js ya cargados
// ==========================================

// ===== SUPER ADMIN CONFIG =====
// El super admin es 'arez' — puede modificar TODO
const SUPER_ADMIN_USER = 'arez';

// ===== Compat API: lista de usuarios (antes venía de data.js) =====
function getUsuariosList() {
  if (window.usuarios && window.usuarios.length) return window.usuarios;
  if (typeof tecnicos !== 'undefined' && tecnicos && tecnicos.length) {
    return tecnicos.map(t => ({
      user: t.user || t.username,
      pass: '',
      techCode: t.code,
      name: t.name,
      rol: t.rol,
    }));
  }
  return [];
}

// ===== PERFILES EXTENDIDOS =====
let perfilesExtra = {};

function initPerfiles() {
  getUsuariosList().forEach(u => {
    const key = u.user || u.username || u.code;
    if (!key) return;
    if (!perfilesExtra[key]) {
      perfilesExtra[key] = {
        email: u.email || '',
        telefono: u.telefono || '',
        foto: null,
        isSuperAdmin: key === SUPER_ADMIN_USER,
      };
    }
  });
}

// ===== INIT EXTENDIDO =====
// Se llama DESPUÉS de initApp()
function initExtensions() {
  initPerfiles();
  extendNavConfig();
  extendSidebarFooter();
  extendUsuariosPanel();
  renderHistorial();
  initStockModal();
  // Poblar select de técnicos en el form historial
  const haTech = document.getElementById('ha-tech');
  if (haTech) {
    haTech.innerHTML = tecnicos.filter(t=>t.active)
      .map(t=>`<option value="${t.code}">${t.code} — ${t.name}</option>`).join('');
  }
  // Visibilidad nav
  adjustNavForRole();
}

// ===== EXTENDER NAV CONFIG =====
function extendNavConfig() {
  if (typeof navConfig !== 'undefined') {
    navConfig['historial']   = { title: 'Historial de reparaciones', sub: 'Registro fotográfico y técnico con QR',      btn: '+ Agregar entrada' };
    navConfig['mis-ordenes'] = { title: 'Mis órdenes',              sub: 'Órdenes asignadas a mi usuario',              btn: '' };
  }
}

// ===== AJUSTAR NAV SEGÚN ROL =====
function adjustNavForRole() {
  if (!currentUser) return;
  const navMisOrdenes = document.getElementById('nav-mis-ordenes');
  if (navMisOrdenes) {
    navMisOrdenes.style.display = currentUser.rol === 'Técnico' ? '' : 'none';
  }
  // Historial visible para todos
  const navHistorial = document.getElementById('nav-historial');
  if (navHistorial) navHistorial.style.display = '';
}

// ===== SIDEBAR FOOTER CLICKEABLE =====
function extendSidebarFooter() {
  const userInfo = document.querySelector('.sidebar-footer .user-info');
  if (userInfo && !userInfo.dataset.extended) {
    userInfo.style.cursor = 'pointer';
    userInfo.title = 'Editar mi perfil';
    userInfo.addEventListener('click', abrirPerfil);
    userInfo.dataset.extended = '1';
  }
}

// ===== PANEL USUARIOS EXTENDIDO =====
function extendUsuariosPanel() {
  if (!currentUser) return;
  const panel = document.getElementById('panel-usuarios');
  if (!panel) return;

  // Reemplazar header del card y tabla con versión mejorada
  const card = panel.querySelector('.card');
  if (!card || card.dataset.extended) return;
  card.dataset.extended = '1';

  const cardHeader = card.querySelector('.card-header');
  if (cardHeader) {
    // Botón de agregar: Admin y SuperAdmin pueden CREAR (la edición es solo SuperAdmin, ver renderUsersEnhanced)
    if (currentUser.rolRaw === 'administrador' || currentUser.rolRaw === 'superadmin') {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.style.fontSize = '12px';
      btn.innerHTML = '+ Nuevo usuario';
      btn.onclick = () => openModal('nuevo-usuario');
      cardHeader.appendChild(btn);
    }
  }

  // Actualizar render de usuarios para incluir acciones
  renderUsersEnhanced();
}

function renderUsersEnhanced() {
  const tbody = document.getElementById('users-body');
  if (!tbody) return;
  // SOLO SuperAdmin edita/activa-desactiva (así lo definimos en el backend).
  // Admin puede CREAR (botón arriba) pero no tocar cuentas ya existentes.
  const esSuperAdmin = currentUser && currentUser.rolRaw === 'superadmin';

  tbody.innerHTML = tecnicos.map(t => {
    const extra = perfilesExtra[t.user] || {};
    const rolBadge = t.rolRaw === 'superadmin'
      ? `<span class="superadmin-badge">⭐ Super Admin</span>`
      : t.rolRaw === 'administrador'
        ? `<span class="badge badge-purple">Administrador</span>`
        : `<span class="badge badge-amber">Técnico</span>`;
    const avatarHtml = extra.foto
      ? `<img src="${extra.foto}" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`
      : `<div class="avatar">${initials(t.name)}</div>`;

    let acciones = '';
    if (esSuperAdmin) {
      acciones = `
        <button class="btn-icon" title="Editar usuario" onclick="abrirEditarUsuario(${t.id})">✎</button>
        <button class="btn-icon danger" title="${t.active ? 'Desactivar' : 'Activar'}" onclick="toggleUsuarioActivo(${t.id})">
          ${t.active ? '⊘' : '✓'}
        </button>`;
    }

    return `<tr>
      <td><code class="code-tag">${t.code}</code></td>
      <td><div class="avatar-cell">${avatarHtml}${t.name}</div></td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--gray-400)">${t.user}</td>
      <td>${rolBadge}</td>
      <td>${t.branch}</td>
      <td><span class="badge ${t.active?'badge-green':'badge-red'}">${t.active?'Activo':'Inactivo'}</span></td>
      <td style="text-align:right">${acciones}</td>
    </tr>`;
  }).join('');
}

// ===== PERFIL DE USUARIO =====
function abrirPerfil() {
  if (!currentUser) return;
  const extra = perfilesExtra[currentUser.user] || {};
  const isSA  = currentUser.rolRaw === 'superadmin';
  const isAdmin = currentUser.rolRaw === 'administrador' || isSA;

  // Avatar display
  const avatarDisp = document.getElementById('perfil-avatar-display');
  const avatarIni  = document.getElementById('perfil-avatar-initials');
  if (extra.foto && avatarDisp) {
    // Mostrar imagen si tiene
    let img = avatarDisp.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      avatarDisp.insertBefore(img, avatarDisp.firstChild);
    }
    img.src = extra.foto;
    img.style.display = 'block';
    if (avatarIni) avatarIni.style.display = 'none';
  } else if (avatarIni) {
    avatarIni.textContent = initials(currentUser.name);
    avatarIni.style.display = '';
    const img = avatarDisp?.querySelector('img');
    if (img) img.style.display = 'none';
  }

  // Update also sidebar avatar
  updateSidebarAvatar();

  document.getElementById('perfil-display-name').textContent = currentUser.name;
  document.getElementById('perfil-display-role').textContent = currentUser.rol;
  document.getElementById('perfil-nombre').value    = currentUser.name;
  document.getElementById('perfil-email').value     = extra.email || '';
  document.getElementById('perfil-telefono').value  = extra.telefono || '';
  document.getElementById('perfil-pass-new').value  = '';
  document.getElementById('perfil-pass-confirm').value = '';

  // SuperAdmin badge
  const saBadge = document.getElementById('perfil-superadmin-badge');
  if (saBadge) saBadge.classList.toggle('hidden', !isSA);

  // Email editable: solo admins
  const emailInput = document.getElementById('perfil-email');
  if (emailInput) emailInput.readOnly = !isAdmin;

  // SuperAdmin: campos extra
  const saUserGroup = document.getElementById('perfil-sa-user-group');
  const saRolGroup  = document.getElementById('perfil-sa-rol-group');
  if (saUserGroup) saUserGroup.style.display = isSA ? '' : 'none';
  if (saRolGroup)  saRolGroup.style.display  = isSA ? '' : 'none';
  if (isSA) {
    const saUser = document.getElementById('perfil-sa-username');
    if (saUser) saUser.value = currentUser.user;
    const saRol = document.getElementById('perfil-sa-rol');
    if (saRol) saRol.value = currentUser.rol;
  }

  document.getElementById('modal-perfil').classList.remove('hidden');
}

function cambiarFotoPerfil(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;
    if (!perfilesExtra[currentUser.user]) perfilesExtra[currentUser.user] = {};
    perfilesExtra[currentUser.user].foto = data;

    // Actualizar display en modal
    const avatarDisp = document.getElementById('perfil-avatar-display');
    const avatarIni  = document.getElementById('perfil-avatar-initials');
    let img = avatarDisp?.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      avatarDisp.insertBefore(img, avatarDisp.firstChild);
    }
    img.src = data;
    img.style.display = 'block';
    if (avatarIni) avatarIni.style.display = 'none';

    updateSidebarAvatar();
  };
  reader.readAsDataURL(file);
}

function updateSidebarAvatar() {
  const extra = perfilesExtra[currentUser?.user] || {};
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (!sidebarAvatar) return;
  if (extra.foto) {
    sidebarAvatar.style.overflow = 'hidden';
    sidebarAvatar.style.padding = '0';
    sidebarAvatar.innerHTML = `<img src="${extra.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    sidebarAvatar.innerHTML = initials(currentUser.name);
  }
}

async function guardarPerfil() {
  if (!currentUser) return;
  const nombre      = document.getElementById('perfil-nombre').value.trim();
  const email       = document.getElementById('perfil-email').value.trim();
  const telefono    = document.getElementById('perfil-telefono').value.trim();
  const passActual  = document.getElementById('perfil-pass-actual').value;
  const passNew     = document.getElementById('perfil-pass-new').value;
  const passConfirm = document.getElementById('perfil-pass-confirm').value;

  if (!nombre) { alert('El nombre no puede estar vacío.'); return; }
  if (passNew && passNew !== passConfirm) { alert('Las contraseñas no coinciden.'); return; }
  if (passNew && !passActual) { alert('Escribe tu contraseña actual para poder cambiarla.'); return; }

  // NOTA: username y rol NO se pueden autoeditar (así lo decide el backend a
  // propósito) — eso se cambia desde el módulo de Usuarios, solo por un
  // SuperAdmin. Los campos perfil-sa-username/perfil-sa-rol quedaron sin uso.

  try {
    const actualizado = await ProfileAPI.update({ name: nombre, email, telefono });

    if (passNew) {
      const resp = await ProfileAPI.updatePassword({
        password_actual: passActual,
        password_nueva: passNew,
        password_nueva_confirmation: passConfirm,
      });
      // El backend cierra la sesión vieja al cambiar la contraseña — hay que
      // guardar el token nuevo que devuelve, o el siguiente request da 401.
      setSession(resp.token, { ...getStoredUser(), ...actualizado });
    } else {
      setSession(getToken(), { ...getStoredUser(), ...actualizado });
    }

    currentUser = normalizeUser(actualizado);
  } catch (e) {
    alert('No se pudo guardar el perfil: ' + e.message);
    return;
  }

  if (!perfilesExtra[currentUser.user]) perfilesExtra[currentUser.user] = {};
  perfilesExtra[currentUser.user].telefono = telefono;
  perfilesExtra[currentUser.user].email = email;

  // Actualizar currentUser
  currentUser.name = nombre;

  // Refrescar UI
  document.getElementById('sidebar-name').textContent = nombre;
  updateSidebarAvatar();
  closeModal();
  renderUsersEnhanced();

  // Toast feedback
  showToast('✓ Perfil actualizado correctamente');
}

// ===== Panel INLINE "Agregar nuevo usuario / técnico" (separado del modal) =====
// Mismo botón de "crear" que guardarNuevoUsuario(), pero leyendo los campos
// new-user-* del panel fijo en la página en vez de los nu-* del modal.
async function guardarUsuario() {
  const nombre      = document.getElementById('new-user-name').value.trim();
  const user        = document.getElementById('new-user-username').value.trim().toLowerCase();
  const email       = document.getElementById('new-user-email').value.trim();
  const pass        = document.getElementById('new-user-password').value.trim();
  const rol         = document.getElementById('new-user-rol').value; // ya viene en minúscula: tecnico/administrador
  const sucursal_id = document.getElementById('new-user-branch').value || null;

  if (!nombre || !user || !email || !pass) {
    alert('Complete: Nombre, Usuario, Correo y Contraseña.');
    return;
  }

  try {
    await UsuariosAPI.create({ name: nombre, username: user, email, password: pass, rol, sucursal_id });

    await loadUsuarios();
    populateTechSelects();
    renderUsersEnhanced();

    ['new-user-name', 'new-user-username', 'new-user-email', 'new-user-password'].forEach((id) => {
      document.getElementById(id).value = '';
    });

    showToast(`✓ Usuario "${nombre}" creado correctamente`);
  } catch (e) {
    alert('No se pudo crear el usuario: ' + e.message);
  }
}

// ===== NUEVO USUARIO (admin) — ahora sí contra la API real =====
const ROL_FORM_A_API = { 'Técnico': 'tecnico', 'Administrador': 'administrador' };

async function guardarNuevoUsuario() {
  const nombre      = document.getElementById('nu-nombre').value.trim();
  const user        = document.getElementById('nu-user').value.trim().toLowerCase();
  const pass        = document.getElementById('nu-pass').value.trim();
  const rolForm     = document.getElementById('nu-rol').value;
  const sucursal_id = document.getElementById('nu-branch').value || null;
  const email       = document.getElementById('nu-email').value.trim();
  const activo      = document.getElementById('nu-activo').value === 'true';

  if (!nombre || !user || !pass || !email) {
    alert('Complete: Nombre, Usuario, Contraseña y Correo.');
    return;
  }

  try {
    const nuevo = await UsuariosAPI.create({
      name: nombre,
      username: user,
      email,
      password: pass,
      rol: ROL_FORM_A_API[rolForm] || 'tecnico',
      sucursal_id,
    });

    if (!activo) await UsuariosAPI.toggleActivo(nuevo.id); // se crea activo por defecto en el backend

    perfilesExtra[user] = { email, telefono: '', foto: null, isSuperAdmin: false };

    await loadUsuarios();
    populateTechSelects();
    renderUsersEnhanced();
    closeModal();
    showToast(`✓ Usuario "${nombre}" creado correctamente`);
  } catch (e) {
    alert('No se pudo crear el usuario: ' + e.message);
  }
}

// ===== EDITAR USUARIO (SOLO superadmin) — ahora sí contra la API real =====
function abrirEditarUsuario(id) {
  const tec = tecnicos.find(t => t.id === id);
  if (!tec) return;
  const extra = perfilesExtra[tec.user] || {};

  document.getElementById('eu-code').value = id; // guardamos el ID real, no el username
  document.getElementById('eu-display-code').textContent = tec.code;
  document.getElementById('eu-nombre').value = tec.name;
  document.getElementById('eu-user').value   = tec.user;
  document.getElementById('eu-pass').value   = '';
  document.getElementById('eu-rol').value    = tec.rolRaw === 'administrador' ? 'Administrador' : 'Técnico';
  document.getElementById('eu-email').value  = extra.email || tec.email || '';
  document.getElementById('eu-activo').value = tec.active ? 'true' : 'false';

  const sel = document.getElementById('eu-branch');
  poblarSelectSucursal(sel, { conAmbas: true });
  sel.value = tec.sucursal_id ?? ''; // '' = "Ambas" (sin sucursal fija)

  document.getElementById('modal-editar-usuario').classList.remove('hidden');
}

async function guardarEdicionUsuario() {
  const id          = parseInt(document.getElementById('eu-code').value, 10);
  const nombre      = document.getElementById('eu-nombre').value.trim();
  const newUser     = document.getElementById('eu-user').value.trim().toLowerCase();
  const pass        = document.getElementById('eu-pass').value.trim();
  const rolForm     = document.getElementById('eu-rol').value;
  const sucursal_id = document.getElementById('eu-branch').value || null;
  const email       = document.getElementById('eu-email').value.trim();
  const activoForm  = document.getElementById('eu-activo').value === 'true';

  const tec = tecnicos.find(t => t.id === id);
  if (!tec) return;

  const payload = {
    name: nombre,
    username: newUser,
    email,
    rol: ROL_FORM_A_API[rolForm] || 'tecnico',
    sucursal_id,
  };
  if (pass) payload.password = pass; // solo se manda (y se resetea) si escribieron una nueva

  try {
    await UsuariosAPI.update(id, payload);

    // El estado activo/inactivo es un endpoint aparte — solo togglear si cambió
    if (activoForm !== tec.active) await UsuariosAPI.toggleActivo(id);

    if (!perfilesExtra[newUser]) perfilesExtra[newUser] = {};
    perfilesExtra[newUser] = { ...(perfilesExtra[tec.user] || {}), email };
    if (newUser !== tec.user) delete perfilesExtra[tec.user];

    await loadUsuarios();
    populateTechSelects();
    renderUsersEnhanced();
    closeModal();
    showToast(`✓ Usuario "${nombre}" actualizado`);
  } catch (e) {
    alert('No se pudo actualizar el usuario: ' + e.message);
  }
}

async function toggleUsuarioActivo(id) {
  const tec = tecnicos.find(t => t.id === id);
  if (!tec) return;
  if (!confirm(`¿${tec.active ? 'Desactivar' : 'Activar'} a ${tec.name}?`)) return;

  try {
    const actualizado = await UsuariosAPI.toggleActivo(id);
    await loadUsuarios();
    renderUsersEnhanced();
    showToast(`✓ Usuario ${actualizado.active ? 'activado' : 'desactivado'}`);
  } catch (e) {
    alert('No se pudo cambiar el estado: ' + e.message);
  }
}

// ===== MIS ÓRDENES (técnico) =====
function renderMisOrdenes() {
  if (!currentUser || currentUser.rol !== 'Técnico') return;
  const misOrdenes = ordersData.filter(o => o.techCode === currentUser.techCode);
  const enProceso  = misOrdenes.filter(o => o.status === 'En proceso' || o.status === 'Diagnóstico').length;
  const ingresos   = misOrdenes.reduce((a, o) => a + (o.monto || 0), 0);

  document.getElementById('mis-total-ordenes').textContent = misOrdenes.length;
  document.getElementById('mis-en-proceso').textContent    = enProceso;
  document.getElementById('mis-ingresos').textContent      = 'Bs ' + fmtMonto(ingresos);
  document.getElementById('mis-ordenes-title').textContent = `Mis órdenes — ${currentUser.name}`;
  document.getElementById('mis-ordenes-badge').textContent = `${misOrdenes.length} órdenes`;

  document.getElementById('mis-ordenes-body').innerHTML = misOrdenes.map(o => `
    <tr>
      <td><code class="code-tag">${o.code}</code></td>
      <td>${o.client}</td>
      <td>${o.device}</td>
      <td>${o.service}</td>
      <td>${o.branch}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="font-weight:600">${o.monto > 0 ? 'Bs ' + fmtMonto(o.monto) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>
        <button class="btn-sm" onclick="cambiarEstado('${o.code}')">Estado</button>
        <button class="btn-sm btn-sm-primary" onclick="verReciboOrden('${o.code}')">Recibo</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--gray-400)">No tienes órdenes asignadas</td></tr>';

  // Clientes únicos del técnico
  const clientesUnicos = [...new Map(misOrdenes.map(o => [o.client, o])).values()];
  document.getElementById('mis-clientes-body').innerHTML = clientesUnicos.map(o => `
    <tr>
      <td>${o.client}</td>
      <td>${o.device}</td>
      <td>${o.service}</td>
      <td style="font-weight:600">${o.monto > 0 ? 'Bs ' + fmtMonto(o.monto) : '—'}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${o.date}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gray-400)">Sin clientes registrados</td></tr>';
}

// ===== HISTORIAL =====
let historialData = [
  {
    id: 'H-001',
    titulo: 'Cambio de pantalla — Samsung A32',
    cliente: 'Juan Quispe',
    equipo: 'Samsung A32',
    servicio: 'Cambio de pantalla',
    techCode: 'TEC-03',
    branch: 'KevSolutions',
    desc: 'Pantalla original instalada. Cliente satisfecho. Garantía 30 días.',
    foto: null,
    fecha: '25/04/2026',
    hora: '14:30',
    qrData: 'MCTECH:H-001:OS-0041:Samsung A32:KevSolutions:Listo',
  },
  {
    id: 'H-002',
    titulo: 'Flasheo firmware — Huawei P30',
    cliente: 'Ana Flores',
    equipo: 'Huawei P30',
    servicio: 'Flasheo / Firmware',
    techCode: 'TEC-07',
    branch: 'Upea',
    desc: 'Firmware actualizado a versión estable. Sistema operativo limpio.',
    foto: null,
    fecha: '24/04/2026',
    hora: '11:15',
    qrData: 'MCTECH:H-002:OS-0038:Huawei P30:Upea:Listo',
  },
];
let historialCounter = 3;

function renderHistorial() {
  const grid  = document.getElementById('historial-grid');
  const empty = document.getElementById('historial-empty');
  if (!grid) return;

  const q      = (document.getElementById('historial-search')?.value || '').toLowerCase();
  const branch = document.getElementById('historial-filter-branch')?.value || '';
  const filtered = historialData.filter(h => {
    const matchQ = !q ||
      h.titulo.toLowerCase().includes(q) ||
      h.cliente.toLowerCase().includes(q) ||
      h.equipo.toLowerCase().includes(q) ||
      getTech(h.techCode).name.toLowerCase().includes(q);
    const matchB = !branch || h.branch === branch;
    return matchQ && matchB;
  });

  if (!filtered.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = filtered.map(h => {
    const tech = getTech(h.techCode);
    const imgHtml = h.foto
      ? `<img src="${h.foto}" alt="Foto reparación" style="width:100%;height:100%;object-fit:cover">`
      : `<div class="historial-img-placeholder">🔧</div>`;

    return `
    <div class="historial-card">
      <div class="historial-img-wrap">${imgHtml}</div>
      <div class="historial-card-body">
        <div class="historial-card-title">${h.titulo}</div>
        <div class="historial-card-meta">
          <span>📅 ${h.fecha}</span>
          <span>🕐 ${h.hora}</span>
          <span>📍 ${h.branch}</span>
        </div>
        ${h.desc ? `<div class="historial-card-desc">${h.desc}</div>` : ''}
      </div>
      <div class="historial-card-footer">
        <div class="avatar-cell">
          <div class="avatar">${initials(tech.name)}</div>
          <span style="font-size:12px;color:var(--gray-600)">${tech.name}</span>
        </div>
        <button class="btn-sm btn-sm-primary" onclick='mostrarQR(${JSON.stringify(h)})' title="Ver QR Flutter">
          QR
        </button>
      </div>
    </div>`;
  }).join('');

  // Renderizar QR minis
  filtered.forEach(h => {
    const canvas = document.getElementById(`qr-mini-${h.id}`);
    if (canvas && typeof QRCode !== 'undefined') {
      // Limpiar canvas
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        QRCode.toCanvas(canvas, h.qrData || h.id, { width: 36, margin: 0 }, () => {});
      } catch(e) {}
    }
  });
}

function filterHistorial(q) {
  renderHistorial();
}

function previewHistorialImg(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('ha-preview-img');
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    }
    const hidden = document.getElementById('ha-img-data');
    if (hidden) hidden.value = e.target.result;
  };
  reader.readAsDataURL(file);
}

function guardarHistorialEntry() {
  const titulo   = document.getElementById('ha-titulo').value.trim();
  const cliente  = document.getElementById('ha-cliente').value.trim();
  const equipo   = document.getElementById('ha-equipo').value.trim();
  const servicio = document.getElementById('ha-servicio').value.trim();
  const techCode = document.getElementById('ha-tech').value;
  const branch   = document.getElementById('ha-branch').value;
  const desc     = document.getElementById('ha-desc').value.trim();
  const foto     = document.getElementById('ha-img-data').value || null;

  if (!titulo) { alert('El título es obligatorio.'); return; }

  const id = `H-${String(historialCounter).padStart(3, '0')}`;
  historialCounter++;

  const entry = {
    id,
    titulo,
    cliente,
    equipo,
    servicio,
    techCode,
    branch,
    desc,
    foto,
    fecha: nowDate(),
    hora: nowTime(),
    qrData: `MCTECH:${id}:${equipo}:${branch}:${new Date().toISOString()}`,
  };

  historialData.unshift(entry);
  closeModal();
  renderHistorial();
  showToast('✓ Entrada agregada al historial');

  // Limpiar form
  ['ha-titulo','ha-cliente','ha-equipo','ha-servicio','ha-desc'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const prev = document.getElementById('ha-preview-img');
  if (prev) { prev.src = ''; prev.style.display = 'none'; }
  const hidden = document.getElementById('ha-img-data');
  if (hidden) hidden.value = '';
}

// ===== QR MODAL =====
function mostrarQR(entry) {
  document.getElementById('qr-entry-title').textContent = entry.titulo || entry.id;
  document.getElementById('qr-entry-sub').textContent   = `${entry.fecha} · ${entry.branch}`;
  document.getElementById('qr-entry-data').textContent  = entry.qrData;

  const container = document.getElementById('qr-canvas-container');
  container.innerHTML = '';

  const div = document.createElement('div');
  div.id = 'qr-gen-div';
  container.appendChild(div);

  new QRCode(div, {
    text: entry.qrData || entry.id,
    width: 180,
    height: 180,
    colorDark: '#be1f1f',
    colorLight: '#eef590',
  });

  document.getElementById('modal-qr').classList.remove('hidden');
}

function descargarQR() {
  const img = document.querySelector('#qr-canvas-container img');
  if (!img) return;
  const a = document.createElement('a');
  a.download = 'qr- mctech.png';
  a.href = img.src;
  a.click();
}

// ===== STOCK MODAL MEJORADO =====
let stockDetailId = null;
let stockModalCatFilter  = 'all';
let stockModalStatusFilter = 'all';
let stockModalSearchQ = '';

function initStockModal() {
  // Override del botón Stock en nav para abrir el modal grande
  const origTopAction = window.topAction;
  window.topAction = function(id) {
    if (id === 'stock') {
      abrirStockModal();
    } else {
      origTopAction(id);
    }
  };
  // Override del nav para stock
  const navStock = document.querySelector('.nav-item[onclick*="stock"]');
  if (navStock) {
    navStock.onclick = function() {
      nav('stock', this);
      setTimeout(abrirStockModal, 50);
    };
  }
}

function abrirStockModal() {
  renderStockModal();
  document.getElementById('modal-stock-detail').classList.remove('hidden');
}

function renderStockModal() {
  // Categorías
  const cats = ['all', ...new Set(stockData.map(s => s.cat))];
  const sidebar = document.getElementById('stock-modal-sidebar');
  if (sidebar) {
    sidebar.innerHTML = cats.map(cat => {
      const count = cat === 'all' ? stockData.length : stockData.filter(s => s.cat === cat).length;
      return `<div class="stock-cat-item ${cat === stockModalCatFilter ? 'active' : ''}"
        data-cat="${cat}" onclick="filterStockModalCat('${cat}', this)">
        <span>${cat === 'all' ? 'Todos' : cat}</span>
        <span class="stock-cat-count" id="scat-${cat}">${count}</span>
      </div>`;
    }).join('');
  }

  // Items filtrados
  let items = stockData.filter(s => {
    const matchCat = stockModalCatFilter === 'all' || s.cat === stockModalCatFilter;
    const matchQ   = !stockModalSearchQ ||
      s.name.toLowerCase().includes(stockModalSearchQ) ||
      s.cat.toLowerCase().includes(stockModalSearchQ) ||
      s.id.toLowerCase().includes(stockModalSearchQ);
      const matchSt  = stockModalStatusFilter === 'low'  ||
      //(stockModalStatusFilter === 'ok'   && s.qty >= s.min) ||
      (stockModalStatusFilter === 'low'  && s.qty < s.min) ||
      (stockModalStatusFilter === 'zero' && s.qty === 0);
    return matchCat && matchQ && matchSt;
  });

  const count = document.getElementById('stock-modal-count');
  if (count) count.textContent = `${items.length} repuesto${items.length !== 1 ? 's' : ''}`;

  const grid = document.getElementById('stock-modal-grid');
  if (!grid) return;

  grid.innerHTML = items.map(s => {
    const pct   = Math.min(100, Math.round((s.qty / Math.max(s.min * 2, 1)) * 100));
    const color = stockColor(s.qty, s.min);
    const cardClass = s.qty === 0 ? 'critical' : s.qty < s.min ? 'low' : '';
    return `
    <div class="stock-item-card ${cardClass}" onclick="selectStockItem('${s.id}')">
      <div class="stock-item-id">${s.id}</div>
      <div class="stock-item-name">${s.name}</div>
      <div class="stock-qty-display">
        <span class="stock-qty-num" style="color:${color}">${s.qty}</span>
        <span class="stock-qty-label">unid.</span>
      </div>
      <div class="stock-item-bar">
        <div class="stock-item-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        ${stockBadge(s.qty, s.min)}
        <span style="font-size:11px;color:var(--gray-400)">Bs ${fmtMonto(s.precio)}</span>
      </div>
      <div class="stock-item-actions">
        <button class="btn-sm" onclick="event.stopPropagation();editarRepuesto('${s.id}')">Editar</button>
        <button class="btn-sm btn-sm-primary" onclick="event.stopPropagation();ajustarStock('${s.id}')">+/- Stock</button>
      </div>
    </div>`;
  }).join('') || `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray-400)">
    No se encontraron repuestos con esos filtros
  </div>`;
}

function selectStockItem(id) {
  stockDetailId = id;
  const s = stockData.find(x => x.id === id);
  if (!s) return;
  document.getElementById('sdp-qty').textContent    = s.qty;
  document.getElementById('sdp-min').textContent    = s.min;
  document.getElementById('sdp-precio').textContent = 'Bs ' + fmtMonto(s.precio);
  document.getElementById('sdp-name').textContent   = s.name;
  document.getElementById('stock-detail-panel').classList.add('open');
}

function filterStockModalCat(cat, el) {
  stockModalCatFilter = cat;
  document.querySelectorAll('.stock-cat-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  renderStockModal();
}

function filterStockModal(q) {
  stockModalSearchQ = q.toLowerCase();
  renderStockModal();
}

function filterStockModalStatus(v) {
  stockModalStatusFilter = v;
  renderStockModal();
}

// ===== TOPBAR ACTION EXTENDED (usuarios) =====
(function extendTopActionForUsuarios() {
  const origTopAction = window.topAction;
  window.topAction = function(id) {
    if (id === 'usuarios') {
      if (currentUser && (currentUser.rol === 'Administrador' || currentUser.user === SUPER_ADMIN_USER)) {
        openModal('nuevo-usuario');
      }
    } else {
      origTopAction(id);
    }
  };
})();

// ===== EXTENDED NAV (to handle historial + mis-ordenes) =====
(function extendNav() {
  const origNav = window.nav;
  window.nav = function(id, el) {
    origNav(id, el);
    if (id === 'mis-ordenes') {
      renderMisOrdenes();
    }
    if (id === 'historial') {
      renderHistorial();
    }
    if (id === 'usuarios') {
      renderUsersEnhanced();
    }
  };
})();

// ===== EXTENDED OPEN MODAL =====
(function extendOpenModal() {
  const origOpenModal = window.openModal;
  window.openModal = function(tipo) {
    origOpenModal(tipo);
    const extra = {
      'nuevo-usuario': 'modal-nuevo-usuario',
      'editar-usuario': 'modal-editar-usuario',
      'historial-add': 'modal-historial-add',
      'qr': 'modal-qr',
    };
    const id = extra[tipo];
    if (id) {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      document.getElementById(id)?.classList.remove('hidden');
    }
  };
})();

// ===== TOAST NOTIFICATION =====
function showToast(msg, type = 'success') {
  let toast = document.getElementById('ext-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ext-toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:9999;
      padding:12px 20px; border-radius:8px; font-size:13px; font-weight:500;
      box-shadow:0 8px 24px rgba(0,0,0,0.15); transition:all 0.3s;
      max-width:320px; font-family: var(--font);
    `;
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'success' ? '#0e9f6e' : '#e02424';
  toast.style.color = 'white';
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
  }, 3000);
}

// ===== HOOK INTO initApp =====
// Espera a que termine el initApp async (carga API) y luego extiende la UI
const _origInitApp = window.initApp;
window.initApp = async function() {
  if (typeof _origInitApp === 'function') {
    await _origInitApp();
  }
  if (!window.usuarios || !window.usuarios.length) {
    window.usuarios = getUsuariosList();
  }
  try {
    initExtensions();
  } catch (e) {
    console.warn('initExtensions:', e);
  }
};
