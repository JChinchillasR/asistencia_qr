from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


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
    
    # Relación N:M con grupos (a través de grupos_materias)
    grupos = relationship(
        "Grupo",
        secondary="grupos_materias",
        back_populates="materias"
    )