/**
 * Panel CuotaLock — cobranzas / bloqueo de equipos a crédito
 * Consume la API Laravel (celulares ventas + cuotas + dispositivo).
 */
(function () {
  let _creditos = [];

  async function apiCuota(path, opts) {
    if (typeof api === 'function') return api(path, opts);
    const token = localStorage.getItem('micel_token');
    const base = (typeof API_BASE !== 'undefined' ? API_BASE : '/api').replace(/\/$/, '');
    const res = await fetch(base + path, {
      ...opts,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(opts && opts.headers),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || res.statusText || 'Error API');
    return data;
  }

  window.loadCuotaLock = async function loadCuotaLock() {
    const tbody = document.getElementById('cuotalock-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--gray-400)">Cargando créditos…</td></tr>';
    try {
      // Preferir endpoint dedicado; fallback a ventas de celulares a crédito
      let list = [];
      try {
        list = await apiCuota('/cuotalock/creditos');
      } catch (_) {
        const ventas = await apiCuota('/celulares/ventas').catch(() => []);
        list = (ventas || []).filter((v) => {
          const p = String(v.tipo_pago || v.pago || v.metodo || '').toLowerCase();
          return p.includes('credit') || p.includes('cuota') || v.plan_pago_id || v.tiene_cuotas;
        });
      }
      _creditos = Array.isArray(list) ? list : (list.data || []);
      renderCuotaLock(_creditos);
    } catch (e) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:20px;color:#f87171">Error: ' +
        (e.message || e) +
        '<br><small>¿Rutas /cuotalock o /celulares/ventas activas?</small></td></tr>';
    }
  };

  function renderCuotaLock(rows) {
    const tbody = document.getElementById('cuotalock-body');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--gray-400)">No hay ventas a crédito registradas</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const id = r.id;
        const cliente = r.cliente_nombre || r.cliente || r.client || '—';
        const modelo = r.modelo || r.device || '—';
        const imei = r.imei || r.device_imei || '—';
        const estadoDisp = (r.estado_dispositivo || r.lock_status || 'activo').toLowerCase();
        const bloqueado = estadoDisp.includes('bloque');
        const cuota = r.cuota_pendiente || r.next_cuota || r.monto_cuota || '—';
        const vence = r.proxima_vencimiento || r.vence || r.fecha_vencimiento || '—';
        const badge = bloqueado
          ? '<span class="badge badge-red">Bloqueado</span>'
          : '<span class="badge badge-green">Activo</span>';
        return (
          '<tr>' +
          '<td><code class="code-tag">' +
          (r.code || r.codigo || id) +
          '</code></td>' +
          '<td>' +
          cliente +
          '</td>' +
          '<td>' +
          modelo +
          '</td>' +
          '<td style="font-family:monospace;font-size:12px">' +
          imei +
          '</td>' +
          '<td>' +
          badge +
          '</td>' +
          '<td>' +
          cuota +
          '</td>' +
          '<td>' +
          vence +
          '</td>' +
          '<td style="white-space:nowrap">' +
          '<button type="button" class="btn-sm btn-sm-primary" onclick="cuotaLockPagar(' +
          id +
          ')">Pagar cuota</button> ' +
          (bloqueado
            ? '<button type="button" class="btn-sm btn-sm-primary" onclick="cuotaLockDesbloquear(' +
              id +
              ')">Desbloquear</button>'
            : '<button type="button" class="btn-sm btn-sm-danger" onclick="cuotaLockBloquear(' +
              id +
              ')">Bloquear</button>') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  window.cuotaLockPagar = async function (ventaId) {
    const monto = prompt('Monto pagado de la cuota (Bs):');
    if (monto === null) return;
    try {
      await apiCuota('/cuotalock/ventas/' + ventaId + '/pagar-cuota', {
        method: 'POST',
        body: JSON.stringify({ monto: parseFloat(monto) || 0 }),
      });
      if (typeof showToast === 'function') showToast('✓ Cuota registrada — dispositivo puede desbloquearse');
      loadCuotaLock();
    } catch (e) {
      // fallback genérico cuotas
      try {
        await apiCuota('/cuotas/pagar', {
          method: 'POST',
          body: JSON.stringify({ celular_venta_id: ventaId, monto: parseFloat(monto) || 0 }),
        });
        if (typeof showToast === 'function') showToast('✓ Cuota registrada');
        loadCuotaLock();
      } catch (e2) {
        if (typeof showToast === 'function') showToast(e2.message || e.message, 'error');
      }
    }
  };

  window.cuotaLockBloquear = async function (ventaId) {
    if (!confirm('¿Forzar bloqueo del equipo en CuotaLock?')) return;
    try {
      await apiCuota('/cuotalock/ventas/' + ventaId + '/bloquear', { method: 'POST', body: '{}' });
      if (typeof showToast === 'function') showToast('Equipo marcado como bloqueado');
      loadCuotaLock();
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message, 'error');
    }
  };

  window.cuotaLockDesbloquear = async function (ventaId) {
    if (!confirm('¿Desbloquear equipo?')) return;
    try {
      await apiCuota('/cuotalock/ventas/' + ventaId + '/desbloquear', { method: 'POST', body: '{}' });
      if (typeof showToast === 'function') showToast('Equipo desbloqueado');
      loadCuotaLock();
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message, 'error');
    }
  };

  // Hook nav
  const _nav = window.nav;
  if (typeof _nav === 'function' && !_nav._cuotaHook) {
    window.nav = function (id, el) {
      const r = _nav.apply(this, arguments);
      if (id === 'cuotalock') setTimeout(loadCuotaLock, 50);
      return r;
    };
    window.nav._cuotaHook = true;
  }
})();
