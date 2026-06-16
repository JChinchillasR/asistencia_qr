from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.grupo import Grupo
from app.models.materia import HorarioMateria, Materia  # 🎯 AGREGADO: Materia
from app.models.asignacion_grupo_horario import AsignacionGrupoHorario
from app.schemas.grupo import GrupoCreate, GrupoOut

router = APIRouter(prefix="/api/grupos", tags=["grupos"])


@router.get("", response_model=list[GrupoOut])
def listar_grupos(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.query(Grupo).order_by(Grupo.nombre).all()


@router.get("/{grupo_id}")
def obtener_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = db.query(Grupo).options(
        joinedload(Grupo.alumnos),
        joinedload(Grupo.materias_asignadas).joinedload(HorarioMateria.materia)
    ).filter(Grupo.id == grupo_id).first()
    
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    
    if user.role != "admin":
        if g.materias_asignadas:
            tiene_permiso = any(h.materia.profesor_id == user.id for h in g.materias_asignadas)
            if not tiene_permiso:
                raise HTTPException(403, "No autorizado: Este grupo no tiene materias asignadas a ti.")

    materias_unicas = []
    materias_con_horario = []  # 🆕 NUEVO: Lista detallada para el frontend
    ids_vistos = set()
    horarios_asignados_ids = []
    
    for h in g.materias_asignadas:
        horarios_asignados_ids.append(h.id)
        
        # Agregar a la lista detallada (puede haber duplicados de materia si hay varios horarios, y está bien)
        materias_con_horario.append({
            "materia_nombre": h.materia.nombre,
            "materia_clave": h.materia.clave,
            "horario_descripcion": h.descripcion
        })
        
        # Mantener la lista única para compatibilidad
        if h.materia.id not in ids_vistos:
            materias_unicas.append({
                "id": h.materia.id,
                "nombre": h.materia.nombre,
                "clave": h.materia.clave
            })
            ids_vistos.add(h.materia.id)

    return {
        "id": g.id,
        "nombre": g.nombre,
        "horario": g.horario,
        "generacion": g.generacion,
        "alumnos": g.alumnos,
        "materias": materias_unicas,
        "materias_con_horario": materias_con_horario,  # 🆕 NUEVO
        "horarios_asignados": horarios_asignados_ids
    }

@router.post("", response_model=GrupoOut, status_code=201)
def crear_grupo(
    payload: GrupoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existente = db.query(Grupo).filter(Grupo.nombre == payload.nombre).first()
    if existente:
        raise HTTPException(400, f"Ya existe un grupo llamado '{payload.nombre}'")
    
    g = Grupo(**payload.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.delete("/{grupo_id}")
def eliminar_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = db.query(Grupo).filter(Grupo.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    
    if user.role != "admin":
        if g.materias_asignadas:
            tiene_permiso = any(h.materia.profesor_id == user.id for h in g.materias_asignadas)
            if not tiene_permiso:
                raise HTTPException(403, "No autorizado")
            
    db.delete(g)
    db.commit()
    return {"ok": True}


# Endpoint para obtener los grupos de una materia específica (para el escáner y reportes)
@router.get("/materia/{materia_id}")
def listar_grupos_de_materia(
    materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    horarios = db.query(HorarioMateria).filter(HorarioMateria.materia_id == materia_id).all()
    horario_ids = [h.id for h in horarios]
    
    if not horario_ids:
        return []
        
    asignaciones = db.query(AsignacionGrupoHorario).filter(
        AsignacionGrupoHorario.horario_materia_id.in_(horario_ids)
    ).all()
    
    grupo_ids = list(set([a.grupo_id for a in asignaciones]))
    
    if not grupo_ids:
        return []
        
    grupos = db.query(Grupo).filter(Grupo.id.in_(grupo_ids)).order_by(Grupo.nombre).all()
    return grupos


# ============ ASIGNACIÓN DE HORARIOS A GRUPOS ============

@router.post("/{grupo_id}/asignar-horario")
def asignar_horario_a_grupo(
    grupo_id: int,
    horario_materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verificar que el horario existe y pertenece a una materia del usuario
    h = db.query(HorarioMateria).join(Materia).filter(
        HorarioMateria.id == horario_materia_id,
        Materia.profesor_id == user.id
    ).first()
    
    if not h:
        raise HTTPException(403, "No autorizado o horario no encontrado")
    
    # Verificar si ya existe la asignación
    existente = db.query(AsignacionGrupoHorario).filter(
        AsignacionGrupoHorario.grupo_id == grupo_id,
        AsignacionGrupoHorario.horario_materia_id == horario_materia_id
    ).first()
    
    if not existente:
        db.add(AsignacionGrupoHorario(grupo_id=grupo_id, horario_materia_id=horario_materia_id))
        db.commit()
        
    return {"ok": True, "mensaje": "Horario asignado correctamente"}


@router.delete("/{grupo_id}/asignar-horario/{horario_materia_id}")
def quitar_horario_de_grupo(
    grupo_id: int,
    horario_materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verificar permiso
    h = db.query(HorarioMateria).join(Materia).filter(
        HorarioMateria.id == horario_materia_id,
        Materia.profesor_id == user.id
    ).first()
    
    if not h:
        raise HTTPException(403, "No autorizado")
        
    asignacion = db.query(AsignacionGrupoHorario).filter(
        AsignacionGrupoHorario.grupo_id == grupo_id,
        AsignacionGrupoHorario.horario_materia_id == horario_materia_id
    ).first()
    
    if asignacion:
        db.delete(asignacion)
        db.commit()
        
    return {"ok": True, "mensaje": "Horario desasignado correctamente"}