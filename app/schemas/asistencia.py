from pydantic import BaseModel
from datetime import date, time
from typing import Optional


class RegistroQR(BaseModel):
    qr_token: str
    materia_id: int


class AsistenciaRespuesta(BaseModel):
    status: str  # REGISTRO_NUEVO | DUPLICADO | NO_ENCONTRADO
    alumno: Optional[str] = None
    materia: Optional[str] = None
    grupo: Optional[str] = None
    hora: Optional[str] = None


class AsistenciaRow(BaseModel):
    id: int
    alumno_nombre: str
    matricula: str
    grupo: str
    materia: str
    fecha: date
    hora_entrada: time
    estatus: str
    profesor: str

    class Config:
        from_attributes = True