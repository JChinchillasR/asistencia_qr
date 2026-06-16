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
    // 🎯 Cambiamos textContent por innerHTML para que respete etiquetas como <strong>
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

// ============ MATERIAS ============

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
        const grupos = await api(`/api/grupos/materia/${materiaId}`);
        info.innerHTML = `<strong>${grupos.length}</strong> grupo(s) asignado(s) a esta materia.`;
    } catch (err) {
        info.innerHTML = '';
    }
}

// 3. Cargar lista de materias (CON TARJETAS MÁS GRANDES Y LEGIBLES)
async function cargarMaterias() {
    const cont = document.getElementById('lista-materias');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const materias = await api('/api/materias');
        if (!materias.length) {
            cont.innerHTML = '<p style="color:var(--text-soft)">No tienes materias. Crea la primera.</p>';
            return;
        }
        cont.innerHTML = materias.map(m => {
            const horariosHtml = m.horarios && m.horarios.length > 0 
                ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; margin-bottom: 8px;">` + 
                  m.horarios.map(h => `<span style="background:var(--primary-light, #e3f2fd); color:var(--primary, #1976d2); padding:6px 12px; border-radius:6px; font-size:14px; font-weight:600;">🕒 ${h.descripcion}</span>`).join('') + 
                  `</div>`
                : `<div style="margin-top:12px; font-size:14px; color:var(--text-soft);">Sin horarios definidos</div>`;

            return `
            <div class="grid-card" style="padding: 20px; margin-bottom: 15px;">
                <h3 style="font-size: 1.25rem; margin-bottom: 8px; color: var(--text);">${m.nombre}</h3>
                <div class="meta" style="font-size: 0.95rem; margin-bottom: 12px; color: var(--text-soft);">
                    Clave: <strong>${m.clave}</strong> · Semestre: <strong>${m.semestre}</strong>
                </div>
                ${horariosHtml}
                <div class="acciones" style="margin-top: 16px; display:flex; gap: 10px; flex-wrap:wrap;">
                    <button class="btn btn-sm btn-secondary" onclick="verGruposAsignadosAMateria(${m.id}, '${m.nombre.replace(/'/g, "\\'")}')">👥 Ver grupos</button>
                    <button class="btn btn-sm btn-primary" onclick="asignarGruposAMateria(${m.id}, '${m.nombre.replace(/'/g, "\\'")}')">⚙️ Asignar grupo</button>
                    <button class="btn btn-sm btn-secondary" onclick="editarMateria(${m.id})">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarMateria(${m.id})">🗑️ Eliminar</button>
                </div>
            </div>
        `}).join('');
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

// 🆕 FUNCIÓN NUEVA: Ver qué grupos tiene una materia
async function verGruposAsignadosAMateria(materiaId, materiaNombre) {
    try {
        const asignaciones = await api(`/api/materias/${materiaId}/asignaciones`);
        const todosLosGrupos = await api('/api/grupos');
        
        if (!asignaciones || asignaciones.length === 0) {
            toast('ℹ️ No hay grupos asignados a esta materia aún.');
            return;
        }

        // Agrupar las asignaciones por descripción de horario
        const porHorario = {};
        asignaciones.forEach(a => {
            if (!porHorario[a.horario_desc]) porHorario[a.horario_desc] = [];
            const grupoEncontrado = todosLosGrupos.find(g => g.id === a.grupo_id);
            const nombreGrupo = grupoEncontrado ? grupoEncontrado.nombre : 'Grupo desconocido';
            porHorario[a.horario_desc].push(nombreGrupo);
        });

        let html = '';
        for (const [horario, grupos] of Object.entries(porHorario)) {
            html += `<h4 style="margin: 15px 0 5px 0; font-size: 15px; color: var(--primary, #007bff); border-bottom: 1px solid var(--border); padding-bottom: 5px;">🕒 ${horario}</h4>`;
            html += `<ul style="margin: 0 0 15px 0; padding-left: 20px; color: var(--text, #333);">`;
            grupos.forEach(g => html += `<li style="margin-bottom: 4px;">${g}</li>`);
            html += `</ul>`;
        }

        openModal(`Grupos en: <strong>${materiaNombre}</strong>`, `
            <div style="padding: 10px;">
                ${html}
            </div>
            <div class="modal-actions" style="margin-top:20px; justify-content:flex-end;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cerrar</button>
            </div>
        `);
    } catch (err) {
        toast('❌ Error: ' + err.message);
    }
}

// 🆕 FUNCIÓN PARA EDITAR MATERIA
async function editarMateria(id) {
    try {
        const materias = await api('/api/materias');
        const m = materias.find(mat => mat.id === id);
        if (!m) return;

        const horariosTexto = m.horarios.map(h => h.descripcion).join('\n');

        openModal(`Editar materia: <strong>${m.nombre}</strong>`, `
            <form id="form-editar-materia">
                <label style="font-size:15px; font-weight:600;">Nombre de la materia</label>
                <input type="text" name="nombre" value="${m.nombre}" required style="font-size:15px; padding:10px; width:100%;">
                
                <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Clave</label>
                <input type="text" name="clave" value="${m.clave}" required style="font-size:15px; padding:10px; width:100%;">
                
                <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Semestre</label>
                <input type="text" name="semestre" value="${m.semestre}" required style="font-size:15px; padding:10px; width:100%;">
                
                <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Horarios (uno por línea)</label>
                <textarea name="horarios" rows="3" style="font-size:15px; padding:10px; width:100%; font-family:inherit;">${horariosTexto}</textarea>
                
                <div class="modal-actions" style="margin-top:20px;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Guardar Cambios</button>
                </div>
            </form>
        `);

        document.getElementById('form-editar-materia').onsubmit = async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const horariosArray = fd.get('horarios').split('\n').map(h => h.trim()).filter(h => h.length > 0);

            try {
                await api(`/api/materias/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        nombre: fd.get('nombre'),
                        clave: fd.get('clave'),
                        semestre: fd.get('semestre'),
                        horarios: horariosArray
                    }),
                });
                closeModal();
                toast('✅ Materia actualizada correctamente');
                cargarMaterias();
                cargarMateriasSelects();
            } catch (err) {
                toast('❌ Error: ' + err.message);
            }
        };
    } catch (err) {
        toast('❌ Error al cargar datos: ' + err.message);
    }
}

// ============ ASIGNAR GRUPOS A UNA MATERIA (CORREGIDO: USA MEMORIA LOCAL) ============
async function asignarGruposAMateria(materiaId, materiaNombre) {
    try {
        // 🎯 CORRECCIÓN: Buscar la materia en el estado local en lugar de hacer un GET al backend
        const materia = state.materias.find(m => m.id === parseInt(materiaId));
        
        if (!materia) {
            toast('⚠️ Materia no encontrada. Por favor, recarga la página.');
            return;
        }

        const todosLosGrupos = await api('/api/grupos');
        const asignacionesActuales = await api(`/api/materias/${materiaId}/asignaciones`);
        
        if (!materia.horarios || materia.horarios.length === 0) {
            toast('⚠️ Primero debes agregar al menos un horario a esta materia.');
            return;
        }

        let htmlHorarios = '';
        materia.horarios.forEach(horario => {
            htmlHorarios += `<h4 style="margin: 20px 0 10px 0; font-size: 16px; color: var(--primary, #007bff); border-bottom: 2px solid var(--border); padding-bottom: 5px;">🕒 ${horario.descripcion}</h4>`;
            
            const opcionesGrupo = (todosLosGrupos || []).map(g => {
                const estaAsignado = (asignacionesActuales || []).some(a => a.grupo_id === g.id && a.horario_materia_id === horario.id);
                const isChecked = estaAsignado ? 'checked' : '';
                
                return `
                <label style="
                    display: flex; align-items: center; gap: 15px; padding: 12px 15px; margin: 8px 0; 
                    background: var(--bg-soft, #f8f9fa); border: 2px solid var(--border, #e0e0e0); 
                    border-radius: 8px; cursor: pointer; transition: all 0.2s ease; font-size: 16px;
                " onmouseover="this.style.borderColor='var(--primary, #007bff)'; this.style.background='var(--primary-light, #e3f2fd)'" 
                   onmouseout="this.style.borderColor='var(--border, #e0e0e0)'; this.style.background='var(--bg-soft, #f8f9fa)'">
                    <input type="checkbox" class="check-asignacion-grupo" data-grupo="${g.id}" data-horario="${horario.id}" ${isChecked} style="
                        width: 20px; height: 20px; cursor: pointer; accent-color: var(--primary, #007bff); flex-shrink: 0;
                    "> 
                    <span>${g.nombre}</span>
                </label>`;
            }).join('');
            
            htmlHorarios += opcionesGrupo || '<p style="color:var(--text-soft); font-size:14px; padding:10px;">No hay grupos creados.</p>';
        });

        openModal(`Asignar grupos a: <strong>${materiaNombre}</strong>`, `
            <div class="info-box" style="font-size:15px; margin-bottom:15px;">
                Selecciona qué grupo toma la materia en cada horario específico.
            </div>
            <form id="form-asignar-grupos-a-materia">
                <div style="max-height: 400px; overflow-y: auto; padding: 5px 10px;">
                    ${htmlHorarios}
                </div>
                <div class="modal-actions" style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Guardar Asignaciones</button>
                </div>
            </form>
        `);

        document.getElementById('form-asignar-grupos-a-materia').onsubmit = async e => {
            e.preventDefault();
            const checkboxes = document.querySelectorAll('.check-asignacion-grupo:checked');
            const asignaciones = Array.from(checkboxes).map(cb => ({
                grupo_id: parseInt(cb.dataset.grupo),
                horario_materia_id: parseInt(cb.dataset.horario)
            }));
            
            toast('⏳ Guardando asignaciones...');
            try {
                await api(`/api/materias/${materiaId}/asignaciones`, {
                    method: 'POST',
                    body: JSON.stringify({ asignaciones })
                });
                closeModal();
                toast('✅ Asignaciones guardadas correctamente');
                actualizarInfoGrupoActiva();
            } catch (err) {
                toast('❌ Error: ' + err.message);
            }
        };
    } catch (err) {
        toast('❌ Error al cargar datos: ' + err.message);
    }
}

// 4. Eliminar materia (CORREGIDO Y FUNCIONAL)
async function eliminarMateria(id) {
    if (!confirm('¿Eliminar esta materia? \n\nLos grupos y alumnos NO se eliminarán, solo se desvincularán de esta materia.')) return;
    try {
        await api(`/api/materias/${id}`, { method: 'DELETE' });
        toast('✅ Materia eliminada correctamente');
        cargarMaterias();
        cargarMateriasSelects();
    } catch (err) {
        toast('❌ Error: ' + err.message);
    }
}

// 5. Crear nueva materia (CON SOPORTE PARA MÚLTIPLES HORARIOS)
document.getElementById('btn-nueva-materia').addEventListener('click', () => {
    openModal('Nueva materia', `
        <form id="form-nueva-materia">
            <label style="font-size:15px; font-weight:600;">Nombre de la materia</label>
            <input type="text" name="nombre" required style="font-size:15px; padding:10px;">
            
            <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Clave (única)</label>
            <input type="text" name="clave" required placeholder="Ej: BIOQ-101" style="font-size:15px; padding:10px;">
            
            <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Semestre</label>
            <input type="text" name="semestre" required placeholder="Ej: 2026-2" style="font-size:15px; padding:10px;">
            
            <label style="font-size:15px; font-weight:600; margin-top:12px; display:block;">Horarios (uno por línea, opcional)</label>
            <textarea name="horarios" rows="3" placeholder="Ej:&#10;Lunes y Miércoles 10:00 - 12:00&#10;Martes y Jueves 16:00 - 18:00" style="font-size:15px; padding:10px; font-family:inherit;"></textarea>
            
            <div class="modal-actions" style="margin-top:20px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Crear Materia</button>
            </div>
        </form>
    `);
    
    document.getElementById('form-nueva-materia').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        
        const horariosArray = fd.get('horarios')
            .split('\n')
            .map(h => h.trim())
            .filter(h => h.length > 0);

        try {
            await api('/api/materias', {
                method: 'POST',
                body: JSON.stringify({
                    nombre: fd.get('nombre'),
                    clave: fd.get('clave'),
                    semestre: fd.get('semestre'),
                    horarios: horariosArray
                }),
            });
            closeModal();
            toast('✅ Materia y horarios creados exitosamente');
            cargarMaterias();
            cargarMateriasSelects();
        } catch (err) {
            toast('❌ Error: ' + err.message);
        }
    };
});


// 6. Listar todos los grupos (Vista Grupos - Formato Horizontal, SIN HORARIO)
async function cargarVistaGrupos() {
    const cont = document.getElementById('lista-grupos-globales');
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    try {
        const grupos = await api('/api/grupos');
        if (!grupos.length) {
            cont.innerHTML = '<p style="color:var(--text-soft)">No hay grupos creados. Crea el primero.</p>';
        } else {
            cont.innerHTML = grupos.map(g => `
                <div class="card" style="width: 100%; margin-bottom: 15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="margin:0;">${g.nombre}</h3>
                            <!-- Se eliminó la visualización del horario -->
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-sm btn-secondary" onclick="toggleDetalleGrupo(${g.id}, '${g.nombre.replace(/'/g, "\\'")}')">👥 Ver alumnos</button>
                            <button class="btn btn-sm btn-danger" onclick="eliminarGrupo(${g.id})">🗑️</button>
                        </div>
                    </div>
                    <!-- Contenedor inline para los detalles -->
                    <div id="detalle-grupo-${g.id}" style="display:none; margin-top:15px; border-top:1px solid var(--border); padding-top:15px;">
                        <p style="color:var(--text-soft)">Cargando detalles...</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

// ============ ELIMINAR GRUPO ============
async function eliminarGrupo(id) {
    if (!confirm('¿Eliminar este grupo y a TODOS sus alumnos? \n\nEsta acción no se puede deshacer.')) return;
    
    try {
        await api(`/api/grupos/${id}`, { method: 'DELETE' });
        toast('✅ Grupo eliminado correctamente');
        cargarVistaGrupos(); // Recargar la lista para que desaparezca de la pantalla
    } catch (err) {
        toast('❌ Error al eliminar: ' + err.message);
    }
}

// 🎯 BLINDAJE DEL BOTÓN "NUEVO GRUPO" (SIN HORARIO)
const btnNuevoGrupoGlobal = document.getElementById('btn-nuevo-grupo-global');
if (btnNuevoGrupoGlobal) {
    btnNuevoGrupoGlobal.addEventListener('click', () => {
        openModal('Nuevo Grupo', `
            <form id="form-nuevo-grupo-global">
                <label>Nombre del grupo</label>
                <input type="text" name="nombre" required placeholder="Ej: Grupo 01">
                <!-- Se eliminó el campo de horario -->
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Crear</button>
                </div>
            </form>
        `);
        
        // Asignamos el evento de submit inmediatamente después de crear el modal
        const form = document.getElementById('form-nuevo-grupo-global');
        form.onsubmit = async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await api('/api/grupos', {
                    method: 'POST',
                    body: JSON.stringify({
                        nombre: fd.get('nombre'),
                        horario: "" // Enviamos vacío para cumplir con el backend sin mostrarlo
                    }),
                });
                closeModal();
                toast('✅ Grupo creado exitosamente');
                cargarVistaGrupos(); // Recargar la lista inmediatamente
            } catch (err) {
                toast('❌ Error al crear grupo: ' + err.message);
            }
        };
    });
} else {
    console.error("⚠️ No se encontró el botón 'btn-nuevo-grupo-global' en el HTML");
}

// Función para expandir/colapsar y cargar detalles en línea
async function toggleDetalleGrupo(grupoId, nombreGrupo) {
    const cont = document.getElementById(`detalle-grupo-${grupoId}`);
    const btn = document.querySelector(`button[onclick^="toggleDetalleGrupo(${grupoId}"]`);
    
    if (cont.style.display !== 'none') {
        cont.style.display = 'none';
        cont.innerHTML = '';
        if (btn) btn.innerHTML = '👥 Ver alumnos';
        return;
    }
    
    cont.style.display = 'block';
    if (btn) btn.innerHTML = '🔼 Ocultar alumnos';
    cont.innerHTML = '<p style="color:var(--text-soft)">Cargando...</p>';
    
    try {
        const grupo = await api(`/api/grupos/${grupoId}`);
        renderizarContenidoDetalle(grupoId, grupo);
    } catch (err) {
        cont.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
    }
}

// Función auxiliar para renderizar el contenido (2/3 Alumnos, 1/3 Materias)
function renderizarContenidoDetalle(grupoId, grupo) {
    const cont = document.getElementById(`detalle-grupo-${grupoId}`);
    const nombreGrupo = grupo.nombre;

    // 1. ORDENAR ALUMNOS ALFABÉTICAMENTE
    const alumnosOrdenados = [...(grupo.alumnos || [])].sort((a, b) => 
        a.nombre_completo.localeCompare(b.nombre_completo, 'es', { sensitivity: 'base' })
    );

    // 2. Renderizar Materias (1/3 del ancho) CON DISTINCIÓN DE HORARIO
    let materiasHtml = '<p style="color:var(--text-soft); font-size:13px;">Sin materias asignadas.</p>';
    
    // Usamos el nuevo campo detallado. Si no existe, usamos el antiguo como fallback
    const listaDetallada = grupo.materias_con_horario || []; 
    
    if (listaDetallada.length > 0) {
        materiasHtml = `<div style="display:flex; flex-direction:column; gap:8px;">` + 
            listaDetallada.map(m => `
                <span style="background:var(--bg-soft); padding:8px 10px; border-radius:8px; font-size:13px; border:1px solid var(--border); line-height: 1.4;">
                    📚 <strong>${m.materia_nombre}</strong> <small>(${m.materia_clave})</small><br>
                    🕒 <span style="color:var(--primary, #007bff); font-weight:600;">${m.horario_descripcion}</span>
                </span>
            `).join('') + 
            `</div>`;
    }

    // 3. Renderizar Alumnos (2/3 del ancho)
    let alumnosHtml = '<p style="color:var(--text-soft); font-size:13px;">Sin alumnos registrados.</p>';
    if (alumnosOrdenados.length > 0) {
        alumnosHtml = `
            <div class="table-wrap" style="margin-top:10px; max-height: 400px; overflow-y: auto;">
                <table>
                    <thead><tr><th>Matrícula</th><th>Nombre</th><th></th></tr></thead>
                    <tbody>
                        ${alumnosOrdenados.map(a => `
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

    // 4. ESTRUCTURA DE GRID: 2/3 para Alumnos, 1/3 para Materias
    cont.innerHTML = `
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
            <div>
                <h4 style="margin-bottom:10px; font-size:15px;">👥 Alumnos (${alumnosOrdenados.length})</h4>
                ${alumnosHtml}
                <div style="display:flex; gap:8px; margin-top:10px;">
                    <button class="btn btn-sm btn-primary" onclick="nuevoAlumno(${grupoId})">+ Alumno</button>
                    <button class="btn btn-sm btn-secondary" onclick="nuevoAlumnoMasivo(${grupoId})">+ Varios</button>
                </div>
            </div>
            <div>
                <h4 style="margin-bottom:10px; font-size:15px;">📚 Materias (${grupo.materias ? grupo.materias.length : 0})</h4>
                ${materiasHtml}
                <button class="btn btn-sm btn-primary" style="margin-top:15px; width:100%;" onclick="asignarMateriasAGrupo(${grupoId}, '${nombreGrupo.replace(/'/g, "\\'")}')">+ Asignar Materia</button>
            </div>
        </div>
    `;
}

// 7. Funciones de Alumnos (adaptadas para refrescar la vista en línea)
function nuevoAlumno(grupoId) {
    openModal('Nuevo alumno', `
        <form id="form-nuevo-alumno">
            <label>Matrícula</label>
            <input type="text" name="matricula" required>
            <label>Nombre completo</label>
            <input type="text" name="nombre_completo" required>
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
            
            // Refrescar la vista en línea si está abierta
            const cont = document.getElementById(`detalle-grupo-${grupoId}`);
            if (cont && cont.style.display !== 'none') {
                cont.innerHTML = '<p style="color:var(--text-soft)">Actualizando...</p>';
                api(`/api/grupos/${grupoId}`).then(grupo => renderizarContenidoDetalle(grupoId, grupo));
            }
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
            
            // Refrescar la vista en línea si está abierta
            const cont = document.getElementById(`detalle-grupo-${grupoId}`);
            if (cont && cont.style.display !== 'none') {
                cont.innerHTML = '<p style="color:var(--text-soft)">Actualizando...</p>';
                api(`/api/grupos/${grupoId}`).then(grupo => renderizarContenidoDetalle(grupoId, grupo));
            }
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
        
        // Refrescar la vista en línea si está abierta
        const cont = document.getElementById(`detalle-grupo-${grupoId}`);
        if (cont && cont.style.display !== 'none') {
            cont.innerHTML = '<p style="color:var(--text-soft)">Actualizando...</p>';
            api(`/api/grupos/${grupoId}`).then(grupo => renderizarContenidoDetalle(grupoId, grupo));
        }
    } catch (err) {
        toast('Error: ' + err.message);
    }
}

// ============ ASIGNAR MATERIAS A UN GRUPO (CORREGIDO Y BLINDADO) ============
async function asignarMateriasAGrupo(grupoId, nombreGrupo) {
    try {
        const materias = await api('/api/materias');
        const grupo = await api(`/api/grupos/${grupoId}`);
        
        // 🎯 BLINDAJE: Usar || [] para evitar el error "Cannot read properties of undefined"
        const horariosAsignados = new Set(grupo.horarios_asignados || []);

        let htmlHorarios = '';
        for (const m of (materias || [])) {
            if (!m.horarios || m.horarios.length === 0) continue;
            
            htmlHorarios += `<h4 style="margin: 20px 0 10px 0; font-size: 16px; color: var(--primary, #007bff); border-bottom: 2px solid var(--border); padding-bottom: 5px;">📚 ${m.nombre} (${m.clave})</h4>`;
            
            const opcionesHorario = (m.horarios || []).map(h => {
                const isChecked = horariosAsignados.has(h.id) ? 'checked' : '';
                
                return `
                <label style="
                    display: flex; align-items: center; gap: 15px; padding: 12px 15px; margin: 8px 0; 
                    background: var(--bg-soft, #f8f9fa); border: 2px solid var(--border, #e0e0e0); 
                    border-radius: 8px; cursor: pointer; transition: all 0.2s ease; font-size: 16px;
                " onmouseover="this.style.borderColor='var(--primary, #007bff)'; this.style.background='var(--primary-light, #e3f2fd)'" 
                   onmouseout="this.style.borderColor='var(--border, #e0e0e0)'; this.style.background='var(--bg-soft, #f8f9fa)'">
                    <input type="checkbox" class="check-asignacion-materia" data-grupo="${grupoId}" data-horario="${h.id}" ${isChecked} style="
                        width: 20px; height: 20px; cursor: pointer; accent-color: var(--primary, #007bff); flex-shrink: 0;
                    "> 
                    <span>🕒 ${h.descripcion}</span>
                </label>`;
            }).join('');
            
            htmlHorarios += opcionesHorario || '<p style="color:var(--text-soft); font-size:14px; padding:10px;">Sin horarios definidos.</p>';
        }

        openModal(`Asignar materias a: <strong>${nombreGrupo}</strong>`, `
            <div class="info-box" style="font-size:15px; margin-bottom:15px;">
                Selecciona en qué horario de cada materia participará este grupo.
            </div>
            <form id="form-asignar-materias-a-grupo">
                <div style="max-height: 400px; overflow-y: auto; padding: 5px 10px;">
                    ${htmlHorarios || '<p style="color:var(--text-soft); font-size:15px; padding:20px; text-align:center;">No hay materias con horarios.</p>'}
                </div>
                <div class="modal-actions" style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="font-size:15px; padding:10px 20px;">Cancelar</button>
                    <button type="submit" class="btn btn-primary" style="font-size:15px; padding:10px 20px;">Guardar Asignaciones</button>
                </div>
            </form>
        `);

        document.getElementById('form-asignar-materias-a-grupo').onsubmit = async e => {
            e.preventDefault();
            const checkboxes = document.querySelectorAll('.check-asignacion-materia');
            
            toast('⏳ Guardando asignaciones...');
            try {
                for (const cb of checkboxes) {
                    const horarioId = parseInt(cb.dataset.horario);
                    if (cb.checked) {
                        await api(`/api/grupos/${grupoId}/asignar-horario?horario_materia_id=${horarioId}`, { method: 'POST' }).catch(() => {});
                    } else {
                        await api(`/api/grupos/${grupoId}/asignar-horario/${horarioId}`, { method: 'DELETE' }).catch(() => {});
                    }
                }
                
                closeModal();
                toast('✅ Asignaciones guardadas correctamente');
                
                const grupoActualizado = await api(`/api/grupos/${grupoId}`);
                renderizarContenidoDetalle(grupoId, grupoActualizado);
            } catch (err) {
                toast('❌ Error: ' + err.message);
            }
        };
    } catch (err) {
        toast('❌ Error al cargar materias: ' + err.message);
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

// ============ DESCARGAR EXCEL CON AUTENTICACIÓN ============

async function descargarExcelHoy() {
    toast('⏳ Generando reporte de hoy, por favor espera...');
    try {
        const currentToken = state.token || localStorage.getItem('token');
        
        const res = await fetch('/api/reportes/excel/hoy', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!res.ok) throw new Error('No autorizado o error en el servidor');
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'asistencia_hoy.xlsx';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast('✅ ¡Descarga de "Hoy" iniciada!');
    } catch (err) {
        console.error(err);
        toast('❌ Error al descargar: ' + err.message);
    }
}

async function descargarExcelHistorial() {
    toast('⏳ Generando historial completo, por favor espera...');
    try {
        const currentToken = state.token || localStorage.getItem('token');
        
        const res = await fetch('/api/reportes/excel/historial', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!res.ok) throw new Error('No autorizado o error en el servidor');
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'historial_completo.xlsx';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast('✅ ¡Descarga del "Historial" iniciada!');
    } catch (err) {
        console.error(err);
        toast('❌ Error al descargar: ' + err.message);
    }
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
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
    try {
        const users = await api('/api/auth/users');
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.full_name}</td>
                <td>${u.email}</td>
                <td><span class="badge">${u.role}</span></td>
                <td>${u.is_active ? '✅' : '❌'}</td>
                <td>
                    <button type="button" data-user-id="${u.id}" class="btn btn-secondary btn-editar-usuario">Editar</button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.btn-editar-usuario').forEach(btn => {
            btn.addEventListener('click', function () {
                const userId = parseInt(this.dataset.userId, 10);
                const user = users.find(u => u.id === userId);
                if (user) {
                    abrirEditarUsuario(user);
                }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">${err.message}</td></tr>`;
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

function abrirEditarUsuario(user) {
    const fullName = String(user.full_name).replace(/"/g, '&quot;');
    const email = String(user.email).replace(/"/g, '&quot;');
    const activo = user.is_active ? 'checked' : '';
    const selectedProfesor = user.role === 'profesor' ? 'selected' : '';
    const selectedAdmin = user.role === 'admin' ? 'selected' : '';

    openModal('Editar usuario', `
        <form id="form-editar-usuario">
            <input type="hidden" name="id" value="${user.id}">
            <label>Nombre completo</label>
            <input type="text" name="full_name" required value="${fullName}">
            <label>Email</label>
            <input type="email" name="email" required value="${email}">
            <label>Activo</label>
            <input type="checkbox" name="is_active" ${activo}>
            <label>Rol</label>
            <select name="role">
                <option value="profesor" ${selectedProfesor}>Profesor</option>
                <option value="admin" ${selectedAdmin}>Administrador</option>
            </select>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar cambios</button>
            </div>
        </form>
    `);

    document.getElementById('form-editar-usuario').onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api('/api/auth/edit', {
                method: 'POST',
                body: JSON.stringify({
                    id: parseInt(fd.get('id'), 10),
                    full_name: fd.get('full_name'),
                    email: fd.get('email'),
                    is_active: fd.get('is_active') === 'on',
                    role: fd.get('role'),
                }),
            });
            closeModal();
            toast('Usuario actualizado');
            cargarUsuarios();
        } catch (err) {
            toast('Error: ' + err.message);
        }
    };
}


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