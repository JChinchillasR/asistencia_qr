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
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) { logout(); throw new Error('Sesión expirada'); }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error');
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

// ============ MODAL ============
function openModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
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
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
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
    document.getElementById('pantalla-login').classList.add('activa');
    document.getElementById('app').classList.remove('activa');
}
document.getElementById('btn-logout').addEventListener('click', logout);

// ============ NAVEGACIÓN ============
document.getElementById('btn-menu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('abierto');
});
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.dataset.view;
        cambiarVista(view);
        if (window.innerWidth < 900) {
            document.getElementById('sidebar').classList.remove('abierto');
        }
    });
});

function cambiarVista(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('activa'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (viewEl) viewEl.classList.add('activa');
    if (navEl) navEl.classList.add('active');
    // Detener scanner si sale de tomar-lista
    if (view !== 'tomar-lista' && state.scanner) detenerScanner();
    // Cargar datos según vista
    if (view === 'mis-materias') cargarMaterias();
    if (view === 'grupos') cargarVistaGrupos();
    if (view === 'generar-qr') cargarVistaQR();
    if (view === 'reportes') cargarReporteHoy();
    if (view === 'usuarios') cargarUsuarios();
}

// ============ INICIAR APP ============
function iniciarApp() {
    document.getElementById('pantalla-login').classList.remove('activa');
    document.getElementById('app').classList.add('activa');
    document.getElementById('user-name').textContent = state.user.full_name;
    if (state.user.role === 'admin') {
        document.querySelector('.nav-item.solo-admin').classList.remove('oculto');
    }
    cargarMateriasSelects();
    cambiarVista('tomar-lista');
}

// ============ MATERIAS ============
async function cargarMateriasSelects() {
    try {
        state.materias = await api('/api/materias/');
        const selects = ['sel-materia-activa', 'sel-materia-grupos', 'sel-materia-qr'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = '<option value="">-- Selecciona --</option>' +
                state.materias.map(m => `<option value="${m.id}">${m.nombre} (${m.clave})</option>`).join('');
        });
        // Listeners
        document.getElementById('sel-materia-activa').onchange = actualizarInfoGrupoActiva;
        document.getElementById('sel-materia-grupos').onchange = cargarGruposDeMateria;
        document.getElementById('sel-materia-qr').onchange = cargarGruposQR;
    } catch (err) {
        toast('Error al cargar materias: ' + err.message);
    }
}

