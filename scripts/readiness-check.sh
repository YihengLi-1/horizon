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

check_exists "apps/api/src/main.ts" "API bootstrap exists"
check_exists "apps/api/src/registration/registration.service.ts" "Registration service exists"
check_exists "apps/api/src/admin/admin.service.ts" "Admin service exists"
check_exists "apps/api/src/notifications/notifications.service.ts" "Notifications service exists"
check_exists "docker-compose.yml" "Docker Compose exists"

check_contains "apps/api/src/app.module.ts" "ThrottlerModule" "Global API throttling configured"
check_contains "apps/api/src/auth/auth.controller.ts" "@Throttle" "Auth endpoints have throttling"
check_contains "apps/api/src/main.ts" "CSRF_ORIGIN_BLOCKED" "CSRF origin guard middleware present"
check_contains "apps/api/src/registration/registration.service.ts" "FOR UPDATE" "Enrollment concurrency lock uses FOR UPDATE"
check_contains "apps/api/src/registration/registration.service.ts" "TransactionIsolationLevel\.Serializable" "Serializable transaction retry path present"
check_contains "apps/api/src/auth/auth.service.ts" "usedAt" "Reset/verification token one-time use tracking present"
check_contains "apps/api/prisma/schema.prisma" "deletedAt" "Soft-delete fields present in schema"
check_contains "apps/api/src/admin/admin.controller.ts" "audit-logs/integrity" "Audit integrity endpoint exposed"
check_contains "apps/api/src/health/health.controller.ts" "@Get\\(\"health\"\\)" "Health endpoint exists"
check_contains "docker-compose.yml" "postgres-backup" "Database backup sidecar configured"
check_contains "docker-compose.yml" "pgbackups" "Backup volume configured"
check_contains "apps/api/src/admin/admin.service.ts" "pageSize" "Admin server-side pagination logic present"
check_contains "apps/api/src/admin/admin.service.ts" "COMPLETED_ENROLLMENT_LOCKED" "Grade lock for completed enrollments present"
check_contains "apps/api/src/notifications/notifications.service.ts" "sendGradePostedEmail" "Grade email notification handler present"
check_contains "apps/api/src/notifications/notifications.service.ts" "sendWaitlistPromotionEmail" "Waitlist promotion email handler present"

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
else
  warning ".env not found"
fi

echo
printf "Summary: %d pass, %d warn, %d fail\n" "$pass" "$warn" "$fail"

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
