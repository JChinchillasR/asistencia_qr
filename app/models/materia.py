from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Time  # 🎯 Se agregó 'Time' aquí
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class HorarioMateria(Base):
    __tablename__ = "horarios_materia"
    
    id = Column(Integer, primary_key=True, index=True)
    materia_id = Column(Integer, ForeignKey("materias.id", ondelete="CASCADE"), nullable=False)
    descripcion = Column(String, nullable=False) # Ej: "Lunes y Miércoles"
    hora_inicio = Column(Time, nullable=True)    # 🆕 NUEVO: Para calcular retardos
    hora_fin = Column(Time, nullable=True)       # 🆕 NUEVO: Para calcular ausentes
    
    materia = relationship("Materia", back_populates="horarios")
    grupos = relationship("Grupo", secondary="asignaciones_grupo_horario", back_populates="materias_asignadas")


class Materia(Base):
    __tablename__ = "materias"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    clave = Column(String, unique=True, nullable=False)
    semestre = Column(String, nullable=False)
    profesor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    profesor = relationship("User", backref="materias")
    horarios = relationship("HorarioMateria", back_populates="materia", cascade="all, delete-orphan")