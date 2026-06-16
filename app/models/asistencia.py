from sqlalchemy import Column, Integer, String, Date, Time, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Asistencia(Base):
    __tablename__ = "asistencias"

    id = Column(Integer, primary_key=True, index=True)
    alumno_id = Column(Integer, ForeignKey("alumnos.id"), nullable=False)
    materia_id = Column(Integer, ForeignKey("materias.id"), nullable=False)
    grupo_id = Column(Integer, ForeignKey("grupos.id"), nullable=False)
    profesor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 🆕 NUEVO: Campo para guardar el horario específico
    horario_materia_id = Column(Integer, ForeignKey("horarios_materia.id"), nullable=True)
    
    fecha = Column(Date, nullable=False)
    hora_entrada = Column(Time, nullable=False)
    estatus = Column(String, default="Presente")

    # 🎯 CORRECCIÓN: 
    # Usamos back_populates para alumno (porque Alumno ya tiene 'asistencias' definido).
    # Usamos backref con nombres únicos para los demás para evitar CUALQUIER otro conflicto.
    alumno = relationship("Alumno", back_populates="asistencias")
    materia = relationship("Materia", backref="asistencias_materia")
    grupo = relationship("Grupo", backref="asistencias_grupo")
    profesor = relationship("User", backref="asistencias_profesor")
    horario_materia = relationship("HorarioMateria", backref="asistencias_horario")