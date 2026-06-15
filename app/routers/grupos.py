from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.grupo import Grupo
from app.models.grupo_materia import GrupoMateria
from app.models.materia import Materia
from app.models.alumno import Alumno
from app.schemas.grupo import (
    GrupoCreate, GrupoOut, GrupoConAlumnos, 
    GrupoConMaterias, AsignarMateriaRequest
)

router = APIRouter(prefix="/api/grupos", tags=["grupos"])


@router.get("", response_model=list[GrupoOut])
def listar_grupos(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista todos los grupos (independientes de materias)."""
    return db.query(Grupo).order_by(Grupo.nombre).all()


@router.get("/{grupo_id}", response_model=GrupoConAlumnos)
def obtener_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = db.query(Grupo).options(
        joinedload(Grupo.alumnos),
        joinedload(Grupo.materias)
    ).filter(Grupo.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    return g


@router.post("", response_model=GrupoOut, status_code=201)
def crear_grupo(
    payload: GrupoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Crea un grupo independiente (sin materia asociada)."""
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
        raise HTTPException(404, "No encontrado")
    db.delete(g)
    db.commit()
    return {"ok": True}


# ============ ASIGNACIÓN DE MATERIAS A GRUPOS ============

@router.get("/{grupo_id}/materias", response_model=list[GrupoConMaterias])
def listar_materias_de_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista todas las materias que toma un grupo."""
    g = db.query(Grupo).options(joinedload(Grupo.materias)).filter(Grupo.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    return [g]


@router.post("/{grupo_id}/materias", status_code=201)
def asignar_materia_a_grupo(
    grupo_id: int,
    payload: AsignarMateriaRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Asigna una materia a un grupo (relación N:M)."""
    g = db.query(Grupo).filter(Grupo.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    
    m = db.query(Materia).filter(Materia.id == payload.materia_id).first()
    if not m:
        raise HTTPException(404, "Materia no encontrada")
    
    # Verificar autorización (la materia debe ser del profesor o admin)
    if user.role != "admin" and m.profesor_id != user.id:
        raise HTTPException(403, "No autorizado para esta materia")
    
    # Verificar si ya está asignada
    existente = db.query(GrupoMateria).filter(
        GrupoMateria.grupo_id == grupo_id,
        GrupoMateria.materia_id == payload.materia_id
    ).first()
    if existente:
        raise HTTPException(400, "El grupo ya tiene asignada esta materia")
    
    relacion = GrupoMateria(grupo_id=grupo_id, materia_id=payload.materia_id)
    db.add(relacion)
    db.commit()
    return {"ok": True, "mensaje": f"Materia '{m.nombre}' asignada al grupo '{g.nombre}'"}


@router.delete("/{grupo_id}/materias/{materia_id}")
def quitar_materia_de_grupo(
    grupo_id: int,
    materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Quita una materia de un grupo."""
    relacion = db.query(GrupoMateria).filter(
        GrupoMateria.grupo_id == grupo_id,
        GrupoMateria.materia_id == materia_id
    ).first()
    if not relacion:
        raise HTTPException(404, "Relación no encontrada")
    db.delete(relacion)
    db.commit()
    return {"ok": True}


# ============ GRUPOS POR MATERIA (para el escáner y reportes) ============

@router.get("/materia/{materia_id}", response_model=list[GrupoOut])
def listar_grupos_de_materia(
    materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista todos los grupos que toman una materia específica."""
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m:
        raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id:
        raise HTTPException(403, "No autorizado")
    
    # Buscar grupos a través de la relación N:M
    grupos = (
        db.query(Grupo)
        .join(GrupoMateria, GrupoMateria.grupo_id == Grupo.id)
        .filter(GrupoMateria.materia_id == materia_id)
        .order_by(Grupo.nombre)
        .all()
    )
    return grupos