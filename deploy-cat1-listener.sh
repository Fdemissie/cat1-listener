#!/bin/bash

# -----------------------------------
# CAT1 Meter Listener Deployment Script (Ubuntu 22.04 LTS)
# -----------------------------------

set -euo pipefail

# Configuration
APP_NAME="cat1-listener"
APP_DIR="/opt/$APP_NAME"
REPO_URL="https://github.com/fdemissie/cat1-listener.git"
BRANCH="main"
LISTEN_PORT=5684
DB_USER="cat1_listener"
DB_PASSWORD=$(openssl rand -hex 16)
ENV_FILE="$APP_DIR/.env"
LOG_DIR="/var/log/$APP_NAME"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

trap 'echo -e "${RED}Error at line $LINENO${NC}"; exit 1' ERR

echo -e "${GREEN}\nCAT1 Listener Deployment Script${NC}"
echo -e "----------------------------------\n"

# Must be root
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

RUN_USER=${SUDO_USER:-root}

# 1. System updates
echo -e "${YELLOW}[1/10] Updating system packages...${NC}"
apt-get update && apt-get upgrade -y

# 2. Install dependencies
echo -e "${YELLOW}[2/10] Installing dependencies...${NC}"
apt-get install -y \
  curl git ufw net-tools \
  mysql-server mysql-client \
  build-essential python3-minimal \
  libssl-dev ca-certificates

# 3. Install Node.js
if ! command -v node >/dev/null; then
  echo -e "${YELLOW}[3/10] Installing Node.js 18.x...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

# 4. Setup app directory
echo -e "${YELLOW}[4/10] Setting up application directory...${NC}"
mkdir -p "$APP_DIR" "$LOG_DIR"
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR" "$LOG_DIR"

# 5. Clone or update repo
if [ -d "$APP_DIR/.git" ]; then
  echo -e "${YELLOW}Updating existing repository...${NC}"
  cd "$APP_DIR"
  sudo -u "$RUN_USER" git pull origin "$BRANCH"
else
  echo -e "${YELLOW}Cloning repository...${NC}"
  sudo -u "$RUN_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# 6. Install dependencies
echo -e "${YELLOW}[5/10] Installing app dependencies...${NC}"
cd "$APP_DIR"
sudo -u "$RUN_USER" npm install --production

# 7. Environment config
echo -e "${YELLOW}[6/10] Configuring environment...${NC}"
if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF > "$ENV_FILE"
LISTEN_PORT=$LISTEN_PORT
NODE_ENV=production

DB_HOST=localhost
DB_PORT=3306
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=cat1_meters

JWT_SECRET=$(openssl rand -hex 32)
DOWNLINK_SECRET=$(openssl rand -hex 32)

LOG_LEVEL=info
LOG_DIR=$LOG_DIR
LOG_RETENTION_DAYS=7
EOF
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}Created new .env file${NC}"
else
  echo -e "${YELLOW}Using existing .env file${NC}"
fi

# 8. Database setup
echo -e "${YELLOW}[7/10] Configuring database...${NC}"
mysql -u root <<MYSQL_SCRIPT
CREATE DATABASE IF NOT EXISTS cat1_meters;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON cat1_meters.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
MYSQL_SCRIPT

# 9. Firewall
echo -e "${YELLOW}[8/10] Configuring firewall...${NC}"
ufw allow ssh
ufw allow "$LISTEN_PORT/tcp"
ufw --force enable

# --- Port check ---
echo -e "${YELLOW}Checking if port $LISTEN_PORT is free...${NC}"
if netstat -tuln | grep -q ":$LISTEN_PORT "; then
  echo -e "${RED}❌ Port $LISTEN_PORT is already in use. Please stop the other process first.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Port $LISTEN_PORT is available${NC}"

# --- Auto-detect entry point ---
echo -e "${YELLOW}Detecting Node.js entry point...${NC}"
ENTRY_FILE=""

if [ -f "$APP_DIR/server.js" ]; then
  ENTRY_FILE="server.js"
elif [ -f "$APP_DIR/app.js" ]; then
  ENTRY_FILE="app.js"
elif [ -f "$APP_DIR/index.js" ]; then
  ENTRY_FILE="index.js"
else
  ENTRY_FILE=$(node -p "require('./package.json').main" 2>/dev/null || echo "")
  [ -z "$ENTRY_FILE" ] && { echo -e "${RED}❌ Could not detect entry file${NC}"; exit 1; }
fi

echo -e "${GREEN}Using entry file: $ENTRY_FILE${NC}"

# 10. Systemd service
echo -e "${YELLOW}[9/10] Creating systemd service...${NC}"

SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=CAT1 Listener Service
After=network.target mysql.service

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/$ENTRY_FILE
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$ENV_FILE
StandardOutput=append:$LOG_DIR/$APP_NAME.out.log
StandardError=append:$LOG_DIR/$APP_NAME.err.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"

# Log rotation
cat <<EOF > /etc/logrotate.d/$APP_NAME
$LOG_DIR/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 $RUN_USER $RUN_USER
    sharedscripts
}
EOF

# Health check
sleep 5
if systemctl is-active --quiet "$APP_NAME"; then
  echo -e "\n${GREEN}✅ Deployment successful!${NC}"
  echo -e "Application is running on port ${YELLOW}$LISTEN_PORT${NC}"
  echo -e "Logs: ${YELLOW}$LOG_DIR${NC}"
  echo -e "Status: ${YELLOW}systemctl status $APP_NAME${NC}"
  echo -e "Follow logs: ${YELLOW}journalctl -u $APP_NAME -f${NC}"
else
  echo -e "\n${RED}⚠️ Deployment completed but service failed to start${NC}"
  echo -e "Check logs with: ${YELLOW}journalctl -u $APP_NAME -xe${NC}"
  exit 1
fi
