from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from app.core.database import Base

class AsignacionGrupoHorario(Base):
    __tablename__ = "asignaciones_grupo_horario"
    __table_args__ = (
        UniqueConstraint('grupo_id', 'horario_materia_id', name='uq_grupo_horario'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    grupo_id = Column(Integer, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False)
    horario_materia_id = Column(Integer, ForeignKey("horarios_materia.id", ondelete="CASCADE"), nullable=False)