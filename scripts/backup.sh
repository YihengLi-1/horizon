#!/bin/bash
set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/tmp/sis-backups}"
BACKUP_FILE="$BACKUP_DIR/sis_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
echo "🧹 Old backups cleaned (kept last 7 days)"
