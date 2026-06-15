from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, create_access_token,
)
from app.core.dependencies import get_current_user, require_admin
from app.models.user import User
from app.schemas.user import (
    UserCreate, UserEdit, UserOut, Token, LoginRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario inactivo")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return Token(
        access_token=token,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/edit", response_model=UserOut)
def edit_user(payload: UserEdit, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == payload.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    duplicate = (
        db.query(User)
        .filter(User.email == payload.email, User.id != payload.id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    user.email = payload.email
    user.full_name = payload.full_name
    user.role = payload.role
    user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=list[UserOut])
def listar_usuarios(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(User).order_by(User.id).all()