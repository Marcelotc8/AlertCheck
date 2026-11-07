#!/usr/bin/env bash
# Prepara un servidor Ubuntu nuevo de Vultr para la API de StormCheck.
# Uso (como root en el servidor):
#   curl -fsSL https://raw.githubusercontent.com/Marcelotc8/stormcheck/main/deploy/setup.sh | bash -s -- api.tudominio.com
# Sin dominio todavía: deja el argumento vacío y se usa <ip>.sslip.io (HTTPS válido igual).
# Antes o después, copia las claves:  scp api/.env root@IP:/opt/stormcheck/api/.env
set -euo pipefail

REPO="https://github.com/Marcelotc8/stormcheck.git"
APP_DIR="/opt/stormcheck"
IP="$(curl -fsS4 https://api.ipify.org)"
DOMAIN="${1:-${IP//./-}.sslip.io}"

echo "==> Paquetes base, Node 20, pm2 y Caddy"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https gnupg
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> Código"
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull --ff-only; else git clone "$REPO" "$APP_DIR"; fi
cd "$APP_DIR/api"
npm ci
touch .env

echo "==> API con pm2"
pm2 delete stormcheck-api >/dev/null 2>&1 || true
pm2 start npm --name stormcheck-api -- start
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null

echo "==> HTTPS con Caddy en $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy localhost:8787
}
EOF
systemctl reload caddy || systemctl restart caddy

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

echo
echo "Listo. API: https://$DOMAIN"
grep -q SWARMS_API_KEY .env || echo "FALTA: copia las claves con  scp api/.env root@$IP:$APP_DIR/api/.env  y luego  pm2 restart stormcheck-api"
