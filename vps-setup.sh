#!/bin/bash
# VPS setup script for vibestudy.ru
# Runs on the VPS, proxies to home server via Tailscale (100.118.46.58)
set -e

HOME_TAILSCALE_IP="100.118.46.58"
DOMAIN="vibestudy.ru"
EMAIL="aleksei.kolganov.2019@gmail.com"

echo "=== Installing nginx + certbot ==="
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

echo "=== Creating nginx config ==="
cat > /etc/nginx/sites-available/natux <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass         http://${HOME_TAILSCALE_IP}:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 10s;
        proxy_read_timeout    60s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/natux /etc/nginx/sites-enabled/natux
rm -f /etc/nginx/sites-enabled/default

echo "=== Testing nginx config ==="
nginx -t

echo "=== Starting nginx ==="
systemctl restart nginx

echo "=== Getting SSL certificate ==="
certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} \
  --non-interactive --agree-tos -m ${EMAIL}

echo "=== Setting up auto-renewal ==="
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo ""
echo "✅ VPS готов! nginx проксирует vibestudy.ru → ${HOME_TAILSCALE_IP}:3000"
echo "Теперь запусти Next.js на домашнем сервере на порту 3000."
