#!/bin/bash

# -----------------------------------
# Enhanced CAT1 Meter Listener Deployment Script (Ubuntu 22.04 LTS)
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

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Error handling
trap 'echo -e "${RED}Error at line $LINENO${NC}"; exit 1' ERR

# Header
echo -e "${GREEN}\nCAT1 Listener Deployment Script${NC}"
echo -e "----------------------------------\n"

# Check for root
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

# Detect user (fallback to root if no sudo)
RUN_USER=${SUDO_USER:-root}

# Check if port is already in use
echo -e "${YELLOW}[0/11] Checking if port $LISTEN_PORT is available...${NC}"
if lsof -i :$LISTEN_PORT >/dev/null 2>&1; then
    echo -e "${RED}Port $LISTEN_PORT is already in use by:${NC}"
    lsof -i :$LISTEN_PORT
    echo -e "${YELLOW}Attempting to stop existing process...${NC}"
    
    # Try to stop any existing PM2 process with the same name
    if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
        pm2 delete "$APP_NAME" || true
        pm2 save --force || true
    fi
    
    # Kill processes on the port
    fuser -k $LISTEN_PORT/tcp || true
    sleep 2
    
    # Check again
    if lsof -i :$LISTEN_PORT >/dev/null 2>&1; then
        echo -e "${RED}Could not free port $LISTEN_PORT. Please manually stop the process and run the script again.${NC}"
        exit 1
    else
        echo -e "${GREEN}Port $LISTEN_PORT is now available.${NC}"
    fi
else
    echo -e "${GREEN}Port $LISTEN_PORT is available.${NC}"
fi

# System Updates
echo -e "${YELLOW}[1/11] Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# Install Dependencies
echo -e "${YELLOW}[2/11] Installing dependencies...${NC}"
apt-get install -y \
  curl git ufw \
  mysql-server mysql-client \
  build-essential python3-minimal \
  libssl-dev ca-certificates \
  psmisc # for fuser command

# Install Node.js via NodeSource
if ! command -v node >/dev/null; then
  echo -e "${YELLOW}[3/11] Installing Node.js 18.x...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

# Install PM2
echo -e "${YELLOW}[4/11] Installing PM2...${NC}"
npm install -g pm2

# Create Application Directory
echo -e "${YELLOW}[5/11] Setting up application directory...${NC}"
mkdir -p "$APP_DIR" "$LOG_DIR"
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR" "$LOG_DIR"

# Clone or Update Repository
if [ -d "$APP_DIR/.git" ]; then
  echo -e "${YELLOW}Updating existing repository...${NC}"
  cd "$APP_DIR"
  sudo -u "$RUN_USER" git pull origin "$BRANCH"
else
  echo -e "${YELLOW}Cloning repository...${NC}"
  sudo -u "$RUN_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# Install Node Dependencies
echo -e "${YELLOW}[6/11] Installing application dependencies...${NC}"
cd "$APP_DIR"
sudo -u "$RUN_USER" npm install --production

# Configure Environment
echo -e "${YELLOW}[7/11] Configuring environment...${NC}"
if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF > "$ENV_FILE"
# Server Configuration
LISTEN_PORT=$LISTEN_PORT
NODE_ENV=production

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=cat1_meters

# Security
JWT_SECRET=$(openssl rand -hex 32)
DOWNLINK_SECRET=$(openssl rand -hex 32)

# Logging
LOG_LEVEL=info
LOG_DIR=$LOG_DIR
LOG_RETENTION_DAYS=7

# Advanced
MAX_CONNECTIONS=100
CONNECTION_TIMEOUT=30000
EOF
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}Created new .env file${NC}"
else
  echo -e "${YELLOW}Using existing .env file${NC}"
  # Update port in existing env file if needed
  sed -i "s/^LISTEN_PORT=.*/LISTEN_PORT=$LISTEN_PORT/" "$ENV_FILE"
fi

