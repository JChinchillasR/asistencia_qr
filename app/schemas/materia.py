from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class HorarioMateriaOut(BaseModel):
    id: int
    descripcion: str

    class Config:
        from_attributes = True

class MateriaCreate(BaseModel):
    nombre: str
    clave: str
    semestre: str
    horarios: List[str] = [] # Lista de strings, ej: ["Lun 10:00", "Mie 10:00"]

class MateriaOut(BaseModel):
    id: int
    nombre: str
    clave: str
    semestre: str
    profesor_id: int
    activa: bool
    created_at: datetime
    horarios: List[HorarioMateriaOut] = []

    class Config:
        from_attributes = True