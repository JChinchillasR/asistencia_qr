from pydantic import BaseModel
from typing import Optional
from datetime import date, time

# ============ 1. Para el registro desde el escáner ============
class RegistroQR(BaseModel):
    qr_token: str
    materia_id: int
    horario_materia_id: Optional[int] = None  # 🎯 El campo que necesitábamos para el horario

# ============ 2. Para la respuesta del escáner al frontend ============
class AsistenciaRespuesta(BaseModel):
    status: str
    alumno: str
    materia: str
    grupo: Optional[str] = None
    hora: Optional[str] = None
    estatus: Optional[str] = None
    horario_descripcion: Optional[str] = None

    class Config:
        from_attributes = True

# ============ 3. Para los reportes (la que faltaba y causó el error) ============
class AsistenciaRow(BaseModel):
    id: int
    alumno_nombre: str
    matricula: str
    materia: str
    grupo: str
    hora_entrada: time
    estatus: str
    fecha: date

    class Config:
        from_attributes = True