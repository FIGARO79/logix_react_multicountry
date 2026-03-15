#!/bin/bash

# ========================================================
# Script de Reinicio y Mantenimiento Logix
# ========================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}[INFO] Iniciando reinicio de servicios...${NC}"

# 1. Reiniciar Nginx y MariaDB
echo -e "${GREEN}[INFO] Reiniciando Nginx y MariaDB...${NC}"
sudo systemctl restart nginx
sudo systemctl restart mariadb

# 2. Gestionar Backend (Granian)
echo -e "${GREEN}[INFO] Reiniciando Backend (Granian)...${NC}"

# Matar procesos existentes de granian
pkill -f granian 2>/dev/null
sleep 2

# Iniciar backend en segundo plano
cd /home/debian/logix_tenancy
export PYTHONPATH=$PYTHONPATH:.
export ENVIRONMENT=production

nohup ./venv/bin/python -m granian --interface asgi --workers 2 --host 0.0.0.0 --port 8000 main:app > backend.log 2>&1 &
BACKEND_PID=$!

echo -e "${GREEN}[INFO] Backend iniciado con PID: $BACKEND_PID. Logs en backend.log${NC}"

# 3. Eliminar Sesiones Fantasmas
echo -e "${YELLOW}[MANTENIMIENTO] Limpiando sesiones fantasmas (in_progress)...${NC}"

# Obtenemos credenciales del .env (asumiendo que están ahí)
DB_USER=$(grep DB_USER .env | cut -d '=' -f2)
DB_PASS=$(grep DB_PASSWORD .env | cut -d '=' -f2)
DB_NAME=$(grep DB_NAME .env | cut -d '=' -f2)

# Marcar sesiones en progreso como 'abandoned' si no han tenido actividad o simplemente cerrarlas todas para limpieza
mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "UPDATE count_sessions SET status = 'abandoned', end_time = NOW() WHERE status = 'in_progress';"

echo -e "${GREEN}[INFO] Limpieza de sesiones completada.${NC}"

echo -e "${BLUE}[SUCCESS] Todos los servicios han sido reiniciados y las sesiones limpiadas.${NC}"
