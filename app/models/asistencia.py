from sqlalchemy import (
    Column, Integer, String, Date, Time, ForeignKey,
    DateTime, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Asistencia(Base):
    __tablename__ = "asistencias"
    __table_args__ = (
        UniqueConstraint(
            "alumno_id", "materia_id", "fecha",
            name="uq_asistencia_alumno_materia_fecha",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    alumno_id = Column(Integer, ForeignKey("alumnos.id"), nullable=False)
    materia_id = Column(Integer, ForeignKey("materias.id"), nullable=False)
    grupo_id = Column(Integer, ForeignKey("grupos.id"), nullable=False)
    profesor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    fecha = Column(Date, nullable=False, index=True)
    hora_entrada = Column(Time, nullable=False)
    estatus = Column(String, nullable=False, default="Presente")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    alumno = relationship("Alumno", back_populates="asistencias")
    materia = relationship("Materia")
    grupo = relationship("Grupo")
    profesor = relationship("User")