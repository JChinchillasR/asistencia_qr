// ============ ESTADO GLOBAL ============
const state = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    materias: [],
    grupos: {},
    scanner: null,
    ultimoScan: { codigo: '', tiempo: 0 },
};

// ============ API HELPER (Con lectura de error del backend) ============
async function api(path, options = {}) {
    if (path.endsWith('/') && path.length > 1) {
        path = path.slice(0, -1);
    }
    
    const currentToken = state.token || localStorage.getItem('token');
    const headers = { 
        'Content-Type': 'application/json', 
        ...(options.headers || {}) 
    };
    
    if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const res = await fetch(path, { ...options, headers });
    
    if (res.status === 401) { 
        let errorDetail = "No autenticado";
        try {
            // Intentamos leer el mensaje de error que envía FastAPI
            const errorData = await res.json();
            errorDetail = errorData.detail || errorDetail;
        } catch (e) {}
        
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

// ============ UTILIDAD PARA OBTENER NOMBRE DE ARCHIVO DEL SERVIDOR ============
function obtenerNombreArchivoDesdeHeaders(response) {
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
        // Regex mejorado: captura el nombre ignorando comillas, UTF-8 tags o puntos y coma
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^;"\n\r]+)"?/i);
        if (match && match[1]) {
            let filename = match[1].trim();
            
            // 🎯 Limpieza agresiva: elimina comillas, espacios o guiones bajos al final
            filename = filename.replace(/["'\s_]+$/g, '');
            
            // Asegurar que termine en .zip (por si acaso la limpieza lo afectó)
            if (!filename.toLowerCase().endsWith('.zip')) {
                filename += '.zip';
            }
            
            return filename;
        }
    }
    return 'qrs_descargados.zip'; // Nombre por defecto de respaldo
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
        console.log("🔄 Intentando iniciar sesión...");
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        
        console.log("✅ Login exitoso. Token recibido del servidor.");
        
        state.token = data.access_token;
        state.user = data.user;
        
        // Guardar en localStorage
        localStorage.setItem('token', state.token);
        localStorage.setItem('user', JSON.stringify(state.user));
        
        console.log("💾 Token guardado en localStorage:", localStorage.getItem('token') ? "SÍ" : "NO");
        
        iniciarApp();
    } catch (err) {
        console.error("❌ Error en login:", err);
        errEl.textContent = err.message || 'Credenciales inválidas';
        errEl.classList.remove('oculto');
    }
});


// ============ CERRAR SESIÓN ============
function logout() {
    console.log("🚪 Cerrando sesión..."); // Diagnóstico
    
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // 1. Volver a mostrar la pantalla de login
    const loginScreen = document.getElementById('pantalla-login');
    if (loginScreen) {
        loginScreen.classList.remove('oculto');
        loginScreen.style.display = 'flex';
    }
    
    // 2. Ocultar la app principal
    const appScreen = document.getElementById('app');
    if (appScreen) {
        appScreen.classList.remove('activa');
        appScreen.style.display = 'none';
    }
    
    // 3. Limpiar formulario
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
    // 1. Ocultar definitivamente la pantalla de login forzando el estilo
    const loginScreen = document.getElementById('pantalla-login');
    loginScreen.classList.add('oculto');
    loginScreen.style.display = 'none'; // Fuerza la ocultación sin importar el CSS
    
    // 2. Mostrar la app principal
    const appScreen = document.getElementById('app');
    appScreen.classList.add('activa');
    appScreen.style.display = 'block'; // Fuerza la visualización
    
    // 3. Configurar datos del usuario
    document.getElementById('user-name').textContent = state.user.full_name;
    if (state.user.role === 'admin') {
        const adminLink = document.querySelector('.nav-item.solo-admin');
        if (adminLink) adminLink.classList.remove('oculto');
    }
    
    // 4. Cargar datos iniciales
    cargarMateriasSelects();
    cambiarVista('tomar-lista');
}

// ============ CERRAR SESIÓN ============
function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // 1. Volver a mostrar la pantalla de login
    const loginScreen = document.getElementById('pantalla-login');
    loginScreen.classList.remove('oculto');
    loginScreen.style.display = 'flex'; // Restaura el flex original del CSS
    
    // 2. Ocultar la app principal
    const appScreen = document.getElementById('app');
    appScreen.classList.remove('activa');
    appScreen.style.display = 'none'; // Fuerza la ocultación
    
    // 3. Limpiar formulario
    const formLogin = document.getElementById('form-login');
    if (formLogin) formLogin.reset();
    
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.classList.add('oculto');
}

