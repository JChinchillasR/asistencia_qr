from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime, time

class HorarioMateriaOut(BaseModel):
    id: int
    descripcion: str
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None

    # 🎯 TRADUCTOR: Convierte objetos 'time' de la base de datos a texto "HH:MM"
    @field_validator('hora_inicio', 'hora_fin', mode='before')
    @classmethod
    def format_time(cls, v):
        if isinstance(v, time):
            return v.strftime("%H:%M")
        return str(v) if v else None

    model_config = {"from_attributes": True}


class MateriaCreate(BaseModel):
    nombre: str
    clave: str
    semestre: str
    horarios: List[str] = []


class MateriaUpdate(BaseModel):
    nombre: Optional[str] = None
    clave: Optional[str] = None
    semestre: Optional[str] = None
    horarios: Optional[List[str]] = None


class MateriaOut(BaseModel):
    id: int
    nombre: str
    clave: str
    semestre: str
    profesor_id: int
    activa: bool
    created_at: datetime
    horarios: List[HorarioMateriaOut] = []

    model_config = {"from_attributes": True}