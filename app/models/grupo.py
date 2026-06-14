from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Grupo(Base):
    __tablename__ = "grupos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)  # "Grupo 01"
    materia_id = Column(Integer, ForeignKey("materias.id"), nullable=False)
    horario = Column(String, default="")

    materia = relationship("Materia", back_populates="grupos")
    alumnos = relationship("Alumno", back_populates="grupo", cascade="all, delete-orphan")