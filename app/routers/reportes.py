import io
from datetime import datetime, date
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from openpyxl import Workbook
from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.asistencia import Asistencia
from app.models.materia import Materia
from app.schemas.asistencia import AsistenciaRow

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


def _query_base(db: Session, user: User):
    q = db.query(Asistencia).options(
        joinedload(Asistencia.alumno),
        joinedload(Asistencia.materia),
        joinedload(Asistencia.grupo),
        joinedload(Asistencia.profesor),
    )
    if user.role != "admin":
        q = q.filter(Asistencia.profesor_id == user.id)
    return q


@router.get("/hoy", response_model=list[AsistenciaRow])
def reporte_hoy(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    hoy = datetime.now(settings.tz).date()
    rows = (
        _query_base(db, user)
        .filter(Asistencia.fecha == hoy)
        .order_by(Asistencia.materia_id, Asistencia.hora_entrada.desc())
        .all()
    )
    return [
        AsistenciaRow(
            id=r.id,
            alumno_nombre=r.alumno.nombre_completo,
            matricula=r.alumno.matricula,
            grupo=r.grupo.nombre,
            materia=r.materia.nombre,
            fecha=r.fecha,
            hora_entrada=r.hora_entrada,
            estatus=r.estatus,
            profesor=r.profesor.full_name,
        )
        for r in rows
    ]


@router.get("/historial", response_model=list[AsistenciaRow])
def reporte_historial(
    fecha_inicio: date = Query(None),
    fecha_fin: date = Query(None),
    materia_id: int = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = _query_base(db, user)
    if fecha_inicio:
        q = q.filter(Asistencia.fecha >= fecha_inicio)
    if fecha_fin:
        q = q.filter(Asistencia.fecha <= fecha_fin)
    if materia_id:
        q = q.filter(Asistencia.materia_id == materia_id)
    rows = q.order_by(Asistencia.fecha.desc(), Asistencia.hora_entrada.desc()).all()
    return [
        AsistenciaRow(
            id=r.id,
            alumno_nombre=r.alumno.nombre_completo,
            matricula=r.alumno.matricula,
            grupo=r.grupo.nombre,
            materia=r.materia.nombre,
            fecha=r.fecha,
            hora_entrada=r.hora_entrada,
            estatus=r.estatus,
            profesor=r.profesor.full_name,
        )
        for r in rows
    ]


@router.get("/excel/hoy")
def excel_hoy(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    hoy = datetime.now(settings.tz).date()
    rows = (
        _query_base(db, user)
        .filter(Asistencia.fecha == hoy)
        .order_by(Asistencia.materia_id, Asistencia.hora_entrada)
        .all()
    )
    return _generar_excel(rows, f"asistencia_{hoy.isoformat()}.xlsx")


@router.get("/excel/historial")
def excel_historial(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        _query_base(db, user)
        .order_by(Asistencia.fecha.desc(), Asistencia.hora_entrada)
        .all()
    )
    return _generar_excel(rows, "historial_completo.xlsx")


def _generar_excel(rows, filename: str):
    wb = Workbook()
    ws = wb.active
    ws.title = "Asistencia"
    headers = [
        "Fecha", "Materia", "Grupo", "Matrícula",
        "Alumno", "Hora Entrada", "Estatus", "Profesor",
    ]
    ws.append(headers)
    for r in rows:
        ws.append([
            r.fecha.isoformat(),
            r.materia.nombre,
            r.grupo.nombre,
            r.alumno.matricula,
            r.alumno.nombre_completo,
            r.hora_entrada.strftime("%H:%M:%S"),
            r.estatus,
            r.profesor.full_name,
        ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )