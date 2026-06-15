from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from app.core.database import Base


class GrupoMateria(Base):
    """Tabla intermedia para la relación N:M entre grupos y materias."""
    __tablename__ = "grupos_materias"
    __table_args__ = (
        UniqueConstraint('grupo_id', 'materia_id', name='uq_grupo_materia'),
    )

    id = Column(Integer, primary_key=True, index=True)
    grupo_id = Column(Integer, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False)
    materia_id = Column(Integer, ForeignKey("materias.id", ondelete="CASCADE"), nullable=False)