// ============ MATERIAS Y GRUPOS (NUEVO FLUJO N:M) ============

// 1. Cargar selects para Tomar Lista y Generar QR
async function cargarMateriasSelects() {
    try {
        state.materias = await api('/api/materias');
        const selects = ['sel-materia-activa', 'sel-materia-qr'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = '<option value="">-- Selecciona --</option>' +
                state.materias.map(m => `<option value="${m.id}">${m.nombre} (${m.clave})</option>`).join('');
        });
        document.getElementById('sel-materia-activa').onchange = actualizarInfoGrupoActiva;
        document.getElementById('sel-materia-qr').onchange = cargarGruposQR;
    } catch (err) {
        toast('Error al cargar materias: ' + err.message);
    }
}

// 2. Actualizar info en "Tomar Lista"
async function actualizarInfoGrupoActiva() {
    const materiaId = document.getElementById('sel-materia-activa').value;
    const info = document.getElementById('info-grupo-activa');
    if (!materiaId) { info.innerHTML = ''; return; }
    try {
        // Usamos el endpoint que devuelve los grupos de esa materia
        const grupos = await api(`/api/grupos/materia/${materiaId}`);
        const totalAlumnos = grupos.reduce((acc, g) => acc + (g.alumnos_count || 0), 0); // Nota: ajustaremos esto si es necesario, o contamos en frontend
        info.innerHTML = `<strong>${grupos.length}</strong> grupo(s) asignado(s) a esta materia.`;
    } catch (err) {
        info.innerHTML = '';
    }
}

