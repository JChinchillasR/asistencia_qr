from pydantic import BaseModel
from typing import Optional, List


class MateriaBase(BaseModel):
    nombre: str
    clave: str
    semestre: str


class MateriaCreate(MateriaBase):
    pass


class MateriaOut(MateriaBase):
    id: int
    profesor_id: int
    activa: bool

    class Config:
        from_attributes = True


class MateriaConGrupos(MateriaOut):
    grupos: List["GrupoOut"] = []


from app.schemas.grupo import GrupoOut
MateriaConGrupos.model_rebuild()