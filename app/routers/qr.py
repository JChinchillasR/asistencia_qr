from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
import io
import re
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.grupo import Grupo
from app.models.materia import HorarioMateria
from app.models.alumno import Alumno
from app.services.qr_service import generar_qr_imagen, generar_zip_qrs

router = APIRouter(prefix="/api/qr", tags=["qr"])

def sanitizar_nombre_archivo(nombre: str) -> str:
    """Elimina caracteres peligrosos y reemplaza espacios por guiones bajos."""
    nombre_limpio = re.sub(r'[^\w\s-]', '', nombre).strip()
    return re.sub(r'[-\s]+', '_', nombre_limpio).rstrip('_').rstrip('-')


@router.get("/alumno/{alumno_id}")
def qr_individual(
    alumno_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 🎯 Cargamos el alumno y su grupo con las materias_asignadas para validar permisos
    a = db.query(Alumno).options(
        joinedload(Alumno.grupo).joinedload(Grupo.materias_asignadas).joinedload(HorarioMateria.materia)
    ).filter(Alumno.id == alumno_id).first()
    
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    
    # 🎯 LÓGICA DE PERMISOS CORREGIDA:
    if user.role != "admin":
        if a.grupo.materias_asignadas:
            tiene_permiso = any(h.materia.profesor_id == user.id for h in a.grupo.materias_asignadas)
            if not tiene_permiso:
                raise HTTPException(403, "No autorizado para ver este QR")
        # Si el grupo no tiene materias aún, permitimos ver el QR (configuración inicial)
    
    img = generar_qr_imagen(contenido_qr=a.qr_token, texto_inferior=a.nombre_completo)
    return StreamingResponse(
        io.BytesIO(img),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="qr_{sanitizar_nombre_archivo(a.matricula)}.png"'},
    )


@router.get("/zip/grupo/{grupo_id}")
def qr_zip_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 🎯 Cargamos el grupo con alumnos y materias_asignadas
    g = db.query(Grupo).options(
        joinedload(Grupo.alumnos),
        joinedload(Grupo.materias_asignadas).joinedload(HorarioMateria.materia)
    ).filter(Grupo.id == grupo_id).first()
    
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    
    # 🎯 LÓGICA DE PERMISOS CORREGIDA:
    if user.role != "admin":
        if g.materias_asignadas:
            tiene_permiso = any(h.materia.profesor_id == user.id for h in g.materias_asignadas)
            if not tiene_permiso:
                raise HTTPException(403, "No autorizado para este grupo")
    
    alumnos = [
        {
            "nombre": a.nombre_completo,
            "matricula": a.matricula,
            "qr_token": a.qr_token
        }
        for a in g.alumnos
    ]
    
    # Usamos el nombre de la primera materia asignada para el nombre del archivo, o "Grupo" si no hay materias
    materia_nombre = sanitizar_nombre_archivo(g.materias_asignadas[0].materia.nombre) if g.materias_asignadas else "Grupo"
    grupo_nombre = sanitizar_nombre_archivo(g.nombre)
    filename = f"qrs_{materia_nombre}_{grupo_nombre}.zip"
    
    zip_bytes = generar_zip_qrs(alumnos)
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/manual")
def qr_manual_pack(raw_data: str = Form(...)):
    lineas = [l.strip() for l in raw_data.strip().split("\n") if l.strip()]
    
    alumnos = [
        {
            "nombre": n,
            "matricula": "",
            "qr_token": n
        } 
        for n in lineas
    ]
    
    zip_bytes = generar_zip_qrs(alumnos)
    filename = "qrs_generacion_manual.zip"
    
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )