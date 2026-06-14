from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.materia import Materia
from app.models.grupo import Grupo
from app.schemas.grupo import GrupoCreate, GrupoOut, GrupoConAlumnos

router = APIRouter(prefix="/api/grupos", tags=["grupos"])


def _verificar_materia(db: Session, materia_id: int, user: User) -> Materia:
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m:
        raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id:
        raise HTTPException(403, "No autorizado")
    return m


@router.get("/materia/{materia_id}", response_model=list[GrupoOut])
def listar_grupos_materia(
    materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verificar_materia(db, materia_id, user)
    return (
        db.query(Grupo)
        .filter(Grupo.materia_id == materia_id)
        .order_by(Grupo.id)
        .all()
    )


@router.get("/{grupo_id}", response_model=GrupoConAlumnos)
def obtener_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = db.query(Grupo).filter(Grupo.id == grupo_id).first()
    if not g:
        raise HTTPException(404, "Grupo no encontrado")
    _verificar_materia(db, g.materia_id, user)
    return g


@router.post("", response_model=GrupoOut, status_code=201)
def crear_grupo(
    payload: GrupoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verificar_materia(db, payload.materia_id, user)
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
    _verificar_materia(db, g.materia_id, user)
    db.delete(g)
    db.commit()
    return {"ok": True}