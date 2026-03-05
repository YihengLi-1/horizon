#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${BACKUP_DRILL_OUTPUT_DIR:-$ROOT_DIR/reports/sis-automation/artifacts}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

POSTGRES_HOST="${POSTGRES_HOST:-${PGHOST:-localhost}}"
POSTGRES_PORT="${POSTGRES_PORT:-${PGPORT:-5432}}"
POSTGRES_USER="${POSTGRES_USER:-${PGUSER:-postgres}}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${PGPASSWORD:-postgres}}"
POSTGRES_DB="${POSTGRES_DB:-sis_db}"
DRILL_DB="${BACKUP_DRILL_DB_NAME:-${POSTGRES_DB}_restore_drill_${TIMESTAMP}}"
KEEP_DRILL_DB="${BACKUP_DRILL_KEEP_DB:-false}"

export PGPASSWORD="$POSTGRES_PASSWORD"

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[FAIL] missing required binary: $1"
    exit 1
  fi
}

require_bin pg_dump
require_bin pg_restore
require_bin psql
require_bin dropdb
require_bin createdb

mkdir -p "$OUT_DIR"
BACKUP_FILE="$OUT_DIR/sis-backup-${TIMESTAMP}.dump"

echo "[INFO] running backup/restore drill"
echo "[INFO] source db: ${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
echo "[INFO] drill db: ${DRILL_DB}"
echo "[INFO] artifact: ${BACKUP_FILE}"

pg_dump \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --format=custom \
  --clean \
  --if-exists \
  --file "$BACKUP_FILE" \
  "$POSTGRES_DB"
echo "[PASS] backup created"

if command -v shasum >/dev/null 2>&1; then
  BACKUP_SHA256="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  BACKUP_SHA256="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
else
  BACKUP_SHA256="unavailable"
fi
BACKUP_BYTES="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"

dropdb \
  --if-exists \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  "$DRILL_DB"

createdb \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  "$DRILL_DB"
echo "[PASS] drill database created"

pg_restore \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$DRILL_DB" \
  --clean \
  --if-exists \
  "$BACKUP_FILE"
echo "[PASS] backup restored to drill database"

TABLE_COUNT="$(psql \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$DRILL_DB" \
  --tuples-only \
  --no-align \
  --command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d '[:space:]')"
echo "[PASS] restore validation: public tables=${TABLE_COUNT}"

USER_COUNT="$(psql \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --dbname "$DRILL_DB" \
  --tuples-only \
  --no-align \
  --command "SELECT COUNT(*) FROM \"User\";" 2>/dev/null | tr -d '[:space:]' || true)"
if [[ -n "$USER_COUNT" ]]; then
  echo "[PASS] restore validation: users=${USER_COUNT}"
else
  echo "[WARN] restore validation: skipped \"User\" count (table not found or inaccessible)"
fi

if [[ "$KEEP_DRILL_DB" == "true" ]]; then
  echo "[INFO] keeping drill database ${DRILL_DB} (BACKUP_DRILL_KEEP_DB=true)"
else
  dropdb \
    --host "$POSTGRES_HOST" \
    --port "$POSTGRES_PORT" \
    --username "$POSTGRES_USER" \
    "$DRILL_DB"
  echo "[PASS] drill database cleaned up"
fi

echo "[SUMMARY] backup_restore_drill"
echo "  backup_file=${BACKUP_FILE}"
echo "  backup_sha256=${BACKUP_SHA256}"
echo "  backup_bytes=${BACKUP_BYTES}"
echo "  drill_db=${DRILL_DB}"
echo "  public_tables=${TABLE_COUNT}"
echo "  user_rows=${USER_COUNT:-n/a}"
