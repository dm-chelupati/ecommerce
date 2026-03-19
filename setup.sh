#!/bin/bash
# Setup script for E-Commerce app on VM
# Installs Node.js and the web app — connects to Cosmos DB via private endpoint

set -e

COSMOS_ENDPOINT="${1:?Usage: setup.sh <COSMOS_ENDPOINT> [COSMOS_DB_NAME]}"
COSMOS_DB_NAME="${2:-ecommerce}"

echo "=== Installing Node.js 20 ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "=== Setting up app directory ==="
mkdir -p /opt/ecommerce
cd /opt/ecommerce

echo "=== Installing dependencies ==="
cat > package.json << 'PKGEOF'
{"name":"ecommerce-api","version":"1.0.0","dependencies":{"express":"^4.18.2","@azure/cosmos":"^4.0.0","@azure/identity":"^4.0.0"}}
PKGEOF
npm install --production 2>/dev/null

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/ecommerce.service << EOF
[Unit]
Description=E-Commerce API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ecommerce
Environment=PORT=80
Environment=COSMOS_ENDPOINT=${COSMOS_ENDPOINT}
Environment=COSMOS_DB_NAME=${COSMOS_DB_NAME}
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ecommerce
systemctl restart ecommerce

echo "=== E-Commerce API started ==="
echo "COSMOS_ENDPOINT: ${COSMOS_ENDPOINT}"
echo "Listening on port 80"
