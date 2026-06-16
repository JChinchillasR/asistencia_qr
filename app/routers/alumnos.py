from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.grupo import Grupo
from app.models.materia import HorarioMateria
from app.models.alumno import Alumno
from app.schemas.alumno import AlumnoCreate, AlumnoOut

router = APIRouter(prefix="/api/alumnos", tags=["alumnos"])


def _verificar_grupo(db: Session, grupo_id: int, user: User) -> Grupo:
    """
    Verifica que el grupo exista y que el usuario tenga permiso.
    En el nuevo modelo, un profesor tiene permiso si el grupo tiene 
    asignada ALGUNA de sus materias, o si el grupo aún no tiene materias (para permitir configuración inicial).
    """
    # Cargamos el grupo con sus materias_asignadas para la validación
    g = db.query(Grupo).options(
        joinedload(Grupo.materias_asignadas).joinedload(HorarioMateria.materia)
    ).filter(Grupo.id == grupo_id).first()
    
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    
    # Si es admin, tiene permiso total
    if user.role == "admin":
        return g
        
    # 🎯 LÓGICA DE PERMISOS CORREGIDA:
    if g.materias_asignadas:
        # Si YA tiene materias, verificamos que al menos una sea del profesor
        tiene_permiso = any(h.materia.profesor_id == user.id for h in g.materias_asignadas)
        if not tiene_permiso:
            raise HTTPException(403, "No autorizado: Este grupo no tiene materias asignadas a ti.")
    # Si NO tiene materias aún, permitimos el acceso para que el profesor pueda agregar alumnos y asignar materias.
        
    return g


@router.get("/grupo/{grupo_id}", response_model=list[AlumnoOut])
def listar_alumnos_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verificar_grupo(db, grupo_id, user)
    return (
        db.query(Alumno)
        .filter(Alumno.grupo_id == grupo_id)
        .order_by(Alumno.nombre_completo)
        .all()
    )


@router.post("/", response_model=AlumnoOut, status_code=201)
def crear_alumno(
    payload: AlumnoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verificar_grupo(db, payload.grupo_id, user)
    
    if db.query(Alumno).filter(Alumno.matricula == payload.matricula).first():
        raise HTTPException(400, "La matrícula ya existe en el sistema")
        
    a = Alumno(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.post("/bulk", response_model=list[AlumnoOut], status_code=201)
def crear_alumnos_masivo(
    grupo_id: int,
    alumnos: list[AlumnoCreate],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verificar_grupo(db, grupo_id, user)
    creados = []
    for payload in alumnos:
        if db.query(Alumno).filter(Alumno.matricula == payload.matricula).first():
            continue # Saltar si ya existe para no fallar todo el lote
        a = Alumno(**payload.model_dump())
        db.add(a)
        creados.append(a)
    
    db.commit()
    for a in creados:
        db.refresh(a)
    return creados


@router.delete("/{alumno_id}")
def eliminar_alumno(
    alumno_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.query(Alumno).filter(Alumno.id == alumno_id).first()
    if not a:
        raise HTTPException(404, "Alumno no encontrado")
    _verificar_grupo(db, a.grupo_id, user)
    db.delete(a)
    db.commit()
    return {"ok": True}