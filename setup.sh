#!/bin/bash
# Setup script for SAP Commerce app on VM
# Installs Node.js + PostgreSQL + the web app

set -e

echo "=== Installing PostgreSQL ==="
apt-get update -qq
apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL and create app database/user
systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql -c "CREATE USER sapapp WITH PASSWORD 'sapapp123';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE sapcommerce OWNER sapapp;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE sapcommerce TO sapapp;" 2>/dev/null || true

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "=== Setting up app directory ==="
mkdir -p /opt/sapcommerce
cd /opt/sapcommerce

# Copy app files (passed via custom script extension fileUris)
cp /var/lib/waagent/custom-script/download/0/app.js . 2>/dev/null || true
cp /var/lib/waagent/custom-script/download/0/package.json . 2>/dev/null || true

# If files weren't copied, create inline
if [ ! -f package.json ]; then
  cat > package.json << 'PKGEOF'
{"name":"sap-commerce-api","version":"1.0.0","main":"app.js","dependencies":{"express":"^4.18.2","pg":"^8.11.3"}}
PKGEOF
fi

echo "=== Installing dependencies ==="
npm install --production

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/sapcommerce.service << EOF
[Unit]
Description=SAP Commerce API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sapcommerce
Environment=PORT=80
Environment=DB_HOST=localhost
Environment=DB_PORT=5432
Environment=DB_NAME=sapcommerce
Environment=DB_USER=sapapp
Environment=DB_PASSWORD=sapapp123
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sapcommerce
systemctl start sapcommerce

echo "=== SAP Commerce API started ==="
echo "DB_HOST: ${DB_HOST}"
echo "Listening on port 80"
