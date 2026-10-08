#!/usr/bin/env bash
set -euo pipefail
if test ! -d /opt/owed-app/.git; then
  git clone --depth 1 https://github.com/ShalyX/owed-monad.git /opt/owed-app
else
  git -C /opt/owed-app pull --ff-only origin main
fi
if test ! -x /opt/owed-worker/node; then
  install -m 755 "$(command -v node)" /opt/owed-worker/node
fi
cat > /etc/systemd/system/owed-app.service <<'EOF'
[Unit]
Description=Owed Private Web App / Testnet Wallet UX
After=network.target owed-inference.service
Wants=owed-inference.service

[Service]
User=owedworker
Group=owedworker
WorkingDirectory=/opt/owed-app
EnvironmentFile=/etc/owed-inference.env
Environment=LOCAL_INFERENCE_URL=http://127.0.0.1:18765
Environment=HOST=127.0.0.1
Environment=PORT=3001
Environment=NODE_ENV=production
ExecStart=/opt/owed-worker/node server.mjs
Restart=on-failure
RestartSec=3
MemoryHigh=170M
MemoryMax=300M
CPUQuota=100%
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now owed-app.service
echo OWED_APP_STATUS
systemctl is-active owed-app.service
echo OWED_HTTP_HEALTH
curl -fsS --max-time 8 http://127.0.0.1:3001/health
echo
echo OWED_PRIVATE_BIND
ss -ltnp | grep ':3001' || true
