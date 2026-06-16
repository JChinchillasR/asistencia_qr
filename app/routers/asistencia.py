from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta  # 🎯 Se agregó 'timedelta' aquí
from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.materia import Materia, HorarioMateria
from app.models.alumno import Alumno
from app.models.grupo import Grupo
from app.models.asistencia import Asistencia
from app.schemas.asistencia import RegistroQR, AsistenciaRespuesta

router = APIRouter(prefix="/api/asistencia", tags=["asistencia"])


@router.post("/registrar", response_model=AsistenciaRespuesta)
def registrar(
    payload: RegistroQR,
    db: Session = Depends(get_db),
    profesor: User = Depends(get_current_user),
):
    try:
        materia = db.query(Materia).filter(Materia.id == payload.materia_id).first()
        if not materia or (profesor.role != "admin" and materia.profesor_id != profesor.id):
            raise HTTPException(403, "No autorizado")

        alumno = db.query(Alumno).options(joinedload(Alumno.grupo).joinedload(Grupo.materias_asignadas)).filter(
            (Alumno.qr_token == payload.qr_token) | (Alumno.matricula == payload.qr_token)
        ).first()
        
        if not alumno:
            return AsistenciaRespuesta(status="NO_ENCONTRADO", alumno=payload.qr_token, materia=materia.nombre)

        # Validar que el grupo tome esta materia en este horario
        asignaciones = [h for h in alumno.grupo.materias_asignadas if h.materia.id == materia.id]
        if not any(h.id == payload.horario_materia_id for h in asignaciones):
            return AsistenciaRespuesta(status="ERROR_GRUPO", alumno=alumno.nombre_completo, materia=materia.nombre, horario_descripcion="Este grupo no está asignado a este horario.")

        horario_obj = next((h for h in asignaciones if h.id == payload.horario_materia_id), None)
        horario_desc = horario_obj.descripcion if horario_obj else "Sin horario"
        
        ahora = datetime.now(settings.tz)
        hoy = ahora.date()
        hora_actual = ahora.time()

        # 🎯 LÓGICA DE ESTATUS: PRESENTE vs RETARDO (Blindado con zona horaria)
        estatus_final = "Presente"
        if horario_obj and horario_obj.hora_inicio:
            # Crear un datetime consciente de la zona horaria para la comparación
            inicio_dt = datetime.combine(hoy, horario_obj.hora_inicio, tzinfo=ahora.tzinfo)
            limite_retardo = inicio_dt + timedelta(minutes=15)
            
            if ahora > limite_retardo:
                estatus_final = "Retardo"

        # Verificar duplicado
        existente = db.query(Asistencia).filter(
            Asistencia.alumno_id == alumno.id,
            Asistencia.materia_id == materia.id,
            Asistencia.fecha == hoy
        ).first()
        
        if existente:
            return AsistenciaRespuesta(
                status="DUPLICADO", alumno=alumno.nombre_completo, materia=materia.nombre,
                grupo=alumno.grupo.nombre, hora=existente.hora_entrada.strftime("%H:%M:%S"),
                estatus=existente.estatus, horario_descripcion=horario_desc
            )

        # Guardar nuevo registro
        registro = Asistencia(
            alumno_id=alumno.id, materia_id=materia.id, grupo_id=alumno.grupo_id,
            profesor_id=profesor.id, fecha=hoy, hora_entrada=hora_actual,
            estatus=estatus_final, horario_materia_id=payload.horario_materia_id
        )
        db.add(registro)
        db.commit()
        
        return AsistenciaRespuesta(
            status="REGISTRO_NUEVO", alumno=alumno.nombre_completo, materia=materia.nombre,
            grupo=alumno.grupo.nombre, hora=hora_actual.strftime("%H:%M:%S"),
            estatus=estatus_final, horario_descripcion=horario_desc
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # ============ FINALIZAR LISTA (MARCAR AUSENTES) ============
@router.post("/finalizar")
def finalizar_lista(
    materia_id: int,
    horario_materia_id: int,
    grupo_id: int,
    db: Session = Depends(get_db),
    profesor: User = Depends(get_current_user),
):
    # 1. Validar permisos
    materia = db.query(Materia).filter(Materia.id == materia_id).first()
    if not materia or (profesor.role != "admin" and materia.profesor_id != profesor.id):
        raise HTTPException(403, "No autorizado")

    # 2. Obtener todos los alumnos del grupo
    alumnos_grupo = db.query(Alumno).filter(Alumno.grupo_id == grupo_id).all()
    
    # 3. Obtener los que YA tienen asistencia hoy para esta materia
    hoy = datetime.now(settings.tz).date()
    alumnos_presentes = db.query(Asistencia.alumno_id).filter(
        Asistencia.materia_id == materia_id,
        Asistencia.fecha == hoy
    ).all()
    presentes_ids = {row[0] for row in alumnos_presentes}

    # 4. Marcar como Ausente a los que faltan
    count_ausentes = 0
    for alumno in alumnos_grupo:
        if alumno.id not in presentes_ids:
            registro = Asistencia(
                alumno_id=alumno.id,
                materia_id=materia_id,
                grupo_id=grupo_id,
                profesor_id=profesor.id,
                fecha=hoy,
                hora_entrada=datetime.now(settings.tz).time(),
                estatus="Ausente",
                horario_materia_id=horario_materia_id
            )
            db.add(registro)
            count_ausentes += 1
    
    db.commit()
    return {"ok": True, "ausentes_registrados": count_ausentes}