#!/usr/bin/env bash
# Backup harian database Catetin. Dijalankan dari cron, contoh (jam 02:30):
#   30 2 * * * /opt/catetin/deploy/backup.sh >> /var/log/catetin-backup.log 2>&1
# Restore:
#   docker compose -f /opt/catetin/docker-compose.yml exec -T postgres \
#     pg_restore -U catetin -d catetin --clean --if-exists < /var/backups/catetin/<file>.dump
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/catetin}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/catetin}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/catetin-$(date +%Y%m%d-%H%M%S).dump"

docker compose -f "$REPO_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U catetin -d catetin --format=custom > "$file.tmp"
mv "$file.tmp" "$file"

find "$BACKUP_DIR" -name 'catetin-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $file ($(du -h "$file" | cut -f1))"
