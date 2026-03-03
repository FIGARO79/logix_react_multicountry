#!/bin/bash

# ========================================================
# Script de Desarrollo Logix - Multicountry
# Inicia Backend (Granian) y Frontend (Vite)
# ========================================================

# Colores para la terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[INFO] Iniciando entorno de desarrollo multicountry...${NC}"

# Asegurarse de que estamos en la raíz del proyecto
cd "$(dirname "$0")"

# 1. Iniciar Backend en segundo plano
echo -e "${GREEN}[BACKEND] Levantando API con Granian en el puerto 8000...${NC}"
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv_linux" ]; then
    source .venv_linux/bin/activate
fi

export ENVIRONMENT=development
# Ejecutamos Granian directamente vía CLI
echo -e "${GREEN}[BACKEND] Iniciando API...${NC}"
granian --interface asgi --host 127.0.0.1 --port 8000 --reload main:app & 
BACKEND_PID=$!

# Esperar unos segundos para que el backend esté listo antes de iniciar el frontend
echo -e "${BLUE}[INFO] Esperando 3 segundos a que el backend cargue los CSV...${NC}"
sleep 3

# 2. Iniciar Frontend
echo -e "${GREEN}[FRONTEND] Levantando Vite dev server...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!

# Función para detener ambos procesos al cerrar el script (Ctrl+C)
trap "kill $BACKEND_PID $FRONTEND_PID; echo -e '
${BLUE}[INFO] Servidores detenidos.${NC}'; exit" INT TERM EXIT

# Mantener el script en ejecución para ver los logs
wait
