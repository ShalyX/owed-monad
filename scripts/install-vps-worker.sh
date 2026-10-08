#!/usr/bin/env bash
set -euo pipefail
# Execute on authorized VPS as root after provisioning Ollama and faster-whisper.
test "$(id -u)" = "0" || { echo 'Root required'; exit 1; }
test -f /opt/owed-worker/inference-worker.py || { echo 'Worker script missing'; exit 1; }
test -x /opt/owed-inference-venv/bin/python || { echo 'venv missing'; exit 1; }
if ! id owedworker >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/owed-worker --shell /usr/sbin/nologin owedworker
fi
install -d -o owedworker -g owedworker -m 750 /var/lib/owed-worker
install -d -o owedworker -g owedworker -m 750 /var/lib/owed-worker/models /var/lib/owed-worker/tmp
chown -R owedworker:owedworker /var/lib/owed-worker
chown root:root /opt/owed-worker/inference-worker.py
chmod 644 /opt/owed-worker/inference-worker.py
if test ! -f /etc/owed-inference.env; then
  umask 077
  printf 'OWED_WORKER_TOKEN=%s\nOWED_TEXT_MODEL=qwen2.5:0.5b\nOWED_WHISPER_MODEL=tiny.en\n' "$(openssl rand -hex 32)" > /etc/owed-inference.env
fi
chmod 600 /etc/owed-inference.env
cat > /etc/systemd/system/owed-inference.service <<'EOF'
[Unit]
Description=Owed Private CPU Inference (loopback only)
After=network.target ollama.service
Wants=ollama.service

[Service]
User=owedworker
Group=owedworker
WorkingDirectory=/opt/owed-worker
EnvironmentFile=/etc/owed-inference.env
Environment=PYTHONUNBUFFERED=1
Environment=HF_HOME=/var/lib/owed-worker/models
ExecStart=/opt/owed-inference-venv/bin/python /opt/owed-worker/inference-worker.py
Restart=on-failure
RestartSec=3
MemoryHigh=850M
MemoryMax=1100M
CPUQuota=170%
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/owed-worker
ProtectHome=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now owed-inference.service
echo WORKER_SERVICE_CREATED
systemctl --no-pager --full status owed-inference.service | head -17
echo WORKER_BINDING
ss -ltnp | grep ':18765' || true
