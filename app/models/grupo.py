from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base

class Grupo(Base):
    __tablename__ = "grupos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False, unique=True)
    horario = Column(String, default="")
    generacion = Column(String, default="")

    alumnos = relationship("Alumno", back_populates="grupo", cascade="all, delete-orphan")
    
    materias_asignadas = relationship(
        "HorarioMateria",
        secondary="asignaciones_grupo_horario",
        back_populates="grupos"
    )