from app.models.user import User
from app.models.materia import Materia, HorarioMateria
from app.models.grupo import Grupo
from app.models.asignacion_grupo_horario import AsignacionGrupoHorario
from app.models.alumno import Alumno
from app.models.asistencia import Asistencia

__all__ = [
    "User", 
    "Materia", 
    "HorarioMateria", 
    "Grupo", 
    "AsignacionGrupoHorario", 
    "Alumno", 
    "Asistencia"
]