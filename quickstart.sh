#!/bin/sh

echo "Esperando a que la base de datos esté lista..."
# Reemplaza 'db' y '5432' con tus variables si es necesario
while ! nc -z db 5432; do
  sleep 0.5
done
echo "¡Base de datos detectada!"

echo "Ejecutando migraciones de Alembic..."
alembic upgrade head

echo "Iniciando servidor FastAPI con Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload