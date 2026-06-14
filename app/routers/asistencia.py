from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.materia import Materia
from app.models.alumno import Alumno
from app.models.asistencia import Asistencia
from app.schemas.asistencia import RegistroQR, AsistenciaRespuesta

router = APIRouter(prefix="/api/asistencia", tags=["asistencia"])


@router.post("/registrar", response_model=AsistenciaRespuesta)
def registrar(
    payload: RegistroQR,
    db: Session = Depends(get_db),
    profesor: User = Depends(get_current_user),
):
    # Validar materia del profesor
    materia = (
        db.query(Materia)
        .filter(Materia.id == payload.materia_id)
        .first()
    )
    if not materia:
        raise HTTPException(404, "Materia no encontrada")
    if profesor.role != "admin" and materia.profesor_id != profesor.id:
        raise HTTPException(403, "No autorizado para esta materia")

    # Buscar alumno por qr_token o matricula
    alumno = (
        db.query(Alumno)
        .filter(
            (Alumno.qr_token == payload.qr_token)
            | (Alumno.matricula == payload.qr_token)
        )
        .first()
    )
    if not alumno:
        return AsistenciaRespuesta(
            status="NO_ENCONTRADO",
            alumno=payload.qr_token,
            materia=materia.nombre,
        )

    # Verificar que el alumno pertenece a un grupo de la materia
    if alumno.grupo.materia_id != materia.id:
        return AsistenciaRespuesta(
            status="NO_ENCONTRADO",
            alumno=alumno.nombre_completo,
            materia=materia.nombre,
        )

    ahora = datetime.now(settings.tz)
    hoy = ahora.date()
    hora = ahora.time()

    existente = (
        db.query(Asistencia)
        .filter(
            Asistencia.alumno_id == alumno.id,
            Asistencia.materia_id == materia.id,
            Asistencia.fecha == hoy,
        )
        .first()
    )
    if existente:
        return AsistenciaRespuesta(
            status="DUPLICADO",
            alumno=alumno.nombre_completo,
            materia=materia.nombre,
            grupo=alumno.grupo.nombre,
            hora=existente.hora_entrada.strftime("%H:%M:%S"),
        )

    registro = Asistencia(
        alumno_id=alumno.id,
        materia_id=materia.id,
        grupo_id=alumno.grupo_id,
        profesor_id=profesor.id,
        fecha=hoy,
        hora_entrada=hora,
        estatus="Presente",
    )
    db.add(registro)
    db.commit()
    return AsistenciaRespuesta(
        status="REGISTRO_NUEVO",
        alumno=alumno.nombre_completo,
        materia=materia.nombre,
        grupo=alumno.grupo.nombre,
        hora=hora.strftime("%H:%M:%S"),
    )