async function cargarMaterias() {
    const cont = document.getElementById('lista-materias');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const materias = await api('/api/materias/');
        if (!materias.length) {
            cont.innerHTML = '<p style="color:var(--text-soft)">No tienes materias. Crea la primera.</p>';
            return;
        }
        cont.innerHTML = materias.map(m => `
            <div class="grid-card">
                <h3>${m.nombre}</h3>
                <div class="meta">Clave: ${m.clave} · Semestre: ${m.semestre}</div>
                <div class="acciones">
                    <button class="btn btn-sm btn-secondary" onclick="verGruposMateria(${m.id})">👥 Grupos</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarMateria(${m.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

document.getElementById('btn-nueva-materia').addEventListener('click', () => {
    openModal('Nueva materia', `
        <form id="form-nueva-materia">
            <label>Nombre</label>
            <input type="text" name="nombre" required>
            <label>Clave (única)</label>
            <input type="text" name="clave" required placeholder="Ej: BIOQ-101">
            <label>Semestre</label>
            <input type="text" name="semestre" required placeholder="Ej: 2026-2">
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Crear</button>
            </div>
        </form>
    `);
    document.getElementById('form-nueva-materia').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/materias/', {
                method: 'POST',
                body: JSON.stringify({
                    nombre: fd.get('nombre'),
                    clave: fd.get('clave'),
                    semestre: fd.get('semestre'),
                }),
            });
            closeModal();
            toast('Materia creada');
            cargarMaterias();
            cargarMateriasSelects();
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
});

async function eliminarMateria(id) {
    if (!confirm('¿Eliminar esta materia y todos sus grupos/alumnos?')) return;
    try {
        await api(`/api/materias/${id}`, { method: 'DELETE' });
        toast('Materia eliminada');
        cargarMaterias();
        cargarMateriasSelects();
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

function verGruposMateria(materiaId) {
    document.getElementById('sel-materia-grupos').value = materiaId;
    cambiarVista('grupos');
}

// ============ GRUPOS Y ALUMNOS ============
async function cargarVistaGrupos() {
    const sel = document.getElementById('sel-materia-grupos');
    if (sel.value) cargarGruposDeMateria();
}

async function cargarGruposDeMateria() {
    const materiaId = document.getElementById('sel-materia-grupos').value;
    const cont = document.getElementById('contenedor-grupos');
    if (!materiaId) { cont.innerHTML = ''; return; }
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const grupos = await api(`/api/grupos/materia/${materiaId}`);
        if (!grupos.length) {
            cont.innerHTML = `
                <div class="card">
                    <p style="color:var(--text-soft)">Sin grupos. Crea el primero.</p>
                </div>
            `;
        } else {
            cont.innerHTML = grupos.map(g => `
                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h3>${g.nombre}</h3>
                        <div>
                            <button class="btn btn-sm btn-secondary" onclick="verAlumnosGrupo(${g.id}, '${g.nombre}')">👥 Alumnos</button>
                            <button class="btn btn-sm btn-danger" onclick="eliminarGrupo(${g.id})">🗑️</button>
                        </div>
                    </div>
                    ${g.horario ? `<div class="meta">🕒 ${g.horario}</div>` : ''}
                    <div id="alumnos-grupo-${g.id}"></div>
                </div>
            `).join('');
        }
        // Botón añadir grupo
        cont.innerHTML += `
            <div class="card">
                <button class="btn btn-primary btn-block" onclick="nuevoGrupo(${materiaId})">+ Añadir grupo</button>
            </div>
        `;
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

async function verAlumnosGrupo(grupoId, nombreGrupo) {
    const cont = document.getElementById(`alumnos-grupo-${grupoId}`);
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando alumnos...</p>';
    try {
        const alumnos = await api(`/api/alumnos/grupo/${grupoId}`);
        if (!alumnos.length) {
            cont.innerHTML = '<p style="color:var(--text-soft); font-size:13px;">Sin alumnos registrados.</p>';
        } else {
            cont.innerHTML = `
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Matrícula</th><th>Nombre</th><th></th></tr></thead>
                        <tbody>
                            ${alumnos.map(a => `
                                <tr>
                                    <td>${a.matricula}</td>
                                    <td>${a.nombre_completo}</td>
                                    <td>
                                        <a href="/api/qr/alumno/${a.id}" target="_blank" class="btn btn-sm btn-secondary">QR</a>
                                        <button class="btn btn-sm btn-danger" onclick="eliminarAlumno(${a.id}, ${grupoId})">×</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        cont.innerHTML += `
            <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-sm btn-primary" onclick="nuevoAlumno(${grupoId})">+ Alumno</button>
                <button class="btn btn-sm btn-secondary" onclick="nuevoAlumnoMasivo(${grupoId})">+ Varios</button>
            </div>
        `;
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

function nuevoGrupo(materiaId) {
    openModal('Nuevo grupo', `
        <form id="form-nuevo-grupo">
            <label>Nombre del grupo</label>
            <input type="text" name="nombre" required placeholder="Ej: Grupo 01">
            <label>Horario (opcional)</label>
            <input type="text" name="horario" placeholder="Ej: Lun-Mié 10:00-12:00">
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Crear</button>
            </div>
        </form>
    `);
    document.getElementById('form-nuevo-grupo').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/grupos/', {
                method: 'POST',
                body: JSON.stringify({
                    materia_id: materiaId,
                    nombre: fd.get('nombre'),
                    horario: fd.get('horario') || '',
                }),
            });
            closeModal();
            toast('Grupo creado');
            cargarGruposDeMateria();
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
}

async function eliminarGrupo(id) {
    if (!confirm('¿Eliminar este grupo y todos sus alumnos?')) return;
    try {
        await api(`/api/grupos/${id}`, { method: 'DELETE' });
        toast('Grupo eliminado');
        cargarGruposDeMateria();
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

function nuevoAlumno(grupoId) {
    openModal('Nuevo alumno', `
        <form id="form-nuevo-alumno">
            <label>Matrícula</label>
            <input type="text" name="matricula" required>
            <label>Nombre completo</label>
            <input type="text" name="nombre_completo" required>
            <label>Email (opcional)</label>
            <input type="email" name="email">
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Crear</button>
            </div>
        </form>
    `);
    document.getElementById('form-nuevo-alumno').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/alumnos/', {
                method: 'POST',
                body: JSON.stringify({
                    grupo_id: grupoId,
                    matricula: fd.get('matricula'),
                    nombre_completo: fd.get('nombre_completo'),
                    email: fd.get('email') || '',
                }),
            });
            closeModal();
            toast('Alumno creado');
            verAlumnosGrupo(grupoId, '');
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
}

function nuevoAlumnoMasivo(grupoId) {
    openModal('Añadir varios alumnos', `
        <div class="info-box">Pega una lista con un alumno por línea. Formato: <code>matricula, nombre completo</code></div>
        <form id="form-alumnos-masivo">
            <textarea name="data" rows="10" required placeholder="A001, Juan Pérez&#10;A002, María López"></textarea>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Crear todos</button>
            </div>
        </form>
    `);
    document.getElementById('form-alumnos-masivo').onsubmit = async e => {
        e.preventDefault();
        const data = e.target.data.value;
        const alumnos = data.split('\n').map(l => {
            const partes = l.split(',').map(s => s.trim());
            if (partes.length < 2) return null;
            return {
                grupo_id: grupoId,
                matricula: partes[0],
                nombre_completo: partes.slice(1).join(' '),
                email: '',
            };
        }).filter(Boolean);
        if (!alumnos.length) { toast('Formato inválido'); return; }
        try {
            await api(`/api/alumnos/bulk?grupo_id=${grupoId}`, {
                method: 'POST',
                body: JSON.stringify(alumnos),
            });
            closeModal();
            toast(`${alumnos.length} alumnos procesados`);
            verAlumnosGrupo(grupoId, '');
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
}

async function eliminarAlumno(id, grupoId) {
    if (!confirm('¿Eliminar este alumno?')) return;
    try {
        await api(`/api/alumnos/${id}`, { method: 'DELETE' });
        toast('Alumno eliminado');
        verAlumnosGrupo(grupoId, '');
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// ============ TOMAR LISTA (SCANNER) ============
async function actualizarInfoGrupoActiva() {
    const materiaId = document.getElementById('sel-materia-activa').value;
    const info = document.getElementById('info-grupo-activa');
    if (!materiaId) { info.innerHTML = ''; return; }
    try {
        const materia = await api(`/api/materias/${materiaId}`);
        const grupos = materia.grupos || [];
        info.innerHTML = `<strong>${grupos.length}</strong> grupo(s) · <strong>${grupos.reduce((a,g) => a + (g.alumnos?.length || 0), 0)}</strong> alumnos`;
    } catch (err) {
        info.innerHTML = '';
    }
}

document.getElementById('btn-camara').addEventListener('click', iniciarScanner);

async function iniciarScanner() {
    const materiaId = document.getElementById('sel-materia-activa').value;
    if (!materiaId) { toast('Selecciona una materia'); return; }
    const reader = document.getElementById('reader');
    reader.classList.remove('oculto');
    document.getElementById('btn-camara').style.display = 'none';
    try {
        state.scanner = new Html5Qrcode("reader");
        const config = {
            fps: 15,
            qrbox: (w, h) => {
                const min = Math.min(w, h);
                return { width: Math.floor(min * 0.75), height: Math.floor(min * 0.75) };
            },
        };
        await state.scanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess
        ).catch(() => state.scanner.start({ facingMode: "user" }, config, onScanSuccess));
    } catch (err) {
        toast('No se pudo acceder a la cámara: ' + err.message);
        reader.classList.add('oculto');
        document.getElementById('btn-camara').style.display = 'block';
    }
}

function detenerScanner() {
    if (state.scanner) {
        state.scanner.stop().then(() => {
            state.scanner.clear();
            state.scanner = null;
            document.getElementById('reader').classList.add('oculto');
            document.getElementById('btn-camara').style.display = 'block';
        }).catch(() => {});
    }
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
        const data = await api('/api/asistencia/registrar', {
            method: 'POST',
            body: JSON.stringify({ qr_token: decodedText.trim(), materia_id: parseInt(materiaId) }),
        });
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
        resDiv.innerHTML = `❌ Error: ${err.message}`;
    }
}

function obtenerSaludo(nombre) {
    if (!nombre) return 'Bienvenido';
    const primer = nombre.trim().split(/\s+/)[0].toLowerCase();
    const excep = ['guadalupe','rosario','itzel','abigail','ruth','miriam','monserrat','monse','xóchitl','xochitl'];
    if (excep.includes(primer) || primer.endsWith('a')) return `Bienvenida, ${nombre}`;
    return `Bienvenido, ${nombre}`;
}

function hablar(texto) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = 'es-MX';
        window.speechSynthesis.speak(u);
    }
}

// ============ GENERAR QR ============
function cargarVistaQR() {
    const sel = document.getElementById('sel-materia-qr');
    if (sel.value) cargarGruposQR();
}

async function cargarGruposQR() {
    const materiaId = document.getElementById('sel-materia-qr').value;
    const sel = document.getElementById('sel-grupo-qr');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    if (!materiaId) return;
    try {
        const grupos = await api(`/api/grupos/materia/${materiaId}`);
        sel.innerHTML += grupos.map(g => `<option value="${g.id}">${g.nombre}</option>`).join('');
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

document.getElementById('btn-descargar-qr-grupo').addEventListener('click', () => {
    const grupoId = document.getElementById('sel-grupo-qr').value;
    if (!grupoId) { toast('Selecciona un grupo'); return; }
    window.open(`/api/qr/zip/grupo/${grupoId}`, '_blank');
});

document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('activa'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('activa'));
        t.classList.add('activa');
        document.getElementById(`tab-${t.dataset.tab}`).classList.add('activa');
    });
});

document.getElementById('form-qr-manual').addEventListener('submit', async e => {
    e.preventDefault();
    const raw = document.getElementById('qr-raw-data').value;
    const form = new FormData();
    form.append('raw_data', raw);
    try {
        const res = await fetch('/api/qr/manual', {
            method: 'POST',
            body: form,
        });
        if (!res.ok) throw new Error('Error al generar');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qrs_alta_resolucion.zip';
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        toast('Error: ' + err.message);
    }
});

// ============ REPORTES ============
async function cargarReporteHoy() {
    const statsEl = document.getElementById('stats-hoy');
    const tbody = document.querySelector('#tabla-hoy tbody');
    statsEl.innerHTML = '<p>Cargando...</p>';
    tbody.innerHTML = '';
    try {
        const rows = await api('/api/reportes/hoy');
        const porMateria = {};
        rows.forEach(r => {
            porMateria[r.materia] = (porMateria[r.materia] || 0) + 1;
        });
        statsEl.innerHTML = `
            <div class="stat-card"><div class="num">${rows.length}</div><div class="lbl">Total hoy</div></div>
            ${Object.entries(porMateria).map(([m, n]) => `
                <div class="stat-card"><div class="num">${n}</div><div class="lbl">${m}</div></div>
            `).join('')}
        `;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-soft); padding:30px;">Sin registros hoy</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((r, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${r.alumno_nombre}</strong><br><small style="color:var(--text-soft)">${r.matricula}</small></td>
                <td>${r.materia}</td>
                <td>${r.grupo}</td>
                <td>${r.hora_entrada}</td>
                <td><span style="color:var(--success); font-weight:600;">${r.estatus}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        statsEl.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

// ============ USUARIOS (admin) ============
async function cargarUsuarios() {
    const tbody = document.querySelector('#tabla-usuarios tbody');
    tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    try {
        const users = await api('/api/auth/users');
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.full_name}</td>
                <td>${u.email}</td>
                <td><span class="badge">${u.role}</span></td>
                <td>${u.is_active ? '✅' : '❌'}</td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="alert alert-error">${err.message}</td></tr>`;
    }
}

document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
    openModal('Nuevo usuario', `
        <form id="form-nuevo-usuario">
            <label>Nombre completo</label>
            <input type="text" name="full_name" required>
            <label>Email</label>
            <input type="email" name="email" required>
            <label>Contraseña</label>
            <input type="password" name="password" required minlength="6">
            <label>Rol</label>
            <select name="role">
                <option value="profesor">Profesor</option>
                <option value="admin">Administrador</option>
            </select>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Crear</button>
            </div>
        </form>
    `);
    document.getElementById('form-nuevo-usuario').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    full_name: fd.get('full_name'),
                    email: fd.get('email'),
                    password: fd.get('password'),
                    role: fd.get('role'),
                }),
            });
            closeModal();
            toast('Usuario creado');
            cargarUsuarios();
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
});

// ============ ENDPOINT QR MANUAL (lo añadimos al backend) ============
// Nota: este endpoint se define en app/routers/qr.py

// ============ INICIO ============
if (state.token && state.user) {
    iniciarApp();
}