import uuid
from sqlalchemy import Column, Integer, String, ForeignKey, event
from sqlalchemy.orm import relationship
from app.core.database import Base


class Alumno(Base):
    __tablename__ = "alumnos"

    id = Column(Integer, primary_key=True, index=True)
    matricula = Column(String, unique=True, index=True, nullable=False)
    nombre_completo = Column(String, nullable=False)
    email = Column(String, default="")
    grupo_id = Column(Integer, ForeignKey("grupos.id"), nullable=False)
    qr_token = Column(String, unique=True, nullable=False, index=True)

    grupo = relationship("Grupo", back_populates="alumnos")
    asistencias = relationship("Asistencia", back_populates="alumno", cascade="all, delete-orphan")


@event.listens_for(Alumno, "init")
def _set_qr_token(target, args, kwargs):
    if not target.qr_token:
        target.qr_token = uuid.uuid4().hex