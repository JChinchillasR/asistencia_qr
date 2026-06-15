from pydantic import BaseModel
from typing import List, Optional


class GrupoBase(BaseModel):
    nombre: str
    horario: str = ""
    generacion: str = ""


class GrupoCreate(GrupoBase):
    pass


class GrupoOut(GrupoBase):
    id: int

    class Config:
        from_attributes = True


class GrupoConMaterias(GrupoOut):
    materias: List["MateriaSimple"] = []


class GrupoConAlumnos(GrupoOut):
    alumnos: List["AlumnoOut"] = []
    materias: List["MateriaSimple"] = []


class MateriaSimple(BaseModel):
    id: int
    nombre: str
    clave: str

    class Config:
        from_attributes = True


class AsignarMateriaRequest(BaseModel):
    materia_id: int


# Reconstruir referencias circulares
from app.schemas.alumno import AlumnoOut
GrupoConAlumnos.model_rebuild()
GrupoConMaterias.model_rebuild()