# Database Setup
echo -e "${YELLOW}[8/11] Configuring database...${NC}"
mysql -u root <<MYSQL_SCRIPT
CREATE DATABASE IF NOT EXISTS cat1_meters;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON cat1_meters.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;

USE cat1_meters;

CREATE TABLE IF NOT EXISTS raw_meter_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payload TEXT NOT NULL,
  client_address VARCHAR(255),
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (received_at)
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_data_id INT,
  device_id VARCHAR(255),
  meter_reading DECIMAL(12,2),
  battery_level INT,
  valve_status TINYINT(1),
  additional_data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raw_data_id) REFERENCES raw_meter_data(id),
  INDEX (device_id),
  INDEX (created_at)
);

CREATE TABLE IF NOT EXISTS downlink_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  message JSON NOT NULL,
  message_type VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  status ENUM('queued', 'sent', 'delivered', 'failed') DEFAULT 'queued',
  error VARCHAR(255),
  INDEX (device_id),
  INDEX (status)
);

CREATE TABLE IF NOT EXISTS devices (
  device_id VARCHAR(255) PRIMARY KEY,
  valve_state ENUM('open', 'closed', 'partial') DEFAULT 'closed',
  valve_position TINYINT DEFAULT 0,
  last_command_at DATETIME,
  last_seen_at DATETIME,
  firmware_version VARCHAR(50),
  INDEX (last_seen_at)
);
MYSQL_SCRIPT

# Firewall Configuration
echo -e "${YELLOW}[9/11] Configuring firewall...${NC}"
ufw allow ssh
ufw allow "$LISTEN_PORT/tcp"
ufw --force enable

# Stop any existing instance
echo -e "${YELLOW}[10/11] Stopping any existing instance...${NC}"
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 save --force 2>/dev/null || true

# Application Startup
echo -e "${YELLOW}[11/11] Starting application...${NC}"
cd "$APP_DIR"
pm2 start ecosystem.config.js --name "$APP_NAME"
pm2 save

# Enable automatic startup - FIXED VERSION
echo -e "${YELLOW}Setting up PM2 startup...${NC}"
# Extract only the actual command from pm2 startup output
STARTUP_CMD=$(pm2 startup systemd -u "$RUN_USER" --hp "/home/$RUN_USER" | tail -1)
if [[ "$STARTUP_CMD" == sudo* ]]; then
  eval "$STARTUP_CMD"
else
  echo -e "${YELLOW}PM2 startup command not found, attempting manual setup...${NC}"
  # Fallback: manually create the service file
  pm2 startup systemd -u "$RUN_USER" --hp "/home/$RUN_USER" --no-daemon
fi

# Create log rotation
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
    postrotate
        pm2 reloadLogs >/dev/null 2>&1
    endscript
}
EOF

# Health Check
sleep 5
if pm2 status "$APP_NAME" --no-color | grep -q online; then
  echo -e "\n${GREEN}✅ Deployment successful!${NC}"
  echo -e "Application is running on port ${YELLOW}$LISTEN_PORT${NC}"
  echo -e "Logs directory: ${YELLOW}$LOG_DIR${NC}"
  echo -e "\nDatabase credentials:"
  echo -e "  User: ${YELLOW}$DB_USER${NC}"
  echo -e "  Password: ${YELLOW}$DB_PASSWORD${NC}"
  echo -e "\nUseful commands:"
  echo -e "  View logs: ${YELLOW}pm2 logs $APP_NAME${NC}"
  echo -e "  View status: ${YELLOW}pm2 status${NC}"
  echo -e "  Restart: ${YELLOW}pm2 restart $APP_NAME${NC}"
else
  echo -e "\n${RED}⚠️ Deployment completed but application failed to start${NC}"
  echo -e "Check logs with: ${YELLOW}pm2 logs $APP_NAME${NC}"
  echo -e "Checking port usage:"
  lsof -i :$LISTEN_PORT || true
  exit 1
fi