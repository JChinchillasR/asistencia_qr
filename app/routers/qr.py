from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
import io
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.grupo import Grupo
from app.models.alumno import Alumno
from app.services.qr_service import generar_qr_imagen, generar_zip_qrs

router = APIRouter(prefix="/api/qr", tags=["qr"])


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
    img = generar_qr_imagen(a.qr_token)
    return StreamingResponse(
        io.BytesIO(img),
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="qr_{a.matricula}.png"'},
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
        {"nombre": a.nombre_completo, "matricula": a.qr_token}
        for a in g.alumnos
    ]
    zip_bytes = generar_zip_qrs(alumnos)
    filename = f"qrs_{g.nombre.replace(' ', '_')}.zip"
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

from fastapi import Form

@router.post("/manual")
def qr_manual_pack(raw_data: str = Form(...)):
    """Genera ZIP de QRs desde una lista de texto (un nombre por línea)."""
    lineas = [l.strip() for l in raw_data.strip().split("\n") if l.strip()]
    alumnos = [{"nombre": n, "matricula": n} for n in lineas]
    zip_bytes = generar_zip_qrs(alumnos)
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="qrs_alta_resolucion.zip"'},
    )