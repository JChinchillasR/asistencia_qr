from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.materia import Materia
from app.models.grupo import Grupo
from app.schemas.materia import MateriaCreate, MateriaOut, MateriaConGrupos

router = APIRouter(prefix="/api/materias", tags=["materias"])


@router.get("/", response_model=list[MateriaOut])
def listar_materias(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Materia)
    if user.role != "admin":
        q = q.filter(Materia.profesor_id == user.id)
    return q.order_by(Materia.id.desc()).all()


@router.get("/{materia_id}", response_model=MateriaConGrupos)
def obtener_materia(
    materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m:
        raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id:
        raise HTTPException(403, "No autorizado")
    return m


@router.post("/", response_model=MateriaOut, status_code=201)
def crear_materia(
    payload: MateriaCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if db.query(Materia).filter(Materia.clave == payload.clave).first():
        raise HTTPException(400, "La clave ya existe")
    profesor_id = user.id if user.role == "profesor" else user.id
    m = Materia(**payload.model_dump(), profesor_id=profesor_id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{materia_id}")
def eliminar_materia(
    materia_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m:
        raise HTTPException(404, "No encontrada")
    if user.role != "admin" and m.profesor_id != user.id:
        raise HTTPException(403, "No autorizado")
    db.delete(m)
    db.commit()
    return {"ok": True}