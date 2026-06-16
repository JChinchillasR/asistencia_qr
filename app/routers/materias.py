from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import re
from datetime import time
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.materia import Materia, HorarioMateria
from app.models.asignacion_grupo_horario import AsignacionGrupoHorario
from app.models.grupo import Grupo
from app.schemas.materia import MateriaCreate, MateriaUpdate, MateriaOut
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/materias", tags=["materias"])

class AsignacionRequest(BaseModel):
    asignaciones: List[dict]

@router.get("", response_model=list[MateriaOut])
def listar_materias(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "admin":
        return db.query(Materia).order_by(Materia.nombre).all()
    return db.query(Materia).filter(Materia.profesor_id == user.id).order_by(Materia.nombre).all()

@router.post("", response_model=MateriaOut, status_code=201)
def crear_materia(payload: MateriaCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        materia = Materia(nombre=payload.nombre, clave=payload.clave, semestre=payload.semestre, profesor_id=user.id)
        db.add(materia)
        db.flush()
        
        # 🛡️ BLINDAJE: Asegurar que horarios sea una lista válida
        lista_horarios = payload.horarios if isinstance(payload.horarios, list) else []
        
        for h_desc in lista_horarios:
            if h_desc and str(h_desc).strip():
                h_desc = str(h_desc).strip()
                hora_inicio = None
                hora_fin = None
                
                # Regex flexible: busca "00:00" seguido de "a", "-" o "al" y otro "00:00"
                match = re.search(r"(\d{1,2}:\d{2})\s*(?:a|-|al)\s*(\d{1,2}:\d{2})", h_desc, re.IGNORECASE)
                if match:
                    try:
                        hora_inicio = time.fromisoformat(match.group(1).zfill(5))
                        hora_fin = time.fromisoformat(match.group(2).zfill(5))
                    except ValueError:
                        pass # Si la hora es inválida, se guarda solo la descripción
                
                db.add(HorarioMateria(
                    materia_id=materia.id, 
                    descripcion=h_desc,
                    hora_inicio=hora_inicio,
                    hora_fin=hora_fin
                ))
        db.commit()
        db.refresh(materia)
        return materia
    except Exception as e:
        db.rollback()
        import traceback
        print(f"\n{'='*60}")
        print(f"❌ ERROR AL CREAR MATERIA:")
        traceback.print_exc()
        print(f"{'='*60}\n")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@router.put("/{materia_id}", response_model=MateriaOut)
def editar_materia(materia_id: int, payload: MateriaUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id: raise HTTPException(403, "No autorizado")
    
    if payload.nombre is not None: m.nombre = payload.nombre
    if payload.clave is not None: m.clave = payload.clave
    if payload.semestre is not None: m.semestre = payload.semestre
    
    if payload.horarios is not None:
        db.query(HorarioMateria).filter(HorarioMateria.materia_id == materia_id).delete()
        lista_horarios = payload.horarios if isinstance(payload.horarios, list) else []
        for h_desc in lista_horarios:
            if h_desc and str(h_desc).strip():
                h_desc = str(h_desc).strip()
                hora_inicio = None
                hora_fin = None
                match = re.search(r"(\d{1,2}:\d{2})\s*(?:a|-|al)\s*(\d{1,2}:\d{2})", h_desc, re.IGNORECASE)
                if match:
                    try:
                        hora_inicio = time.fromisoformat(match.group(1).zfill(5))
                        hora_fin = time.fromisoformat(match.group(2).zfill(5))
                    except ValueError:
                        pass
                
                db.add(HorarioMateria(materia_id=m.id, descripcion=h_desc, hora_inicio=hora_inicio, hora_fin=hora_fin))
            
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

@router.get("/{materia_id}/asignaciones")
def obtener_asignaciones_materia(materia_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: raise HTTPException(404, "Materia no encontrada")
    asignaciones = db.query(AsignacionGrupoHorario, Grupo.nombre, HorarioMateria.descripcion, HorarioMateria.id)\
        .join(Grupo, Grupo.id == AsignacionGrupoHorario.grupo_id)\
        .join(HorarioMateria, HorarioMateria.id == AsignacionGrupoHorario.horario_materia_id)\
        .filter(HorarioMateria.materia_id == materia_id).all()
    return [{"grupo_id": a[0].grupo_id, "grupo_nombre": a[1], "horario_materia_id": a[3], "horario_desc": a[2]} for a in asignaciones]

@router.post("/{materia_id}/asignaciones")
def guardar_asignaciones_materia(materia_id: int, payload: AsignacionRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.query(Materia).filter(Materia.id == materia_id).first()
    if not m: raise HTTPException(404, "Materia no encontrada")
    if user.role != "admin" and m.profesor_id != user.id: raise HTTPException(403, "No autorizado")
    horarios_validos = {h.id for h in m.horarios}
    horarios_materia_ids = [h.id for h in m.horarios]
    if horarios_materia_ids:
        db.query(AsignacionGrupoHorario).filter(AsignacionGrupoHorario.horario_materia_id.in_(horarios_materia_ids)).delete()
    for item in payload.asignaciones:
        if item['horario_materia_id'] in horarios_validos:
            db.add(AsignacionGrupoHorario(grupo_id=item['grupo_id'], horario_materia_id=item['horario_materia_id']))
    db.commit()
    return {"ok": True, "mensaje": "Asignaciones guardadas correctamente"}