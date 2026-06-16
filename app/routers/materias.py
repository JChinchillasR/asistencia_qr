from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.materia import Materia, HorarioMateria
from app.models.asignacion_grupo_horario import AsignacionGrupoHorario
from app.models.grupo import Grupo
from app.schemas.materia import MateriaCreate, MateriaOut
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/api/materias", tags=["materias"])

class MateriaUpdate(BaseModel):
    nombre: str | None = None
    clave: str | None = None
    semestre: str | None = None
    horarios: List[str] = []

class AsignacionRequest(BaseModel):
    asignaciones: List[dict] # [{grupo_id: 1, horario_materia_id: 5}, ...]

@router.get("", response_model=list[MateriaOut])
def listar_materias(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "admin":
        return db.query(Materia).order_by(Materia.nombre).all()
    return db.query(Materia).filter(Materia.profesor_id == user.id).order_by(Materia.nombre).all()

@router.post("", response_model=MateriaOut, status_code=201)
def crear_materia(payload: MateriaCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    materia = Materia(nombre=payload.nombre, clave=payload.clave, semestre=payload.semestre, profesor_id=user.id)
    db.add(materia)
    db.flush()
    for h_desc in payload.horarios:
        if h_desc.strip():
            db.add(HorarioMateria(materia_id=materia.id, descripcion=h_desc.strip()))
    db.commit()
    db.refresh(materia)
    return materia

@router.put("/{materia_id}", response_model=MateriaOut)
def editar_materia(
    materia_id: int, 
    payload: MateriaUpdate, 
    db: Session = Depends(get_db), 
    user: User = Depends(get_current_user)
):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: 
        raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id: 
        raise HTTPException(403, "No autorizado")
    
    # Actualizar campos básicos solo si se proporcionaron
    if payload.nombre is not None: m.nombre = payload.nombre
    if payload.clave is not None: m.clave = payload.clave
    if payload.semestre is not None: m.semestre = payload.semestre
    
    # 🎯 CORRECCIÓN: Actualizar horarios solo si el campo fue enviado explícitamente
    if payload.horarios is not None:
        # Borrar horarios antiguos
        db.query(HorarioMateria).filter(HorarioMateria.materia_id == materia_id).delete()
        # Crear los nuevos
        for h_desc in payload.horarios:
            if h_desc and h_desc.strip():
                db.add(HorarioMateria(materia_id=materia.id, descripcion=h_desc.strip()))
            
    db.commit()
    db.refresh(m)
    return m

@router.delete("/{materia_id}")
def eliminar_materia(materia_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.asistencia import Asistencia
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id: raise HTTPException(403, "No autorizado")
    
    db.query(Asistencia).filter(Asistencia.materia_id == materia_id).delete()
    db.delete(m)
    db.commit()
    return {"ok": True}

# ============ ASIGNACIÓN POR HORARIO ============

@router.get("/{materia_id}/asignaciones")
def obtener_asignaciones_materia(materia_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: raise HTTPException(404, "Materia no encontrada")
    
    # Obtener todas las asignaciones de los horarios de esta materia
    asignaciones = db.query(AsignacionGrupoHorario, Grupo.nombre, HorarioMateria.descripcion, HorarioMateria.id)\
        .join(Grupo, Grupo.id == AsignacionGrupoHorario.grupo_id)\
        .join(HorarioMateria, HorarioMateria.id == AsignacionGrupoHorario.horario_materia_id)\
        .filter(HorarioMateria.materia_id == materia_id)\
        .all()
    
    return [{"grupo_id": a[0].grupo_id, "grupo_nombre": a[1], "horario_materia_id": a[3], "horario_desc": a[2]} for a in asignaciones]

@router.post("/{materia_id}/asignaciones")
def guardar_asignaciones_materia(materia_id: int, payload: AsignacionRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id: raise HTTPException(403, "No autorizado")
    
    # 1. Obtener los IDs de los horarios de esta materia para validar
    horarios_validos = {h.id for h in m.horarios}
    
    # 2. Borrar asignaciones antiguas de esta materia
    horarios_materia_ids = [h.id for h in m.horarios]
    if horarios_materia_ids:
        db.query(AsignacionGrupoHorario).filter(AsignacionGrupoHorario.horario_materia_id.in_(horarios_materia_ids)).delete()
    
    # 3. Insertar las nuevas asignaciones
    for item in payload.asignaciones:
        if item['horario_materia_id'] in horarios_validos:
            db.add(AsignacionGrupoHorario(grupo_id=item['grupo_id'], horario_materia_id=item['horario_materia_id']))
            
    db.commit()
    return {"ok": True, "mensaje": "Asignaciones guardadas correctamente"}