// 3. Listar todas las materias (con opción de asignar grupos)
async function cargarMaterias() {
    const cont = document.getElementById('lista-materias');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const materias = await api('/api/materias');
        if (!materias.length) {
            cont.innerHTML = '<p style="color:var(--text-soft)">No tienes materias. Crea la primera.</p>';
            return;
        }
        cont.innerHTML = materias.map(m => `
            <div class="grid-card">
                <h3>${m.nombre}</h3>
                <div class="meta">Clave: ${m.clave} · Semestre: ${m.semestre}</div>
                <div class="acciones">
                    <button class="btn btn-sm btn-primary" onclick="asignarGruposAMateria(${m.id}, '${m.nombre}')">👥 Asignar Grupos</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarMateria(${m.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

// 4. Crear nueva materia
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
            await api('/api/materias', {
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
    if (!confirm('¿Eliminar esta materia? (Los grupos y alumnos NO se eliminarán)')) return;
    try {
        await api(`/api/materias/${id}`, { method: 'DELETE' });
        toast('Materia eliminada');
        cargarMaterias();
        cargarMateriasSelects();
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// 5. Asignar grupos a una materia
async function asignarGruposAMateria(materiaId, materiaNombre) {
    try {
        // Obtener todos los grupos
        const todosLosGrupos = await api('/api/grupos');
        // Obtener los grupos ya asignados a esta materia
        const gruposAsignados = await api(`/api/grupos/materia/${materiaId}`);
        const idsAsignados = new Set(gruposAsignados.map(g => g.id));

        const opciones = todosLosGrupos.map(g => {
            const isChecked = idsAsignados.has(g.id) ? 'checked' : '';
            return `<label style="display:flex; align-items:center; gap:8px; margin:8px 0; font-weight:normal; text-transform:none;">
                <input type="checkbox" name="grupos" value="${g.id}" ${isChecked}> ${g.nombre}
            </label>`;
        }).join('');

        openModal(`Asignar grupos a: ${materiaNombre}`, `
            <div class="info-box">Selecciona los grupos que tomarán esta materia.</div>
            <form id="form-asignar-grupos">
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); padding: 10px; border-radius: 8px;">
                    ${opciones || '<p style="color:var(--text-soft)">No hay grupos creados aún.</p>'}
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar Asignaciones</button>
                </div>
            </form>
        `);

        document.getElementById('form-asignar-grupos').onsubmit = async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const gruposSeleccionados = fd.getAll('grupos').map(Number);
            
            toast('⏳ Actualizando asignaciones...');
            try {
                // Por simplicidad, quitamos todas y agregamos las seleccionadas
                // (En una app más grande se haría un diff, pero esto es rápido y efectivo)
                for (const g of gruposAsignados) {
                    await api(`/api/grupos/${g.id}/materias/${materiaId}`, { method: 'DELETE' }).catch(() => {});
                }
                for (const gId of gruposSeleccionados) {
                    await api(`/api/grupos/${gId}/materias`, {
                        method: 'POST',
                        body: JSON.stringify({ materia_id: materiaId })
                    }).catch(() => {});
                }
                closeModal();
                toast('✅ Asignaciones actualizadas');
                actualizarInfoGrupoActiva(); // Refrescar si está en tomar lista
            } catch (err) {
                toast('Error: ' + err.message);
            }
        };
    } catch (err) {
        toast('Error al cargar grupos: ' + err.message);
    }
}

// 6. Listar todos los grupos (Vista Grupos)
async function cargarVistaGrupos() {
    const cont = document.getElementById('lista-grupos-globales');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const grupos = await api('/api/grupos');
        if (!grupos.length) {
            cont.innerHTML = '<p style="color:var(--text-soft)">No hay grupos creados. Crea el primero.</p>';
        } else {
            cont.innerHTML = grupos.map(g => `
                <div class="grid-card">
                    <h3>${g.nombre}</h3>
                    <div class="meta">${g.horario || 'Sin horario definido'}</div>
                    <div class="acciones">
                        <button class="btn btn-sm btn-secondary" onclick="verDetalleGrupo(${g.id}, '${g.nombre}')">👁️ Ver Detalle</button>
                        <button class="btn btn-sm btn-danger" onclick="eliminarGrupo(${g.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

// Botón nuevo grupo global
document.getElementById('btn-nuevo-grupo-global').addEventListener('click', () => {
    openModal('Nuevo Grupo', `
        <form id="form-nuevo-grupo-global">
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
    document.getElementById('form-nuevo-grupo-global').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/grupos', {
                method: 'POST',
                body: JSON.stringify({
                    nombre: fd.get('nombre'),
                    horario: fd.get('horario') || '',
                }),
            });
            closeModal();
            toast('Grupo creado');
            cargarVistaGrupos();
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
});

async function eliminarGrupo(id) {
    if (!confirm('¿Eliminar este grupo y a TODOS sus alumnos?')) return;
    try {
        await api(`/api/grupos/${id}`, { method: 'DELETE' });
        toast('Grupo eliminado');
        cargarVistaGrupos();
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// 7. Ver detalle de un grupo (Alumnos y Materias asignadas)
async function verDetalleGrupo(grupoId, nombreGrupo) {
    try {
        const grupo = await api(`/api/grupos/${grupoId}`);
        
        // Renderizar alumnos
        let alumnosHtml = '<p style="color:var(--text-soft); font-size:13px;">Sin alumnos registrados.</p>';
        if (grupo.alumnos && grupo.alumnos.length > 0) {
            alumnosHtml = `
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Matrícula</th><th>Nombre</th><th></th></tr></thead>
                        <tbody>
                            ${grupo.alumnos.map(a => `
                                <tr>
                                    <td>${a.matricula}</td>
                                    <td>${a.nombre_completo}</td>
                                    <td>
                                        <button class="btn btn-sm btn-secondary" onclick="verQRAlumno(${a.id})">QR</button>
                                        <button class="btn btn-sm btn-danger" onclick="eliminarAlumno(${a.id}, ${grupoId})">×</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Renderizar materias asignadas
        let materiasHtml = '<p style="color:var(--text-soft); font-size:13px;">Sin materias asignadas.</p>';
        if (grupo.materias && grupo.materias.length > 0) {
            materiasHtml = `<ul style="list-style:none; padding:0; margin:0;">` + 
                grupo.materias.map(m => `<li style="padding:4px 0; border-bottom:1px solid var(--border);">📚 ${m.nombre} (${m.clave})</li>`).join('') + 
                `</ul>`;
        }

        openModal(`Detalle: ${nombreGrupo}`, `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div>
                    <h4 style="margin-bottom:10px;">👥 Alumnos</h4>
                    ${alumnosHtml}
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="btn btn-sm btn-primary" onclick="closeModal(); nuevoAlumno(${grupoId})">+ Alumno</button>
                        <button class="btn btn-sm btn-secondary" onclick="closeModal(); nuevoAlumnoMasivo(${grupoId})">+ Varios</button>
                    </div>
                </div>
                <div>
                    <h4 style="margin-bottom:10px;">📚 Materias Asignadas</h4>
                    ${materiasHtml}
                    <button class="btn btn-sm btn-primary" style="margin-top:10px;" onclick="closeModal(); asignarGruposAMateriaDesdeGrupo(${grupoId})">+ Asignar Materia</button>
                </div>
            </div>
        `);
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// Función auxiliar para asignar materia desde el modal de grupo
async function asignarGruposAMateriaDesdeGrupo(grupoId) {
    try {
        const materias = await api('/api/materias');
        const grupo = await api(`/api/grupos/${grupoId}`);
        const idsAsignadas = new Set(grupo.materias.map(m => m.id));

        const opciones = materias.map(m => {
            const isChecked = idsAsignadas.has(m.id) ? 'checked' : '';
            return `<label style="display:flex; align-items:center; gap:8px; margin:8px 0; font-weight:normal; text-transform:none;">
                <input type="checkbox" name="materias" value="${m.id}" ${isChecked}> ${m.nombre} (${m.clave})
            </label>`;
        }).join('');

        openModal('Asignar materias a este grupo', `
            <form id="form-asignar-materias-grupo">
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); padding: 10px; border-radius: 8px;">
                    ${opciones || '<p style="color:var(--text-soft)">No hay materias creadas.</p>'}
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        `);

        document.getElementById('form-asignar-materias-grupo').onsubmit = async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const materiasSeleccionadas = fd.getAll('materias').map(Number);
            
            toast('⏳ Actualizando...');
            try {
                // Quitar todas las asignaciones actuales de este grupo
                for (const m of grupo.materias) {
                    await api(`/api/grupos/${grupoId}/materias/${m.id}`, { method: 'DELETE' }).catch(() => {});
                }
                // Agregar las nuevas
                for (const mId of materiasSeleccionadas) {
                    await api(`/api/grupos/${grupoId}/materias`, {
                        method: 'POST',
                        body: JSON.stringify({ materia_id: mId })
                    }).catch(() => {});
                }
                closeModal();
                toast('✅ Asignaciones actualizadas');
                verDetalleGrupo(grupoId, grupo.nombre); // Recargar modal
            } catch (err) {
                toast('Error: ' + err.message);
            }
        };
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// 8. Funciones de Alumnos (sin cambios mayores, solo adaptadas)
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
            verDetalleGrupo(grupoId, 'Grupo'); // Recargar
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
            verDetalleGrupo(grupoId, 'Grupo');
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
        verDetalleGrupo(grupoId, 'Grupo');
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// ============ VER QR INDIVIDUAL DEL ALUMNO ============
async function verQRAlumno(alumnoId) {
    console.log("🔍 Intentando ver QR del alumno ID:", alumnoId);
    
    try {
        const currentToken = state.token || localStorage.getItem('token');
        
        const res = await fetch(`/api/qr/alumno/${alumnoId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Error del servidor: ${res.status} - ${errText}`);
        }
        
        // Convertir la respuesta en una imagen y abrirla
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        
        // Abrir en una nueva pestaña
        const nuevaVentana = window.open(url, '_blank');
        
        if (!nuevaVentana) {
            throw new Error("El navegador bloqueó la ventana emergente. Permite los pop-ups para este sitio.");
        }
        
        // Liberar memoria después de 1 minuto
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        
    } catch (err) {
        console.error("❌ Error al cargar el QR:", err);
        toast('❌ Error: ' + err.message);
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

// 🎯 EVENTOS DE LOS BOTONES DE CÁMARA
const btnCamara = document.getElementById('btn-camara');
const btnDetenerCamara = document.getElementById('btn-detener-camara');

if (btnCamara) {
    btnCamara.addEventListener('click', iniciarScanner);
}

if (btnDetenerCamara) {
    btnDetenerCamara.addEventListener('click', detenerScanner);
}

async function iniciarScanner() {
    const materiaId = document.getElementById('sel-materia-activa').value;
    if (!materiaId) { 
        toast('⚠️ Selecciona una materia primero'); 
        return; 
    }
    
    const reader = document.getElementById('reader');
    reader.classList.remove('oculto');
    
    // 🎯 Alternar visibilidad de botones
    document.getElementById('btn-camara').classList.add('oculto');
    document.getElementById('btn-detener-camara').classList.remove('oculto');
    document.getElementById('resultado-escaneo').classList.add('oculto');

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
        detenerScanner();
    }
}

function detenerScanner() {
    if (state.scanner) {
        state.scanner.stop().then(() => {
            state.scanner.clear();
            state.scanner = null;
            document.getElementById('reader').classList.add('oculto');
            document.getElementById('btn-camara').classList.remove('oculto');
            document.getElementById('btn-detener-camara').classList.add('oculto');
        }).catch(() => {});
    } else {
        // Si no hay scanner activo, solo ocultamos el reader
        document.getElementById('reader').classList.add('oculto');
        document.getElementById('btn-camara').classList.remove('oculto');
        document.getElementById('btn-detener-camara').classList.add('oculto');
    }
}

// ============ FUNCIONES DE VOZ Y SALUDO ============

// Variable para almacenar la voz seleccionada
let vozSeleccionada = null;

// Función para cargar y seleccionar la mejor voz disponible
function cargarVoces() {
    return new Promise((resolve) => {
        let voces = speechSynthesis.getVoices();
        
        if (voces.length > 0) {
            resolve(voces);
            return;
        }
        
        // Si las voces no están cargadas aún, esperar el evento
        speechSynthesis.addEventListener('voiceschanged', () => {
            voces = speechSynthesis.getVoices();
            resolve(voces);
        }, { once: true });
        
        // Timeout de seguridad (3 segundos)
        setTimeout(() => resolve(voces), 3000);
    });
}

// Función para seleccionar la mejor voz en español
async function seleccionarMejorVoz() {
    const voces = await cargarVoces();
    
    if (voces.length === 0) {
        console.warn('No se encontraron voces disponibles');
        return null;
    }
    
    // Prioridad de voces (de mejor a peor)
    const preferencias = [
        // Voces de Google (muy naturales)
        'Google español',
        'Google español de México',
        'Google Español',
        
        // Voces de Microsoft (Windows)
        'Microsoft Sabina',
        'Microsoft Raul',
        'Microsoft Helena',
        
        // Voces de Apple (Mac/iOS)
        'Monica',
        'Paulina',
        
        // Voces genéricas
        'es-MX',
        'es-ES',
        'español'
    ];
    
    // Buscar la mejor voz disponible
    for (const preferencia of preferencias) {
        const voz = voces.find(v => 
            v.name.includes(preferencia) || 
            v.lang.includes(preferencia) ||
            v.lang === 'es-MX' ||
            v.lang === 'es-ES'
        );
        
        if (voz) {
            console.log(`✅ Voz seleccionada: ${voz.name} (${voz.lang})`);
            return voz;
        }
    }
    
    // Fallback: cualquier voz en español
    const vozEspanol = voces.find(v => v.lang.startsWith('es'));
    if (vozEspanol) {
        console.log(`⚠️ Usando voz genérica: ${vozEspanol.name}`);
        return vozEspanol;
    }
    
    console.warn('No se encontró ninguna voz en español');
    return null;
}

// Función mejorada para hablar
async function hablar(texto) {
    if (!('speechSynthesis' in window)) {
        console.warn('Síntesis de voz no soportada en este navegador');
        return;
    }
    
    // Cancelar cualquier reproducción anterior
    window.speechSynthesis.cancel();
    
    // Cargar la voz si aún no la tenemos
    if (!vozSeleccionada) {
        vozSeleccionada = await seleccionarMejorVoz();
    }
    
    const utterance = new SpeechSynthesisUtterance(texto);
    
    // Asignar la voz seleccionada
    if (vozSeleccionada) {
        utterance.voice = vozSeleccionada;
    } else {
        utterance.lang = 'es-MX'; // Fallback
    }
    
    // Parámetros ajustados para sonar más natural
    utterance.rate = 1.2;    // Cambiar valor hacia arriba o abajo para cambiar la velocidad (1.0 es normal)
    utterance.pitch = 1.05;   // Tono ligeramente más agudo (más natural)
    utterance.volume = 1.0;   // Volumen máximo
    
    console.log(`🔊 Reproduciendo: "${texto}"`);
    window.speechSynthesis.speak(utterance);
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
        console.log("📡 Enviando al servidor:", { qr_token: decodedText.trim(), materia_id: parseInt(materiaId) });

        const data = await api('/api/asistencia/registrar', {
            method: 'POST',
            body: JSON.stringify({ 
                qr_token: decodedText.trim(), 
                materia_id: parseInt(materiaId) 
            }),
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
        console.error("❌ ERROR DETALLADO DEL ESCÁNER:", err);
        resDiv.classList.add('error');
        resDiv.innerHTML = `❌ <strong>Error de registro</strong><br>${err.message}<br><small>Revisa la consola (F12) para más detalles.</small>`;
    }
}

// ============ GENERAR QR ============
function cargarVistaQR() {
    const sel = document.getElementById('sel-materia-qr');
    if (sel && sel.value) cargarGruposQR();
}

async function cargarGruposQR() {
    const materiaId = document.getElementById('sel-materia-qr').value;
    const sel = document.getElementById('sel-grupo-qr');
    if (!sel) return;
    
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    if (!materiaId) return;
    
    try {
        const grupos = await api(`/api/grupos/materia/${materiaId}`);
        sel.innerHTML += grupos.map(g => `<option value="${g.id}">${g.nombre}</option>`).join('');
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// Evento: Descargar ZIP por Grupo
const btnDescargarGrupo = document.getElementById('btn-descargar-qr-grupo');
if (btnDescargarGrupo) {
    btnDescargarGrupo.addEventListener('click', async () => {
        const grupoId = document.getElementById('sel-grupo-qr').value;
        if (!grupoId) { 
            toast('⚠️ Selecciona un grupo primero'); 
            return; 
        }
        
        toast('⏳ Generando paquete ZIP, por favor espera...');
        try {
            const currentToken = state.token || localStorage.getItem('token');
            const res = await fetch(`/api/qr/zip/grupo/${grupoId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            
            if (!res.ok) throw new Error('No autorizado o error en el servidor');
            
            const filename = obtenerNombreArchivoDesdeHeaders(res);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            toast(`✅ ¡Descarga iniciada: ${filename}!`);
        } catch (err) {
            console.error(err);
            toast('❌ Error al generar el ZIP: ' + err.message);
        }
    });
}

// Evento: Cambio de Pestañas (Tabs) - SOLO UNA VEZ
document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('activa'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('activa'));
        t.classList.add('activa');
        const tabContent = document.getElementById(`tab-${t.dataset.tab}`);
        if (tabContent) tabContent.classList.add('activa');
    });
});

