from pydantic import BaseModel
from typing import Optional


class AlumnoBase(BaseModel):
    matricula: str
    nombre_completo: str
    email: str = ""


class AlumnoCreate(AlumnoBase):
    grupo_id: int


class AlumnoOut(AlumnoBase):
    id: int
    grupo_id: int
    qr_token: str

    class Config:
        from_attributes = True