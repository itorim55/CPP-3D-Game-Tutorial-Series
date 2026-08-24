#!/usr/bin/env bash
# Backup diário da base de dados (mantém 14 dias).
# Cron: 0 6 * * * /caminho/para/rust-server-website/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/backups
cp data/stats.db "deploy/backups/stats-$(date +%F).db"
echo "[backup] OK: deploy/backups/stats-$(date +%F).db"
find deploy/backups -name 'stats-*.db' -mtime +14 -delete
