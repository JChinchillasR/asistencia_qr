from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
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
        print(f"\n{'='*60}")
        print(f"📡 RECIBIENDO ESCANEO QR")
        print(f"Token recibido: '{payload.qr_token}'")
        print(f"Materia ID: {payload.materia_id}")
        print(f"Profesor: {profesor.full_name}")
        print(f"{'='*60}\n")

        # 1. Validar materia
        materia = db.query(Materia).filter(Materia.id == payload.materia_id).first()
        if not materia:
            raise HTTPException(404, f"Materia con ID {payload.materia_id} no encontrada")
        
        if profesor.role != "admin" and materia.profesor_id != profesor.id:
            raise HTTPException(403, "No autorizado para esta materia")

        # 2. Buscar alumno (Cargamos sus relaciones para la validación)
        alumno = (
            db.query(Alumno)
            .options(
                joinedload(Alumno.grupo).joinedload(Grupo.materias_asignadas).joinedload(HorarioMateria.materia)
            )
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

        print(f"✅ Alumno encontrado: {alumno.nombre_completo} (ID: {alumno.id})")

        # 3. 🎯 NUEVA LÓGICA: Verificar que el grupo del alumno toma esta materia
        try:
            # alumno.grupo.materias_asignadas es una lista de objetos HorarioMateria
            grupo_toma_materia = any(h.materia.id == materia.id for h in alumno.grupo.materias_asignadas)
        except AttributeError:
            grupo_toma_materia = False

        if not grupo_toma_materia:
            print(f"⚠️ ADVERTENCIA: El grupo '{alumno.grupo.nombre}' del alumno no toma esta materia")
            return AsistenciaRespuesta(
                status="NO_ENCONTRADO",
                alumno=alumno.nombre_completo,
                materia=materia.nombre,
            )

        # 4. Registrar asistencia
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
                grupo=alumno.grupo.nombre,  # 🎯 AQUÍ ESTABA EL ERROR (,rInfo eliminado)
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
        
        print(f"✅ ASISTENCIA REGISTRADA EXITOSAMENTE")
        
        return AsistenciaRespuesta(
            status="REGISTRO_NUEVO",
            alumno=alumno.nombre_completo,
            materia=materia.nombre,
            grupo=alumno.grupo.nombre,
            hora=hora.strftime("%H:%M:%S"),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ ERROR INESPERADO EN REGISTRO DE ASISTENCIA")
        print(f"Tipo de error: {type(e).__name__}")
        print(f"Mensaje: {str(e)}")
        print(f"{'='*60}\n")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error interno: {type(e).__name__} - {str(e)}")