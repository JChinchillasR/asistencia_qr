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
    nombre_limpio = re.sub(r'[^\w\s-]', '', nombre).strip()
    return re.sub(r'[-\s]+', '_', nombre_limpio).rstrip('_').rstrip('-')


@router.get("/alumno/{alumno_id}")
def qr_individual(
    alumno_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.query(Alumno).filter(Alumno.id == alumno_id).first()
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    
    # 🔄 NUEVA LÓGICA N:M: Verificar si el usuario tiene permiso sobre alguna materia del grupo
    if user.role != "admin":
        tiene_permiso = any(m.profesor_id == user.id for m in a.grupo.materias)
        if not tiene_permiso:
            raise HTTPException(403, "No autorizado para ver este QR")
    
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
    # 🔄 IMPORTANTE: Cargar 'materias' para la validación de permisos
    g = db.query(Grupo).options(
        joinedload(Grupo.alumnos),
        joinedload(Grupo.materias)
    ).filter(Grupo.id == grupo_id).first()
    
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    
    # 🔄 NUEVA LÓGICA N:M: Verificar permisos
    if user.role != "admin":
        tiene_permiso = any(m.profesor_id == user.id for m in g.materias)
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
    
    materia_nombre = sanitizar_nombre_archivo(g.materias[0].nombre) if g.materias else "Materia"
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