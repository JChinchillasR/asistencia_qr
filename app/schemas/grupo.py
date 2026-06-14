from pydantic import BaseModel
from typing import List, Optional


class GrupoBase(BaseModel):
    nombre: str
    horario: str = ""


class GrupoCreate(GrupoBase):
    materia_id: int


class GrupoOut(GrupoBase):
    id: int
    materia_id: int

    class Config:
        from_attributes = True


class GrupoConAlumnos(GrupoOut):
    alumnos: List["AlumnoOut"] = []


from app.schemas.alumno import AlumnoOut
GrupoConAlumnos.model_rebuild()