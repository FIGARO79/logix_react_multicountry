#!/bin/bash

# ========================================================
# Logix Redeploy & Maintenance Script
# Automates frontend build and backend restart
# ========================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Logix Redeploy & Maintenance ===${NC}"

# 1. Update Frontend
echo -e "\n${GREEN}[1/4] Compiling Frontend...${NC}"
cd /home/debian/logix_tenancy/frontend
if [ -d "node_modules" ]; then
    echo -e "${BLUE}Running build...${NC}"
    npm run build
else
    echo -e "${YELLOW}node_modules not found. Installing and building...${NC}"
    npm install && npm run build
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Frontend build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Frontend compiled successfully.${NC}"

# 2. Restart System Services
echo -e "\n${GREEN}[2/4] Restarting Nginx and MariaDB...${NC}"
sudo systemctl restart nginx
sudo systemctl restart mariadb
echo -e "${GREEN}System services restarted.${NC}"

# 3. Restart Backend (Granian via systemd)
echo -e "\n${GREEN}[3/4] Reiniciando Backend (Granian)...${NC}"
sudo systemctl restart logix
sleep 2
if sudo systemctl is-active --quiet logix; then
    echo -e "${GREEN}Backend corriendo correctamente. Logs en backend.log${NC}"
else
    echo -e "${RED}Error: el backend no pudo iniciarse. Revisa: sudo systemctl status logix${NC}"
    exit 1
fi

# 4. Cleanup Database Sessions
echo -e "\n${GREEN}[4/4] Limpiando sesiones fantasmas...${NC}"

# Extraer credenciales del .env
ENV_FILE="/home/debian/logix_tenancy/.env"
DB_USER=$(grep '^DB_USER' "$ENV_FILE" | cut -d '=' -f2)
DB_PASS=$(grep '^DB_PASSWORD' "$ENV_FILE" | cut -d '=' -f2)
DB_NAME=$(grep '^DB_NAME' "$ENV_FILE" | cut -d '=' -f2)

mariadb -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "UPDATE count_sessions SET status = 'abandoned', end_time = NOW() WHERE status = 'in_progress';" 2>/dev/null || true


echo -e "${GREEN}Maintenance completed successfully!${NC}"
echo -e "${BLUE}=====================================${NC}"
