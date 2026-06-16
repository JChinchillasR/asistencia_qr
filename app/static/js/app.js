// ============ ESTADO GLOBAL ============
const state = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    materias: [],
    grupos: {},
    scanner: null,
    ultimoScan: { codigo: '', tiempo: 0 },
};

// ============ API HELPER ============
async function api(path, options = {}) {
    if (path.endsWith('/') && path.length > 1) {
        path = path.slice(0, -1);
    }
    const currentToken = state.token || localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
        let errorDetail = "No autenticado";
        try { const errorData = await res.json(); errorDetail = errorData.detail || errorDetail; } catch (e) {}
        console.error("❌ El servidor rechazó la petición. Detalle:", errorDetail);
        logout(); 
        throw new Error(errorDetail); 
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error en la solicitud');
        return data;
    }
    if (!res.ok) throw new Error('Error en la solicitud');
    return res;
}

// ============ TOAST ============
function toast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('oculto');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('oculto'), duration);
}

// ============ UTILIDAD PARA OBTENER NOMBRE DE ARCHIVO ============
function obtenerNombreArchivoDesdeHeaders(response) {
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^;"\n\r]+)"?/i);
        if (match && match[1]) {
            let filename = match[1].trim().replace(/["'\s_]+$/g, '');
            if (!filename.toLowerCase().endsWith('.zip')) filename += '.zip';
            return filename;
        }
    }
    return 'qrs_descargados.zip';
}

// ============ MODAL ============
function openModal(title, bodyHtml) {
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal').classList.remove('oculto');
}
function closeModal() {
    document.getElementById('modal').classList.add('oculto');
}
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-close') || e.target.id === 'modal') closeModal();
});

// ============ AUTH ============
document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.add('oculto');
    try {
        const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        state.token = data.access_token;
        state.user = data.user;
        localStorage.setItem('token', state.token);
        localStorage.setItem('user', JSON.stringify(state.user));
        iniciarApp();
    } catch (err) {
        errEl.textContent = err.message || 'Credenciales inválidas';
        errEl.classList.remove('oculto');
    }
});

function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    const loginScreen = document.getElementById('pantalla-login');
    if (loginScreen) { loginScreen.classList.remove('oculto'); loginScreen.style.display = 'flex'; }
    const appScreen = document.getElementById('app');
    if (appScreen) { appScreen.classList.remove('activa'); appScreen.style.display = 'none'; }
    const formLogin = document.getElementById('form-login');
    if (formLogin) formLogin.reset();
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.classList.add('oculto');
}

// ============ NAVEGACIÓN ============
document.getElementById('btn-menu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('abierto');
});
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
        e.preventDefault();
        cambiarVista(item.dataset.view);
        if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('abierto');
    });
});

function cambiarVista(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('activa'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (viewEl) viewEl.classList.add('activa');
    if (navEl) navEl.classList.add('active');
    if (view !== 'tomar-lista' && state.scanner) detenerScanner();
    if (view === 'mis-materias') cargarMaterias();
    if (view === 'grupos') cargarVistaGrupos();
    if (view === 'generar-qr') cargarVistaQR();
    if (view === 'reportes') cargarReporteHoy();
    if (view === 'usuarios') cargarUsuarios();
}

function iniciarApp() {
    const loginScreen = document.getElementById('pantalla-login');
    loginScreen.classList.add('oculto'); loginScreen.style.display = 'none';
    const appScreen = document.getElementById('app');
    appScreen.classList.add('activa'); appScreen.style.display = 'block';
    document.getElementById('user-name').textContent = state.user.full_name;
    if (state.user.role === 'admin') {
        const adminLink = document.querySelector('.nav-item.solo-admin');
        if (adminLink) adminLink.classList.remove('oculto');
    }
    cargarMateriasSelects();
    cambiarVista('tomar-lista');
}

// ============ MATERIAS ============
async function cargarMateriasSelects() {
    try {
        state.materias = await api('/api/materias');
        ['sel-materia-activa', 'sel-materia-qr'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = '<option value="">-- Selecciona --</option>' +
                state.materias.map(m => `<option value="${m.id}">${m.nombre} (${m.clave})</option>`).join('');
        });
        document.getElementById('sel-materia-activa').onchange = actualizarInfoGrupoActiva;
        document.getElementById('sel-materia-qr').onchange = cargarGruposQR;
    } catch (err) { toast('Error al cargar materias: ' + err.message); }
}

async function actualizarInfoGrupoActiva() {
    const materiaId = document.getElementById('sel-materia-activa').value;
    const info = document.getElementById('info-grupo-activa');
    if (!materiaId) { info.innerHTML = ''; return; }
    try {
        const materia = state.materias.find(m => m.id === parseInt(materiaId));
        if (!materia) return;
        const asignaciones = await api(`/api/materias/${materiaId}/asignaciones`);
        const todosLosGrupos = await api('/api/grupos');
        let html = `<div style="margin-top: 15px; padding: 15px; background: var(--bg-soft, #f8f9fa); border-radius: 8px; border: 1px solid var(--border);">`;
        html += `<strong style="color: var(--primary, #007bff); font-size: 15px;">📚 ${materia.nombre}</strong><br>`;
        if (materia.horarios && materia.horarios.length > 0) {
            html += `<div style="margin-top: 12px; display: flex; flex-direction: column; gap: 10px;">`;
            materia.horarios.forEach(h => {
                const gruposEnEsteHorario = asignaciones.filter(a => a.horario_materia_id === h.id).map(a => {
                    const g = todosLosGrupos.find(gr => gr.id === a.grupo_id);
                    return g ? g.nombre : 'Grupo desconocido';
                });
                const gruposText = gruposEnEsteHorario.length > 0 ? gruposEnEsteHorario.join(', ') : '<span style="color:var(--text-soft); font-style:italic;">Sin grupos asignados</span>';
                html += `<div style="background: white; padding: 10px 14px; border-radius: 6px; border: 1px solid var(--border); font-size: 14px;">
                    <div style="font-weight: 600; color: var(--primary, #007bff); margin-bottom: 4px;">🕒 ${h.descripcion}</div>
                    <div style="color: var(--text, #333);">👥 <strong>Grupos:</strong> ${gruposText}</div></div>`;
            });
            html += `</div>`;
        } else {
            html += `<div style="color: var(--text-soft); margin-top: 10px; font-size: 14px;">⚠️ Esta materia no tiene horarios definidos.</div>`;
        }
        html += `</div>`;
        info.innerHTML = html;
    } catch (err) { info.innerHTML = `<p class="alert alert-error" style="margin-top:10px;">Error: ${err.message}</p>`; }
}

async function cargarMaterias() {
    const cont = document.getElementById('lista-materias');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const materias = await api('/api/materias');
        if (!materias.length) { cont.innerHTML = '<p style="color:var(--text-soft)">No tienes materias. Crea la primera.</p>'; return; }
        cont.innerHTML = materias.map(m => {
            const horariosHtml = m.horarios && m.horarios.length > 0 
                ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">` + m.horarios.map(h => `<span style="background:var(--primary-light, #e3f2fd); color:var(--primary, #1976d2); padding:4px 10px; border-radius:6px; font-size:13px; font-weight:600;">🕒 ${h.descripcion}</span>`).join('') + `</div>`
                : `<div style="margin-top:8px; font-size:13px; color:var(--text-soft);">Sin horarios definidos</div>`;
            return `<div class="card" style="width: 100%; margin-bottom: 15px; padding: 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin:0; font-size: 1.2rem;">${m.nombre}</h3>
                        <div class="meta" style="font-size: 0.9rem; color: var(--text-soft); margin-top: 4px;">Clave: <strong>${m.clave}</strong> · Semestre: <strong>${m.semestre}</strong></div>
                        ${horariosHtml}
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="toggleDetalleMateria(${m.id}, '${m.nombre.replace(/'/g, "\\'")}')">👁️ Ver grupos</button>
                        <button class="btn btn-sm btn-primary" onclick="asignarGruposAMateria(${m.id}, '${m.nombre.replace(/'/g, "\\'")}')">⚙️ Asignar</button>
                        <button class="btn btn-sm btn-secondary" onclick="editarMateria(${m.id})">✏️ Editar</button>
                        <button class="btn btn-sm btn-danger" onclick="eliminarMateria(${m.id})">🗑️</button>
                    </div>
                </div>
                <div id="detalle-materia-${m.id}" style="display:none; margin-top:20px; border-top:1px solid var(--border); padding-top:15px;"><p style="color:var(--text-soft)">Cargando detalles...</p></div>
            </div>`;
        }).join('');
    } catch (err) { cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`; }
}

async function toggleDetalleMateria(materiaId, materiaNombre) {
    const cont = document.getElementById(`detalle-materia-${materiaId}`);
    const btn = document.querySelector(`button[onclick^="toggleDetalleMateria(${materiaId}"]`);
    if (cont.style.display !== 'none') { cont.style.display = 'none'; cont.innerHTML = ''; if (btn) btn.innerHTML = '👁️ Ver grupos'; return; }
    cont.style.display = 'block'; if (btn) btn.innerHTML = '🔼 Ocultar detalles'; cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const asignaciones = await api(`/api/materias/${materiaId}/asignaciones`);
        const todosLosGrupos = await api('/api/grupos');
        if (!asignaciones || asignaciones.length === 0) { cont.innerHTML = '<p style="color:var(--text-soft); font-style:italic; padding: 10px;">No hay grupos asignados a esta materia aún.</p>'; return; }
        const porHorario = {};
        asignaciones.forEach(a => {
            if (!porHorario[a.horario_desc]) porHorario[a.horario_desc] = [];
            const g = todosLosGrupos.find(gr => gr.id === a.grupo_id);
            porHorario[a.horario_desc].push(g ? g.nombre : 'Grupo desconocido');
        });
        let html = '<h4 style="margin: 0 0 10px 0; font-size: 15px;">📚 Grupos asignados por horario:</h4>';
        for (const [horario, grupos] of Object.entries(porHorario)) {
            html += `<div style="margin-bottom: 12px; padding: 12px; background: var(--bg-soft, #f8f9fa); border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-weight: 600; color: var(--primary, #007bff); margin-bottom: 6px; font-size: 14px;">🕒 ${horario}</div>
                <ul style="margin: 0; padding-left: 20px; color: var(--text, #333);">${grupos.map(g => `<li style="margin-bottom: 4px; font-size: 14px;">${g}</li>`).join('')}</ul></div>`;
        }
        cont.innerHTML = html;
    } catch (err) { cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`; }
}

