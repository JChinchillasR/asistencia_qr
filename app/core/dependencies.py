from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    # 🕵️ DEBUG: Ver qué recibe el backend
    if token:
        print(f"🔍 DEBUG BACKEND: Token recibido correctamente. Inicio: {token[:20]}...")
    else:
        print("⚠️ DEBUG BACKEND: ¡NO se recibió ningún token en los headers!")

    if not token:
        raise HTTPException(status_code=401, detail="No autenticado (Token faltante)")
    
    payload = decode_token(token)
    if payload is None:
        print("❌ DEBUG BACKEND: decode_token devolvió None. (Causa probable: SECRET_KEY en .env no coincide o está mal formateada)")
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
        
    user_id: int = int(payload.get("sub"))
    if user_id is None:
        raise HTTPException(status_code=401, detail="Token inválido (sin 'sub')")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
        
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador")
    return user