// Evento: Descargar ZIP Manual - SOLO UNA VEZ
const formQrManual = document.getElementById('form-qr-manual');
if (formQrManual) {
    // Truco infalible: clonar el nodo elimina cualquier listener previo duplicado
    const nuevoForm = formQrManual.cloneNode(true);
    formQrManual.parentNode.replaceChild(nuevoForm, formQrManual);
    
    nuevoForm.addEventListener('submit', async e => {
        e.preventDefault();
        const raw = document.getElementById('qr-raw-data').value;
        
        if (!raw.trim()) { 
            toast('⚠️ El campo de nombres está vacío'); 
            return; 
        }
        
        toast('⏳ Generando paquete ZIP, por favor espera...');
        const form = new FormData();
        form.append('raw_data', raw);
        
        try {
            const currentToken = state.token || localStorage.getItem('token');
            const res = await fetch('/api/qr/manual', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` },
                body: form,
            });
            
            if (!res.ok) throw new Error('Error al generar el ZIP');
            
            const filename = obtenerNombreArchivoDesdeHeaders(res);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Limpiar el campo después de descargar
            document.getElementById('qr-raw-data').value = '';
            
            toast(`✅ ¡Descarga iniciada: ${filename} y campo limpiado!`);
        } catch (err) {
            console.error(err);
            toast('❌ Error: ' + err.message);
        }
    });
}

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
// ============ FORZAR EVENTO DE LOGOUT ============
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
        e.preventDefault(); // Prevenir cualquier comportamiento por defecto
        logout();
    });
} else {
    console.error("❌ ERROR: No se encontró el botón con id 'btn-logout' en el HTML");
}

// ============ INICIO ============
if (state.token && state.user) {
    iniciarApp();
}