async function editarMateria(id) {
    try {
        const m = state.materias.find(mat => mat.id === id);
        if (!m) return;
        const horariosTexto = m.horarios.map(h => h.descripcion).join('\n');
        openModal(`Editar materia: <strong>${m.nombre}</strong>`, `
            <form id="form-editar-materia">
                <label style="font-size:15px; font-weight:600;">Nombre</label><input type="text" name="nombre" value="${m.nombre}" required style="font-size:15px; padding:10px; width:100%;">
                <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Clave</label><input type="text" name="clave" value="${m.clave}" required style="font-size:15px; padding:10px; width:100%;">
                <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Semestre</label><input type="text" name="semestre" value="${m.semestre}" required style="font-size:15px; padding:10px; width:100%;">
                <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Horarios (uno por línea)</label><textarea name="horarios" rows="3" style="font-size:15px; padding:10px; width:100%; font-family:inherit;">${horariosTexto}</textarea>
                <div class="modal-actions" style="margin-top:20px;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Guardar</button>
                </div>
            </form>`);
        document.getElementById('form-editar-materia').onsubmit = async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const horariosArray = fd.get('horarios').split('\n').map(h => h.trim()).filter(h => h.length > 0);
            try {
                await api(`/api/materias/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: fd.get('nombre'), clave: fd.get('clave'), semestre: fd.get('semestre'), horarios: horariosArray }) });
                closeModal(); toast('✅ Materia actualizada'); cargarMaterias(); cargarMateriasSelects();
            } catch (err) { toast('❌ Error: ' + err.message); }
        };
    } catch (err) { toast('❌ Error: ' + err.message); }
}

async function asignarGruposAMateria(materiaId, materiaNombre) {
    try {
        const materia = state.materias.find(m => m.id === parseInt(materiaId));
        if (!materia) { toast('⚠️ Materia no encontrada.'); return; }
        const todosLosGrupos = await api('/api/grupos');
        const asignacionesActuales = await api(`/api/materias/${materiaId}/asignaciones`);
        if (!materia.horarios || materia.horarios.length === 0) { toast('⚠️ Primero agrega al menos un horario a esta materia.'); return; }
        let htmlHorarios = '';
        materia.horarios.forEach(horario => {
            htmlHorarios += `<h4 style="margin: 20px 0 10px 0; font-size: 16px; color: var(--primary, #007bff); border-bottom: 2px solid var(--border); padding-bottom: 5px;">🕒 ${horario.descripcion}</h4>`;
            const opcionesGrupo = (todosLosGrupos || []).map(g => {
                const estaAsignado = (asignacionesActuales || []).some(a => a.grupo_id === g.id && a.horario_materia_id === horario.id);
                return `<label style="display: flex; align-items: center; gap: 15px; padding: 12px 15px; margin: 8px 0; background: var(--bg-soft, #f8f9fa); border: 2px solid var(--border, #e0e0e0); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; font-size: 16px;" onmouseover="this.style.borderColor='var(--primary, #007bff)'; this.style.background='var(--primary-light, #e3f2fd)'" onmouseout="this.style.borderColor='var(--border, #e0e0e0)'; this.style.background='var(--bg-soft, #f8f9fa)'">
                    <input type="checkbox" class="check-asignacion-grupo" data-grupo="${g.id}" data-horario="${horario.id}" ${estaAsignado ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--primary, #007bff); flex-shrink: 0;"> <span>${g.nombre}</span></label>`;
            }).join('');
            htmlHorarios += opcionesGrupo || '<p style="color:var(--text-soft); font-size:14px; padding:10px;">No hay grupos creados.</p>';
        });
        openModal(`Asignar grupos a: <strong>${materiaNombre}</strong>`, `
            <div class="info-box" style="font-size:15px; margin-bottom:15px;">Selecciona qué grupo toma la materia en cada horario.</div>
            <form id="form-asignar-grupos-a-materia">
                <div style="max-height: 400px; overflow-y: auto; padding: 5px 10px;">${htmlHorarios}</div>
                <div class="modal-actions" style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Guardar</button>
                </div>
            </form>`);
        document.getElementById('form-asignar-grupos-a-materia').onsubmit = async e => {
            e.preventDefault();
            const asignaciones = Array.from(document.querySelectorAll('.check-asignacion-grupo:checked')).map(cb => ({ grupo_id: parseInt(cb.dataset.grupo), horario_materia_id: parseInt(cb.dataset.horario) }));
            toast('⏳ Guardando...');
            try {
                await api(`/api/materias/${materiaId}/asignaciones`, { method: 'POST', body: JSON.stringify({ asignaciones }) });
                closeModal(); toast('✅ Asignaciones guardadas'); actualizarInfoGrupoActiva();
            } catch (err) { toast('❌ Error: ' + err.message); }
        };
    } catch (err) { toast('❌ Error: ' + err.message); }
}

async function eliminarMateria(id) {
    if (!confirm('¿Eliminar esta materia?')) return;
    try { await api(`/api/materias/${id}`, { method: 'DELETE' }); toast('✅ Eliminada'); cargarMaterias(); cargarMateriasSelects(); } 
    catch (err) { toast('❌ Error: ' + err.message); }
}

document.getElementById('btn-nueva-materia').addEventListener('click', () => {
    openModal('Nueva materia', `
        <form id="form-nueva-materia">
            <label style="font-size:15px; font-weight:600;">Nombre</label><input type="text" name="nombre" required style="font-size:15px; padding:10px; width:100%;">
            <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Clave</label><input type="text" name="clave" required style="font-size:15px; padding:10px; width:100%;">
            <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Semestre</label><input type="text" name="semestre" required style="font-size:15px; padding:10px; width:100%;">
            <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Horarios (uno por línea)</label><textarea name="horarios" rows="3" style="font-size:15px; padding:10px; width:100%; font-family:inherit;"></textarea>
            <div class="modal-actions" style="margin-top:20px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Crear</button>
            </div>
        </form>`);
    document.getElementById('form-nueva-materia').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const horariosArray = fd.get('horarios').split('\n').map(h => h.trim()).filter(h => h.length > 0);
        try {
            await api('/api/materias', { method: 'POST', body: JSON.stringify({ nombre: fd.get('nombre'), clave: fd.get('clave'), semestre: fd.get('semestre'), horarios: horariosArray }) });
            closeModal(); toast('✅ Creada'); cargarMaterias(); cargarMateriasSelects();
        } catch (err) { toast('❌ Error: ' + err.message); }
    };
});

// ============ GRUPOS ============
async function cargarVistaGrupos() {
    const cont = document.getElementById('lista-grupos-globales');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const grupos = await api('/api/grupos');
        if (!grupos.length) { cont.innerHTML = '<p style="color:var(--text-soft)">No hay grupos creados.</p>'; return; }
        cont.innerHTML = grupos.map(g => `
            <div class="card" style="width: 100%; margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div><h3 style="margin:0;">${g.nombre}</h3></div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-sm btn-secondary" onclick="toggleDetalleGrupo(${g.id}, '${g.nombre.replace(/'/g, "\\'")}')">👥 Ver alumnos</button>
                        <button class="btn btn-sm btn-danger" onclick="eliminarGrupo(${g.id})">🗑️</button>
                    </div>
                </div>
                <div id="detalle-grupo-${g.id}" style="display:none; margin-top:15px; border-top:1px solid var(--border); padding-top:15px;"><p style="color:var(--text-soft)">Cargando...</p></div>
            </div>`).join('');
    } catch (err) { cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`; }
}

async function eliminarGrupo(id) {
    if (!confirm('¿Eliminar este grupo y a TODOS sus alumnos?')) return;
    try { await api(`/api/grupos/${id}`, { method: 'DELETE' }); toast('✅ Eliminado'); cargarVistaGrupos(); } 
    catch (err) { toast('❌ Error: ' + err.message); }
}

const btnNuevoGrupoGlobal = document.getElementById('btn-nuevo-grupo-global');
if (btnNuevoGrupoGlobal) {
    btnNuevoGrupoGlobal.addEventListener('click', () => {
        openModal('Nuevo Grupo', `
            <form id="form-nuevo-grupo-global">
                <label>Nombre del grupo</label><input type="text" name="nombre" required placeholder="Ej: Grupo 01">
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Crear</button>
                </div>
            </form>`);
        document.getElementById('form-nuevo-grupo-global').onsubmit = async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await api('/api/grupos', { method: 'POST', body: JSON.stringify({ nombre: fd.get('nombre'), horario: "" }) });
                closeModal(); toast('✅ Creado'); cargarVistaGrupos();
            } catch (err) { toast('❌ Error: ' + err.message); }
        };
    });
}

async function toggleDetalleGrupo(grupoId, nombreGrupo) {
    const cont = document.getElementById(`detalle-grupo-${grupoId}`);
    const btn = document.querySelector(`button[onclick^="toggleDetalleGrupo(${grupoId}"]`);
    if (cont.style.display !== 'none') { cont.style.display = 'none'; cont.innerHTML = ''; if (btn) btn.innerHTML = '👥 Ver alumnos'; return; }
    cont.style.display = 'block'; if (btn) btn.innerHTML = '🔼 Ocultar alumnos'; cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const grupo = await api(`/api/grupos/${grupoId}`);
        renderizarContenidoDetalle(grupoId, grupo);
    } catch (err) { cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`; }
}

function renderizarContenidoDetalle(grupoId, grupo) {
    const cont = document.getElementById(`detalle-grupo-${grupoId}`);
    const alumnosOrdenados = [...(grupo.alumnos || [])].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, 'es', { sensitivity: 'base' }));
    let materiasHtml = '<p style="color:var(--text-soft); font-size:13px;">Sin materias asignadas.</p>';
    const listaDetallada = grupo.materias_con_horario || [];
    if (listaDetallada.length > 0) {
        materiasHtml = `<div style="display:flex; flex-direction:column; gap:8px;">` + listaDetallada.map(m => `<span style="background:var(--bg-soft); padding:8px 10px; border-radius:8px; font-size:13px; border:1px solid var(--border); line-height: 1.4;">📚 <strong>${m.materia_nombre}</strong> <small>(${m.materia_clave})</small><br>🕒 <span style="color:var(--primary, #007bff); font-weight:600;">${m.horario_descripcion}</span></span>`).join('') + `</div>`;
    }
    let alumnosHtml = '<p style="color:var(--text-soft); font-size:13px;">Sin alumnos registrados.</p>';
    if (alumnosOrdenados.length > 0) {
        alumnosHtml = `<div class="table-wrap" style="margin-top:10px; max-height: 400px; overflow-y: auto;"><table><thead><tr><th>Matrícula</th><th>Nombre</th><th></th></tr></thead><tbody>${alumnosOrdenados.map(a => `<tr><td>${a.matricula}</td><td>${a.nombre_completo}</td><td><button class="btn btn-sm btn-secondary" onclick="verQRAlumno(${a.id})">QR</button> <button class="btn btn-sm btn-danger" onclick="eliminarAlumno(${a.id}, ${grupoId})">×</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    cont.innerHTML = `<div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
        <div><h4 style="margin-bottom:10px; font-size:15px;">👥 Alumnos (${alumnosOrdenados.length})</h4>${alumnosHtml}<div style="display:flex; gap:8px; margin-top:10px;"><button class="btn btn-sm btn-primary" onclick="nuevoAlumno(${grupoId})">+ Alumno</button><button class="btn btn-sm btn-secondary" onclick="nuevoAlumnoMasivo(${grupoId})">+ Varios</button></div></div>
        <div><h4 style="margin-bottom:10px; font-size:15px;">📚 Materias</h4>${materiasHtml}<button class="btn btn-sm btn-primary" style="margin-top:15px; width:100%;" onclick="asignarMateriasAGrupo(${grupoId}, '${grupo.nombre.replace(/'/g, "\\'")}')">+ Asignar Materia</button></div>
    </div>`;
}

function nuevoAlumno(grupoId) {
    openModal('Nuevo alumno', `<form id="form-nuevo-alumno"><label>Matrícula</label><input type="text" name="matricula" required><label>Nombre completo</label><input type="text" name="nombre_completo" required><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear</button></div></form>`);
    document.getElementById('form-nuevo-alumno').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/alumnos/', { method: 'POST', body: JSON.stringify({ grupo_id: grupoId, matricula: fd.get('matricula'), nombre_completo: fd.get('nombre_completo'), email: '' }) });
            closeModal(); toast('✅ Creado');
            const cont = document.getElementById(`detalle-grupo-${grupoId}`);
            if (cont && cont.style.display !== 'none') { cont.innerHTML = '<p style="color:var(--text-soft)">Actualizando...</p>'; api(`/api/grupos/${grupoId}`).then(grupo => renderizarContenidoDetalle(grupoId, grupo)); }
        } catch (err) { toast('❌ Error: ' + err.message); }
    };
}

function nuevoAlumnoMasivo(grupoId) {
    openModal('Añadir varios alumnos', `<div class="info-box">Formato: <code>matricula, nombre completo</code></div><form id="form-alumnos-masivo"><textarea name="data" rows="10" required placeholder="A001, Juan Pérez&#10;A002, María López"></textarea><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear todos</button></div></form>`);
    document.getElementById('form-alumnos-masivo').onsubmit = async e => {
        e.preventDefault();
        const alumnos = e.target.data.value.split('\n').map(l => {
            const partes = l.split(',').map(s => s.trim());
            return partes.length >= 2 ? { grupo_id: grupoId, matricula: partes[0], nombre_completo: partes.slice(1).join(' '), email: '' } : null;
        }).filter(Boolean);
        if (!alumnos.length) { toast('Formato inválido'); return; }
        try {
            await api(`/api/alumnos/bulk?grupo_id=${grupoId}`, { method: 'POST', body: JSON.stringify(alumnos) });
            closeModal(); toast(`✅ ${alumnos.length} procesados`);
            const cont = document.getElementById(`detalle-grupo-${grupoId}`);
            if (cont && cont.style.display !== 'none') { cont.innerHTML = '<p style="color:var(--text-soft)">Actualizando...</p>'; api(`/api/grupos/${grupoId}`).then(grupo => renderizarContenidoDetalle(grupoId, grupo)); }
        } catch (err) { toast('❌ Error: ' + err.message); }
    };
}

async function eliminarAlumno(id, grupoId) {
    if (!confirm('¿Eliminar este alumno?')) return;
    try {
        await api(`/api/alumnos/${id}`, { method: 'DELETE' }); toast('✅ Eliminado');
        const cont = document.getElementById(`detalle-grupo-${grupoId}`);
        if (cont && cont.style.display !== 'none') { cont.innerHTML = '<p style="color:var(--text-soft)">Actualizando...</p>'; api(`/api/grupos/${grupoId}`).then(grupo => renderizarContenidoDetalle(grupoId, grupo)); }
    } catch (err) { toast('❌ Error: ' + err.message); }
}

async function asignarMateriasAGrupo(grupoId, nombreGrupo) {
    try {
        const materias = await api('/api/materias');
        const grupo = await api(`/api/grupos/${grupoId}`);
        const horariosAsignados = new Set(grupo.horarios_asignados || []);
        let htmlHorarios = '';
        for (const m of (materias || [])) {
            if (!m.horarios || m.horarios.length === 0) continue;
            htmlHorarios += `<h4 style="margin: 20px 0 10px 0; font-size: 16px; color: var(--primary, #007bff); border-bottom: 2px solid var(--border); padding-bottom: 5px;">📚 ${m.nombre} (${m.clave})</h4>`;
            htmlHorarios += (m.horarios || []).map(h => {
                const isChecked = horariosAsignados.has(h.id) ? 'checked' : '';
                return `<label style="display: flex; align-items: center; gap: 15px; padding: 12px 15px; margin: 8px 0; background: var(--bg-soft, #f8f9fa); border: 2px solid var(--border, #e0e0e0); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; font-size: 16px;" onmouseover="this.style.borderColor='var(--primary, #007bff)'; this.style.background='var(--primary-light, #e3f2fd)'" onmouseout="this.style.borderColor='var(--border, #e0e0e0)'; this.style.background='var(--bg-soft, #f8f9fa)'">
                    <input type="checkbox" class="check-asignacion-materia" data-grupo="${grupoId}" data-horario="${h.id}" ${isChecked} style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--primary, #007bff); flex-shrink: 0;"> <span>🕒 ${h.descripcion}</span></label>`;
            }).join('') || '<p style="color:var(--text-soft); font-size:14px; padding:10px;">Sin horarios.</p>';
        }
        openModal(`Asignar materias a: <strong>${nombreGrupo}</strong>`, `
            <div class="info-box" style="font-size:15px; margin-bottom:15px;">Selecciona en qué horario participará este grupo.</div>
            <form id="form-asignar-materias-a-grupo">
                <div style="max-height: 400px; overflow-y: auto; padding: 5px 10px;">${htmlHorarios || '<p style="color:var(--text-soft); font-size:15px; padding:20px; text-align:center;">No hay materias con horarios.</p>'}</div>
                <div class="modal-actions" style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Guardar</button>
                </div>
            </form>`);
        document.getElementById('form-asignar-materias-a-grupo').onsubmit = async e => {
            e.preventDefault();
            toast('⏳ Guardando...');
            try {
                for (const cb of document.querySelectorAll('.check-asignacion-materia')) {
                    const horarioId = parseInt(cb.dataset.horario);
                    if (cb.checked) await api(`/api/grupos/${grupoId}/asignar-horario?horario_materia_id=${horarioId}`, { method: 'POST' }).catch(() => {});
                    else await api(`/api/grupos/${grupoId}/asignar-horario/${horarioId}`, { method: 'DELETE' }).catch(() => {});
                }
                closeModal(); toast('✅ Guardado');
                const grupoActualizado = await api(`/api/grupos/${grupoId}`);
                renderizarContenidoDetalle(grupoId, grupoActualizado);
            } catch (err) { toast('❌ Error: ' + err.message); }
        };
    } catch (err) { toast('❌ Error: ' + err.message); }
}

// ============ QR Y ESCÁNER ============
async function verQRAlumno(alumnoId) {
    try {
        const res = await fetch(`/api/qr/alumno/${alumnoId}`, { headers: { 'Authorization': `Bearer ${state.token || localStorage.getItem('token')}` } });
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        const url = URL.createObjectURL(await res.blob());
        const w = window.open(url, '_blank');
        if (!w) throw new Error("Permite los pop-ups.");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast('❌ Error: ' + err.message); }
}

const btnCamara = document.getElementById('btn-camara');
const btnDetenerCamara = document.getElementById('btn-detener-camara');
if (btnCamara) btnCamara.addEventListener('click', iniciarScanner);
if (btnDetenerCamara) btnDetenerCamara.addEventListener('click', detenerScanner);

async function iniciarScanner() {
    const materiaId = document.getElementById('sel-materia-activa').value;
    if (!materiaId) { toast('⚠️ Selecciona una materia primero'); return; }
    document.getElementById('reader').classList.remove('oculto');
    document.getElementById('btn-camara').classList.add('oculto');
    document.getElementById('btn-detener-camara').classList.remove('oculto');
    document.getElementById('resultado-escaneo').classList.add('oculto');
    try {
        state.scanner = new Html5Qrcode("reader");
        await state.scanner.start({ facingMode: "environment" }, { fps: 15, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.75), height: Math.floor(Math.min(w, h) * 0.75) }) }, onScanSuccess).catch(() => state.scanner.start({ facingMode: "user" }, { fps: 15, qrbox: { width: 250, height: 250 } }, onScanSuccess));
    } catch (err) { toast('No se pudo acceder a la cámara: ' + err.message); detenerScanner(); }
}

function detenerScanner() {
    if (state.scanner) {
        state.scanner.stop().then(() => { state.scanner.clear(); state.scanner = null; }).catch(() => {});
    }
    document.getElementById('reader').classList.add('oculto');
    document.getElementById('btn-camara').classList.remove('oculto');
    document.getElementById('btn-detener-camara').classList.add('oculto');
}

let vozSeleccionada = null;
function cargarVoces() {
    return new Promise((resolve) => {
        let voces = speechSynthesis.getVoices();
        if (voces.length > 0) { resolve(voces); return; }
        speechSynthesis.addEventListener('voiceschanged', () => resolve(speechSynthesis.getVoices()), { once: true });
        setTimeout(() => resolve(voces), 3000);
    });
}
async function seleccionarMejorVoz() {
    const voces = await cargarVoces();
    for (const pref of ['Google español', 'Microsoft Sabina', 'Microsoft Raul', 'Monica', 'es-MX', 'es-ES']) {
        const voz = voces.find(v => v.name.includes(pref) || v.lang.includes(pref));
        if (voz) return voz;
    }
    return voces.find(v => v.lang.startsWith('es')) || null;
}
async function hablar(texto) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (!vozSeleccionada) vozSeleccionada = await seleccionarMejorVoz();
    const u = new SpeechSynthesisUtterance(texto);
    if (vozSeleccionada) u.voice = vozSeleccionada; else u.lang = 'es-MX';
    u.rate = 1.2; u.pitch = 1.05; u.volume = 1.0;
    window.speechSynthesis.speak(u);
}
function obtenerSaludo(nombre) {
    if (!nombre) return 'Bienvenido';
    const primer = nombre.trim().split(/\s+/)[0].toLowerCase();
    const excep = ['guadalupe','rosario','itzel','abigail','ruth','miriam','monserrat','monse','xóchitl','xochitl'];
    if (excep.includes(primer) || primer.endsWith('a')) return `Bienvenida, ${nombre}`;
    return `Bienvenido, ${nombre}`;
}

async function onScanSuccess(decodedText) {
    const ahora = Date.now();
    if (decodedText === state.ultimoScan.codigo && (ahora - state.ultimoScan.tiempo) < 4000) return;
    state.ultimoScan = { codigo: decodedText, tiempo: ahora };
    const materiaId = document.getElementById('sel-materia-activa').value;
    const resDiv = document.getElementById('resultado-escaneo');
    resDiv.classList.remove('oculto', 'success', 'warning', 'error');
    resDiv.innerHTML = '⏳ Procesando...';
    try {
        const data = await api('/api/asistencia/registrar', { method: 'POST', body: JSON.stringify({ qr_token: decodedText.trim(), materia_id: parseInt(materiaId) }) });
        if (data.status === 'REGISTRO_NUEVO') {
            resDiv.classList.add('success');
            resDiv.innerHTML = `✅ <strong>${data.materia}</strong><br>${data.alumno} · ${data.grupo} · ${data.hora}`;
            hablar(`${obtenerSaludo(data.alumno)}. Registrado en ${data.materia}`);
        } else if (data.status === 'DUPLICADO') {
            resDiv.classList.add('warning');
            resDiv.innerHTML = `⚠️ <strong>Ya registrado</strong><br>${data.alumno} ya pasó lista hoy.`;
            hablar(`${data.alumno} ya cuenta con asistencia.`);
        } else {
            resDiv.classList.add('error');
            resDiv.innerHTML = `❌ <strong>No encontrado</strong><br>Token: ${data.alumno}`;
        }
    } catch (err) {
        resDiv.classList.add('error');
        resDiv.innerHTML = `❌ <strong>Error</strong><br>${err.message}`;
    }
}

// ============ GENERAR QR Y REPORTES ============
function cargarVistaQR() { const sel = document.getElementById('sel-materia-qr'); if (sel && sel.value) cargarGruposQR(); }
async function cargarGruposQR() {
    const materiaId = document.getElementById('sel-materia-qr').value;
    const sel = document.getElementById('sel-grupo-qr');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    if (!materiaId) return;
    try {
        const grupos = await api(`/api/grupos/materia/${materiaId}`);
        sel.innerHTML += grupos.map(g => `<option value="${g.id}">${g.nombre}</option>`).join('');
    } catch (err) { toast('Error: ' + err.message); }
}

const btnDescargarGrupo = document.getElementById('btn-descargar-qr-grupo');
if (btnDescargarGrupo) {
    btnDescargarGrupo.addEventListener('click', async () => {
        const grupoId = document.getElementById('sel-grupo-qr').value;
        if (!grupoId) { toast('⚠️ Selecciona un grupo'); return; }
        toast('⏳ Generando ZIP...');
        try {
            const res = await fetch(`/api/qr/zip/grupo/${grupoId}`, { headers: { 'Authorization': `Bearer ${state.token || localStorage.getItem('token')}` } });
            if (!res.ok) throw new Error('Error en el servidor');
            const filename = obtenerNombreArchivoDesdeHeaders(res);
            const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            toast(`✅ Descarga: ${filename}`);
        } catch (err) { toast('❌ Error: ' + err.message); }
    });
}

document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('activa'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('activa'));
        t.classList.add('activa');
        const tc = document.getElementById(`tab-${t.dataset.tab}`);
        if (tc) tc.classList.add('activa');
    });
});

const formQrManual = document.getElementById('form-qr-manual');
if (formQrManual) {
    const nuevoForm = formQrManual.cloneNode(true);
    formQrManual.parentNode.replaceChild(nuevoForm, formQrManual);
    nuevoForm.addEventListener('submit', async e => {
        e.preventDefault();
        const raw = document.getElementById('qr-raw-data').value;
        if (!raw.trim()) { toast('⚠️ Campo vacío'); return; }
        toast('⏳ Generando ZIP...');
        const form = new FormData(); form.append('raw_data', raw);
        try {
            const res = await fetch('/api/qr/manual', { method: 'POST', headers: { 'Authorization': `Bearer ${state.token || localStorage.getItem('token')}` }, body: form });
            if (!res.ok) throw new Error('Error');
            const filename = obtenerNombreArchivoDesdeHeaders(res);
            const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            document.getElementById('qr-raw-data').value = '';
            toast(`✅ Descarga: ${filename}`);
        } catch (err) { toast('❌ Error: ' + err.message); }
    });
}

