#!/usr/bin/env bash
# Publish Owed through an ephemeral Cloudflare HTTPS tunnel without opening VPS ports.
# An owned domain and named tunnel are required before sharing a permanent judge URL.
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo "Run this on the VPS as root"; exit 1; fi
test -x /usr/local/bin/cloudflared
test -f /etc/systemd/system/owed-app.service
id owedworker >/dev/null
mkdir -p /etc/systemd/system/owed-app.service.d
cat > /etc/systemd/system/owed-app.service.d/public-demo.conf <<'EOF'
[Service]
Environment=OWED_PUBLIC_DEMO=1
EOF
cat > /etc/systemd/system/owed-demo-tunnel.service <<'EOF'
[Unit]
Description=Owed ephemeral HTTPS demo tunnel (Cloudflare Quick Tunnel)
After=network-online.target owed-app.service
Wants=network-online.target
Requires=owed-app.service

[Service]
User=owedworker
Group=owedworker
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3001
Restart=on-failure
RestartSec=10
MemoryMax=150M
CPUQuota=35%
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl restart owed-app.service
systemctl enable --now owed-demo-tunnel.service
echo APP_AND_AI
systemctl is-active owed-app.service owed-inference.service ollama.service owed-demo-tunnel.service
echo PRIVATE_ORIGIN
curl -fsS --max-time 10 http://127.0.0.1:3001/health
echo
echo TUNNEL_LINK
# Cloudflare's random URL changes when the tunnel restarts.
journalctl -u owed-demo-tunnel.service --no-pager -n 90 -o cat | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true
