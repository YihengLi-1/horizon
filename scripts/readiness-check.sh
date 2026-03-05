#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

pass=0
warn=0
fail=0

ok() {
  echo "[PASS] $1"
  pass=$((pass + 1))
}

warning() {
  echo "[WARN] $1"
  warn=$((warn + 1))
}

bad() {
  echo "[FAIL] $1"
  fail=$((fail + 1))
}

check_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if rg -n "$pattern" "$file" >/dev/null 2>&1; then
    ok "$message"
  else
    bad "$message"
  fi
}

check_exists() {
  local file="$1"
  local message="$2"
  if [[ -f "$file" ]]; then
    ok "$message"
  else
    bad "$message"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  local line
  line="$(rg -n "^${key}=" "$file" -m 1 -N 2>/dev/null | head -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  echo "$line"
}

check_env_pair_match() {
  local file="$1"
  local key_a="$2"
  local key_b="$3"
  local label="$4"
  if [[ ! -f "$file" ]]; then
    warning "$file not found, skipped $label"
    return 0
  fi

  local value_a value_b
  value_a="$(read_env_value "$file" "$key_a")"
  value_b="$(read_env_value "$file" "$key_b")"

  if [[ -z "$value_a" || -z "$value_b" ]]; then
    warning "$file missing $key_a or $key_b for $label"
    return 0
  fi

  if [[ "$value_a" == "$value_b" ]]; then
    ok "$label"
  else
    bad "$label ($key_a=$value_a, $key_b=$value_b)"
  fi
}

check_exists "apps/api/src/main.ts" "API bootstrap exists"
check_exists "apps/api/src/registration/registration.service.ts" "Registration service exists"
check_exists "apps/api/src/admin/admin.service.ts" "Admin service exists"
check_exists "apps/api/src/notifications/notifications.service.ts" "Notifications service exists"
check_exists "docker-compose.yml" "Docker Compose exists"

check_contains "apps/api/src/app.module.ts" "ThrottlerModule" "Global API throttling configured"
check_contains "apps/api/src/auth/auth.controller.ts" "@Throttle" "Auth endpoints have throttling"
check_contains "apps/api/src/main.ts" "CSRF_ORIGIN_BLOCKED" "CSRF origin guard middleware present"
check_contains "apps/api/src/main.ts" "MAIL_DELIVERY_FAILURE_SPIKE" "Mail delivery failure alert present"
check_contains "apps/api/src/registration/registration.service.ts" "FOR UPDATE" "Enrollment concurrency lock uses FOR UPDATE"
check_contains "apps/api/src/registration/registration.service.ts" "TransactionIsolationLevel\.Serializable" "Serializable transaction retry path present"
check_contains "apps/api/src/auth/auth.service.ts" "usedAt" "Reset/verification token one-time use tracking present"
check_contains "apps/api/prisma/schema.prisma" "deletedAt" "Soft-delete fields present in schema"
check_contains "apps/api/src/admin/admin.controller.ts" "audit-logs/integrity" "Audit integrity endpoint exposed"
check_contains "apps/api/src/health/health.controller.ts" "@Get\\(\"health\"\\)" "Health endpoint exists"
check_contains "docker-compose.yml" "postgres-backup" "Database backup sidecar configured"
check_contains "docker-compose.yml" "pgbackups" "Backup volume configured"
check_contains "scripts/backup-restore-drill.sh" "pg_restore" "Backup restore drill script present"
check_contains "apps/api/src/admin/admin.service.ts" "pageSize" "Admin server-side pagination logic present"
check_contains "apps/api/src/admin/admin.service.ts" "COMPLETED_ENROLLMENT_LOCKED" "Grade lock for completed enrollments present"
check_contains "apps/api/src/notifications/notifications.service.ts" "sendGradePostedEmail" "Grade email notification handler present"
check_contains "apps/api/src/notifications/notifications.service.ts" "sendWaitlistPromotionEmail" "Waitlist promotion email handler present"
check_contains "apps/api/src/notifications/notifications.service.ts" "getHealthSnapshot" "Email health snapshot exposed for ops metrics"
check_contains "apps/web/lib/server-api.ts" "NEXT_PUBLIC_CSRF_COOKIE_NAME" "Server API uses configurable CSRF cookie name"
check_contains "apps/web/lib/server-api.ts" "NEXT_PUBLIC_CSRF_HEADER_NAME" "Server API uses configurable CSRF header name"

if [[ -f .env ]]; then
  if rg -n '^MAIL_ENABLED=' .env >/dev/null 2>&1; then
    ok ".env has MAIL_ENABLED"
  else
    warning ".env missing MAIL_ENABLED (email notifications will likely stay disabled)"
  fi
  if rg -n '^SMTP_HOST=' .env >/dev/null 2>&1; then
    ok ".env has SMTP_HOST"
  else
    warning ".env missing SMTP_HOST"
  fi
  check_env_pair_match ".env" "CSRF_COOKIE_NAME" "NEXT_PUBLIC_CSRF_COOKIE_NAME" ".env CSRF cookie name aligned (API/Web)"
  check_env_pair_match ".env" "CSRF_HEADER_NAME" "NEXT_PUBLIC_CSRF_HEADER_NAME" ".env CSRF header name aligned (API/Web)"
else
  warning ".env not found"
fi

check_env_pair_match ".env.example" "CSRF_COOKIE_NAME" "NEXT_PUBLIC_CSRF_COOKIE_NAME" ".env.example CSRF cookie name aligned (API/Web)"
check_env_pair_match ".env.example" "CSRF_HEADER_NAME" "NEXT_PUBLIC_CSRF_HEADER_NAME" ".env.example CSRF header name aligned (API/Web)"

if [[ -f monitoring/prometheus.yml ]]; then
  ok "monitoring/prometheus.yml found"
else
  warning "monitoring/prometheus.yml missing — monitoring stack not configured"
fi

if [[ -f monitoring/alertmanager.yml ]]; then
  ok "monitoring/alertmanager.yml found"
else
  warning "monitoring/alertmanager.yml missing"
fi

if [[ -f monitoring/grafana/provisioning/datasources/prometheus.yml ]]; then
  ok "Grafana datasource provisioning found"
else
  warning "Grafana provisioning missing"
fi

if [[ -f nginx/nginx.conf ]]; then
  ok "nginx/nginx.conf found"
else
  warning "nginx/nginx.conf missing — reverse proxy not configured"
fi

if [[ -f docker-compose.prod.yml ]]; then
  ok "docker-compose.prod.yml found"
else
  warning "docker-compose.prod.yml missing"
fi

if grep -q "admin@sis.edu" apps/api/prisma/seed.ts 2>/dev/null; then
  ok "Seed file contains demo admin account"
else
  warning "Seed file may be missing demo data"
fi

FILE_COUNT=0
if [[ -d monitoring ]]; then
  FILE_COUNT="$(find monitoring/ -type f | wc -l | tr -d ' ')"
fi
if [[ "$FILE_COUNT" -ge 6 ]]; then
  ok "Monitoring stack has $FILE_COUNT config files"
else
  warning "Monitoring stack incomplete ($FILE_COUNT files found, expected ≥6)"
fi

if curl -sf http://localhost:4000/api/docs-json > /dev/null 2>&1; then
  ok "Swagger docs reachable at /api/docs"
else
  warning "Swagger docs not reachable (start API first)"
fi

echo
printf "Summary: %d pass, %d warn, %d fail\n" "$pass" "$warn" "$fail"

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