async function descargarExcelHoy() {
    toast('⏳ Generando reporte...');
    try {
        const res = await fetch('/api/reportes/excel/hoy', { headers: { 'Authorization': `Bearer ${state.token || localStorage.getItem('token')}` } });
        if (!res.ok) throw new Error('Error');
        const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'asistencia_hoy.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast('✅ Descarga iniciada');
    } catch (err) { toast('❌ Error: ' + err.message); }
}

async function descargarExcelHistorial() {
    toast('⏳ Generando historial...');
    try {
        const res = await fetch('/api/reportes/excel/historial', { headers: { 'Authorization': `Bearer ${state.token || localStorage.getItem('token')}` } });
        if (!res.ok) throw new Error('Error');
        const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'historial_completo.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        toast('✅ Descarga iniciada');
    } catch (err) { toast('❌ Error: ' + err.message); }
}

async function cargarReporteHoy() {
    const statsEl = document.getElementById('stats-hoy');
    const tbody = document.querySelector('#tabla-hoy tbody');
    statsEl.innerHTML = '<p>Cargando...</p>'; tbody.innerHTML = '';
    try {
        const rows = await api('/api/reportes/hoy');
        const porMateria = {};
        rows.forEach(r => { porMateria[r.materia] = (porMateria[r.materia] || 0) + 1; });
        statsEl.innerHTML = `<div class="stat-card"><div class="num">${rows.length}</div><div class="lbl">Total hoy</div></div>` + Object.entries(porMateria).map(([m, n]) => `<div class="stat-card"><div class="num">${n}</div><div class="lbl">${m}</div></div>`).join('');
        if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-soft); padding:30px;">Sin registros hoy</td></tr>'; return; }
        tbody.innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td><strong>${r.alumno_nombre}</strong><br><small style="color:var(--text-soft)">${r.matricula}</small></td><td>${r.materia}</td><td>${r.grupo}</td><td>${r.hora_entrada}</td><td><span style="color:var(--success); font-weight:600;">${r.estatus}</span></td></tr>`).join('');
    } catch (err) { statsEl.innerHTML = `<p class="alert alert-error">${err.message}</p>`; }
}

async function cargarUsuarios() {
    const tbody = document.querySelector('#tabla-usuarios tbody');
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
    try {
        const users = await api('/api/auth/users');
        tbody.innerHTML = users.map(u => `<tr><td>${u.id}</td><td>${u.full_name}</td><td>${u.email}</td><td><span class="badge">${u.role}</span></td><td>${u.is_active ? '✅' : '❌'}</td><td><button type="button" data-user-id="${u.id}" class="btn btn-secondary btn-editar-usuario">Editar</button></td></tr>`).join('');
        tbody.querySelectorAll('.btn-editar-usuario').forEach(btn => {
            btn.addEventListener('click', function () {
                const user = users.find(u => u.id === parseInt(this.dataset.userId, 10));
                if (user) abrirEditarUsuario(user);
            });
        });
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">${err.message}</td></tr>`; }
}

document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
    openModal('Nuevo usuario', `<form id="form-nuevo-usuario"><label>Nombre completo</label><input type="text" name="full_name" required><label>Email</label><input type="email" name="email" required><label>Contraseña</label><input type="password" name="password" required minlength="6"><label>Rol</label><select name="role"><option value="profesor">Profesor</option><option value="admin">Administrador</option></select><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear</button></div></form>`);
    document.getElementById('form-nuevo-usuario').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ full_name: fd.get('full_name'), email: fd.get('email'), password: fd.get('password'), role: fd.get('role') }) });
            closeModal(); toast('✅ Creado'); cargarUsuarios();
        } catch (err) { toast('❌ Error: ' + err.message); }
    };
});

function abrirEditarUsuario(user) {
    openModal('Editar usuario', `<form id="form-editar-usuario"><input type="hidden" name="id" value="${user.id}"><label>Nombre completo</label><input type="text" name="full_name" required value="${String(user.full_name).replace(/"/g, '&quot;')}"><label>Email</label><input type="email" name="email" required value="${String(user.email).replace(/"/g, '&quot;')}"><label>Activo</label><input type="checkbox" name="is_active" ${user.is_active ? 'checked' : ''}><label>Rol</label><select name="role"><option value="profesor" ${user.role === 'profesor' ? 'selected' : ''}>Profesor</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option></select><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div></form>`);
    document.getElementById('form-editar-usuario').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/auth/edit', { method: 'POST', body: JSON.stringify({ id: parseInt(fd.get('id'), 10), full_name: fd.get('full_name'), email: fd.get('email'), is_active: fd.get('is_active') === 'on', role: fd.get('role') }) });
            closeModal(); toast('✅ Actualizado'); cargarUsuarios();
        } catch (err) { toast('❌ Error: ' + err.message); }
    };
}

const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', (e) => { e.preventDefault(); logout(); });
}

if (state.token && state.user) {
    iniciarApp();
}