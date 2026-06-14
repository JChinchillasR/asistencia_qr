"""Seed de usuarios iniciales (se ejecuta al arrancar la app)."""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User


def seed_initial_users():
    db: Session = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                email="admin@demo.com",
                full_name="Administrador",
                role="admin",
                hashed_password=hash_password("admin123"),
            )
            profesor = User(
                email="profesor@demo.com",
                full_name="Profesor Demo",
                role="profesor",
                hashed_password=hash_password("profesor123"),
            )
            db.add_all([admin, profesor])
            db.commit()
            print("✅ Usuarios iniciales creados (admin@demo.com / profesor@demo.com)")
    finally:
        db.close()