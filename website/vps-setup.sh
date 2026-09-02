#!/bin/bash
# VPS setup script for vibestudy.ru
# Runs on the VPS, proxies to the home server over Tailscale.
# Configure via env vars (no secrets/topology details committed):
#   HOME_UPSTREAM — Tailscale IP (or MagicDNS name) of the home server, e.g. 100.x.y.z
#   DOMAIN        — site domain
#   EMAIL         — ACME account email
set -e

: "${HOME_UPSTREAM:?set HOME_UPSTREAM (Tailscale IP/MagicDNS of the home server)}"
: "${DOMAIN:?set DOMAIN (e.g. vibestudy.ru)}"
: "${EMAIL:?set EMAIL (ACME account email)}"

echo "=== Installing nginx + certbot ==="
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx
mkdir -p /var/www/certbot

echo "=== Writing HTTP-only config (ACME first) ==="
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
EOF

ln -sf /etc/nginx/sites-available/natux /etc/nginx/sites-enabled/natux
rm -f /etc/nginx/sites-enabled/default

echo "=== Testing and starting nginx (HTTP only) ==="
nginx -t
systemctl restart nginx

echo "=== Getting SSL certificate ==="
certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} -d www.${DOMAIN} \
  --non-interactive --agree-tos -m ${EMAIL}

echo "=== Writing full TLS config ==="
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
        proxy_pass         http://${HOME_UPSTREAM}:3000;
        proxy_http_version 1.1;
        # WebSocket upgrades are intentionally NOT proxied (the site uses none).
        proxy_set_header   Connection '';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        # The application trusts the first X-Forwarded-For value for rate limits.
        # Overwrite, never append a client-controlled incoming header.
        proxy_set_header   X-Forwarded-For \$remote_addr;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout    60s;
    }
}
EOF

nginx -t
systemctl reload nginx

echo "=== Setting up auto-renewal ==="
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo ""
echo "✅ VPS готов! nginx проксирует ${DOMAIN} → ${HOME_UPSTREAM}:3000"
echo "Теперь запусти Next.js на домашнем сервере на порту 3000."
