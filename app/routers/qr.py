from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
import io
import re
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.grupo import Grupo
from app.models.alumno import Alumno
from app.services.qr_service import generar_qr_imagen, generar_zip_qrs

router = APIRouter(prefix="/api/qr", tags=["qr"])

def sanitizar_nombre_archivo(nombre: str) -> str:
    """Elimina caracteres peligrosos y reemplaza espacios por guiones bajos."""
    # 1. Eliminar todo lo que no sea letra, número, guión o guión bajo
    nombre_limpio = re.sub(r'[^\w\s-]', '', nombre).strip()
    # 2. Reemplazar espacios y guiones múltiples por un solo guion bajo
    nombre_limpio = re.sub(r'[-\s]+', '_', nombre_limpio)
    # 3. 🎯 IMPORTANTE: Eliminar cualquier guion bajo o espacio que haya quedado al final
    return nombre_limpio.rstrip('_').rstrip('-')


@router.get("/alumno/{alumno_id}")
def qr_individual(
    alumno_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.query(Alumno).filter(Alumno.id == alumno_id).first()
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    if user.role != "admin" and a.grupo.materia.profesor_id != user.id:
        raise HTTPException(403, "No autorizado")
    
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
    g = db.query(Grupo).options(joinedload(Grupo.alumnos)).filter(Grupo.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    if user.role != "admin" and g.materia.profesor_id != user.id:
        raise HTTPException(403, "No autorizado")
    
    alumnos = [
        {
            "nombre": a.nombre_completo,
            "matricula": a.matricula,
            "qr_token": a.qr_token
        }
        for a in g.alumnos
    ]
    
    # 🎯 NOMBRE DE ARCHIVO PERSONALIZADO: qrs_Materia_Grupo.zip
    materia_nombre = sanitizar_nombre_archivo(g.materia.nombre)
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
    
    # 🎯 NOMBRE DE ARCHIVO FIJO PARA MANUAL
    filename = "qrs_generacion_manual.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )