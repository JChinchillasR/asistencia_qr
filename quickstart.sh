
### `quickstart.sh`
```bash
#!/bin/bash
set -e

echo "🚀 Iniciando Sistema de Asistencia QR..."

# Crear estructura de carpetas
mkdir -p app/{core,models,schemas,routers,services,static/{css,js}}
mkdir -p alembic/versions

# Verificar .env
if [ ! -f .env ]; then
    echo "⚠️  Copiando .env.example a .env"
    cp .env.example .env
    echo "⚠️  ⚠️  EDITA .env Y CAMBIA EL SECRET_KEY antes de continuar"
fi

# Crear red docker si no existe
docker network create asistencia-net 2>/dev/null || true

# Levantar servicios
docker compose down 2>/dev/null || true
docker compose up --build -d

echo ""
echo "✅ Sistema listo en http://localhost"
echo "📋 Ver logs: docker compose logs -f api"
echo "🛑 Detener: docker compose down"