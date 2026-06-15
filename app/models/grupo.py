from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.core.database import Base


class Grupo(Base):
    __tablename__ = "grupos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False, unique=True)  # Único para evitar duplicados
    horario = Column(String, default="")
    generacion = Column(String, default="")  # Ej: "2024-2027" (opcional)

    # Relación con alumnos (un grupo tiene muchos alumnos)
    alumnos = relationship("Alumno", back_populates="grupo", cascade="all, delete-orphan")
    
    # Relación N:M con materias
    materias = relationship(
        "Materia",
        secondary="grupos_materias",
        back_populates="grupos"
    )