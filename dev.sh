#!/bin/bash

# ========================================================
# Script de Desarrollo Logix - Multicountry (Granian)
# ========================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}[INFO] Iniciando entorno de desarrollo multicountry con Granian...${NC}"

# 1. Configuración de Rutas y Entorno
cd "$(dirname "$0")"
export PYTHONPATH=$PYTHONPATH:.
export ENVIRONMENT=development

# Determinar el entorno virtual
if [ -d "venv" ]; then
    VENV_PATH="venv"
elif [ -d ".venv_linux" ]; then
    VENV_PATH=".venv_linux"
else
    echo -e "${YELLOW}[WARN] No se encontró carpeta venv.${NC}"
    exit 1
fi

# 2. Iniciar Backend (Granian)
echo -e "${GREEN}[BACKEND] Iniciando API con Granian en http://127.0.0.1:8000 ...${NC}"
# --reload permite autorrecarga al modificar código
$VENV_PATH/bin/python -m granian --interface asgi --host 127.0.0.1 --port 8000 --reload main:app &
BACKEND_PID=$!

# 3. Iniciar Frontend
echo -e "${GREEN}[FRONTEND] Iniciando Vite dev server...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!

# Función para limpieza al salir
cleanup() {
    echo -e "\n${BLUE}[INFO] Deteniendo servidores...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup INT TERM EXIT

# Mantener vivo el script para ver logs
wait
