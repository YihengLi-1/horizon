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

check_contains "apps/api/src/main.ts" "ValidationPipe" "ValidationPipe configured"
check_exists "apps/api/src/auth/dto/login.dto.ts" "Login DTO exists"
check_exists "apps/api/src/registration/dto/enroll.dto.ts" "Enroll DTO exists"
check_exists "apps/api/src/common/sanitize.ts" "sanitizeHtml util exists"
check_exists "apps/api/src/common/global-exception.filter.ts" "AllExceptionsFilter exists"
check_contains "apps/api/prisma/schema.prisma" "RefreshToken" "RefreshToken model in schema"
check_contains "apps/api/prisma/schema.prisma" "SystemSetting" "SystemSetting model in schema"
check_contains "apps/api/prisma/schema.prisma" "studentId, status" "Enrollment perf index present"
check_contains "monitoring/alerts.yml" "HighErrorRate" "HighErrorRate alert defined"
check_exists "scripts/e2e-api-p0.mjs" "e2e smoke script exists"
check_exists "scripts/smoke-docker.sh" "smoke-docker script exists"
check_contains "package.json" "test:e2e" "test:e2e script in package.json"
check_contains "apps/api/src/auth/auth.controller.ts" "refresh" "refresh endpoint in auth controller"
check_contains "apps/api/src/main.ts" "unhandledRejection" "unhandledRejection handler in main.ts"
check_contains "apps/api/src/common/cache.ts" "getOrSet" "getOrSet cache helper exists"
check_contains "apps/api/src/registration/registration.service.ts" "Credit limit|max_credits" "credit limit check in registration service"

check_contains "apps/api/src/admin/admin.controller.ts" "enrollment-trend" "Enrollment trend endpoint in admin controller"
check_contains "apps/api/src/admin/admin.controller.ts" "dept-breakdown" "Dept breakdown endpoint in admin controller"
check_contains "apps/api/src/admin/admin.controller.ts" "top-sections" "Top sections endpoint in admin controller"
check_contains "apps/api/src/admin/admin.controller.ts" "gpa-distribution" "GPA distribution endpoint in admin controller"
check_contains "apps/api/src/students/students.controller.ts" "recommended" "Recommended sections endpoint in students controller"
check_exists "apps/web/components/SkipLink.tsx" "SkipLink component"
check_exists "apps/web/app/api/health/route.ts" "Next.js health API route"
check_exists ".github/workflows/ci.yml" "GitHub Actions CI workflow"
check_exists "scripts/db-seed-check.sh" "DB seed check script"
check_contains "apps/web/app/globals.css" "focus-visible" "focus-visible styles in globals.css"
check_contains "apps/web/components/NotificationBell.tsx" "aria-live" "aria-live on NotificationBell"
check_contains "apps/web/components/app-shell.tsx" "SkipLink" "SkipLink used in app-shell"
check_contains "apps/web/app/globals.css" "\\.dark \\.campus-card|dark.*campus-card" "Dark mode campus-card style"
check_contains "apps/api/src/main.ts" "ops/version" "/ops/version endpoint"
check_exists "apps/web/app/admin/sections/[id]/roster/page.tsx" "Section roster page"
check_contains "apps/web/app/student/schedule/page.tsx" "ics|iCal|VCALENDAR" "iCal export in schedule page"
check_contains "apps/web/app/student/cart/page.tsx" "waitlist-position|候补" "Waitlist position shown in cart"
check_contains "apps/web/app/student/profile/page.tsx" "completedCredits|Enrollment Summary|已修学分" "Enrollment summary in profile"
check_contains "apps/web/app/student/dashboard/RecommendedCourses.tsx" "recommended|/students/recommended" "Recommended sections in student dashboard"
check_contains "apps/api/prisma/schema.prisma" "NotificationLog" "NotificationLog model in schema"
check_contains "apps/api/src/admin/admin.controller.ts" "notification-log" "Notification log endpoint in admin"
check_exists "apps/web/app/admin/notifications/page.tsx" "Admin notification log page"
check_contains "apps/api/src/students/students.controller.ts" "announcements/public|getPublicAnnouncements" "Public announcements endpoint"
check_contains "apps/web/components/NotificationBell.tsx" "notif_last_seen|lastSeenAt" "Notification unread tracking in bell"
check_contains "apps/api/src/admin/admin.controller.ts" "Patch.*sections|sections.*Patch|updateSection" "PATCH admin sections endpoint"
check_contains "apps/api/src/admin/admin.controller.ts" "Patch.*courses|courses.*Patch|updateCourse" "PATCH admin courses endpoint"
check_exists "apps/api/src/admin/dto/update-section.dto.ts" "UpdateSectionDto"
check_contains "apps/api/src/students/students.service.ts" "semesterGpa|semester.*gpa|semGpa" "Semester GPA in transcript"
check_contains "apps/web/app/student/grades/page.tsx" "GpaTrendChart" "GPA trend chart in grades page"
check_contains "apps/api/src/students/students.service.ts" "getOrSet|ttlCache|cache.*recommended" "Recommended sections cached"
check_contains "apps/api/src/admin/admin.service.ts" "getOrSet.*top-sections|getOrSet.*gpa-dist|getOrSet.*dept" "Admin stats cached"
check_contains "scripts/e2e-api-p0.mjs" "ops/version|Step 16" "E2E test has 16+ steps"
check_contains "apps/web/app/admin" "notifications|通知记录" "Notifications nav link in admin"
check_contains "apps/web/app/admin/sections/page.tsx" "roster" "Roster link in sections page"
check_exists "apps/api/src/admin/dto/update-section.dto.ts" "PATCH admin sections DTO"
check_contains "apps/api/src/admin/admin.service.ts" "updateSection" "Admin updateSection in service"
check_contains "apps/api/src/admin/admin.service.ts" "updateCourse" "Admin updateCourse in service"
check_contains "apps/api/src/students/students.service.ts" "semesterGpa" "Semester GPA returned from transcript"
check_contains "apps/api/src/notifications/notifications.service.ts" "notificationLog|NotificationLog" "NotificationLog insert in notifications"
check_contains "apps/api/src/students/students.service.ts" "getPublicAnnouncements" "Public announcements in students service"
check_contains "apps/web/app/student/grades/page.tsx" "dropDeadline|退课截止" "Drop deadline warning in grades page"
check_contains "apps/web/app/student/history/page.tsx" "下载|print|window.open" "History page per-term download"
check_contains "apps/web/app/student/catalog/page.tsx" "searchParams|dept.*param|useSearchParams" "Catalog dept filter from URL param"
check_contains "apps/web/components/Toast.tsx" "error.*persist|type.*error|clearTimeout" "Toast error no auto-dismiss"
check_contains "apps/api/src" "Cache-Control|cache-control|max-age" "Cache-Control on terms endpoint"
check_contains "scripts/e2e-api-p0.mjs" "\\\\x1b|ANSI|green|\\\\033" "E2E colored output"
check_exists "apps/api/src/registration/registration.service.spec.ts" "Registration unit tests"
check_exists "apps/api/src/auth/auth.service.spec.ts" "Auth unit tests"
check_exists "apps/api/src/admin/admin.service.spec.ts" "Admin unit tests"
check_contains "scripts/e2e-api-p0.mjs" "Step 24|24.*passed|24/24" "E2E has 24 steps"
check_exists "docs/API.md" "API reference docs"
check_exists "docs/SCHEMA.md" "Schema documentation"
check_contains "README.md" "pnpm install|Quick Start|quick-start" "README has quick start"
check_contains "apps/api/src/auth/auth.controller.ts" "check-email|checkEmail" "Check-email endpoint"
check_contains "apps/api/src/main.ts" "X-Request-ID|request-id|requestId" "X-Request-ID header middleware"
check_contains "nginx/nginx.conf" "X-Content-Type-Options|nosniff" "Security headers in nginx"
check_contains "apps/api/src/main.ts" "db-check|SELECT 1|dbCheck" "DB check ops endpoint"
check_contains "apps/api/src/main.ts" "csp-report" "CSP report endpoint"
check_contains "apps/web/app/student/schedule/page.tsx" "share|Share|base64|btoa" "Schedule share button"
check_contains "apps/web/app/student/profile/page.tsx" "sis_goal|学习目标" "Student goal in profile"
check_contains "apps/web/app/admin/enrollments/page.tsx" "Force Drop|forceDrop" "Force drop in admin enrollments"
check_contains "apps/web/app/admin/waitlist/page.tsx" "sectionFilter|All sections|Section filter" "Waitlist section filter"
check_exists "apps/web/app/student/announcements/page.tsx" "Student announcements page"
check_exists "apps/web/app/admin/invite-codes/page.tsx" "Admin invite codes page"
check_contains "apps/web/components/app-shell.tsx" "student/announcements|Invite Codes" "Announcements and invite-code nav links"
check_exists "apps/api/ARCHITECTURE.md" "API architecture docs"
check_contains "apps/api/src/main.ts" "/api/health|status: \"ok\"|status:'ok'" "API health route in Nest app"
check_contains "nginx/nginx.conf" "Permissions-Policy|X-Frame-Options" "Expanded security headers in nginx"
check_exists "apps/web/app/student/schedule/loading.tsx" "Student schedule loading skeleton"
check_contains "apps/web/app/(auth)/register/page.tsx" "check-email|此邮箱已注册|Checking email" "Register email existence warning"
check_contains "apps/web/components/NotificationBell.tsx" "30000|30_000|30\\s*\\*" "Notification polling at 30s"
check_contains "apps/api/src/admin/admin.controller.ts" "Delete.*terms|terms.*Delete|deleteTerm" "Admin terms delete guard"
check_contains "apps/web/app/admin/terms/page.tsx" "registrationOpen|toggle|开放" "Terms registration toggle in UI"
check_contains "apps/web/app/admin/terms/page.tsx" "campus-kpi|Total Terms|学期总数" "Admin terms KPI row"
check_contains "apps/web/app/admin/courses/page.tsx" "dept.*filter|filterDept|Dept" "Course dept filter in UI"
check_contains "apps/web/app/admin/courses/page.tsx" "新增课程|Create New Course" "Admin courses add form"
check_contains "apps/api/src/admin/admin.service.ts" "prerequisiteCourseIds|prerequisite.*create|prereq.*update" "Course prereq update in service"
check_contains "apps/web/app/admin/sections/page.tsx" "新增教学班|onCreateSection|create section" "Section add form in UI"
check_contains "apps/web/app/admin/sections/page.tsx" "detectConflicts|conflict|冲突" "Section conflict detector"
check_contains "apps/web/app/admin/sections/[id]/roster/page.tsx" "csv|CSV|Blob|export" "Roster CSV export"
check_contains "apps/api/src/admin/admin.controller.ts" "import/sections|importSections" "Import sections in admin controller"
check_contains "apps/api/src/admin/admin.service.ts" "importSections" "Import sections service method"
check_contains "apps/api/src/admin/admin.controller.ts" "import/courses|importCourses" "Import courses endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getDataQuality|dataQuality" "Data quality service method"
check_contains "apps/api/src/admin/admin.controller.ts" "reports/summary|getReportsSummary" "Reports summary endpoint"
check_contains "apps/web/app/admin/reports/page.tsx" "AllTranscripts|all-transcripts|transcript.*export" "All transcripts export in reports"
check_exists "apps/api/src/common/maintenance.middleware.ts" "Maintenance middleware"
check_contains "apps/api/src/app.module.ts" "MaintenanceMiddleware|maintenance" "Maintenance middleware registered"
check_contains "apps/web/app/admin/settings/SystemSettingsEditor.tsx" "maintenance_mode|维护模式" "Maintenance mode settings UI"
check_contains "apps/api/src/admin/admin.controller.ts" "invite-codes.*:id|Delete.*invite" "Delete invite code in admin controller"
check_contains "apps/api/src/admin/admin.controller.ts" "Patch.*announcement|announcements.*Patch|updateAnnouncement" "Announcement PATCH endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "updateAnnouncement" "Announcement update in service"
check_contains "apps/api/src/students/students.controller.ts" "contact|Contact" "Student contact API endpoint"
check_contains "apps/web/app/student/profile/page.tsx" "privacy|隐私|允许推荐" "Student profile privacy settings"
check_contains "apps/web/next.config.ts" "poweredByHeader|powered.*false" "Next.js poweredByHeader disabled"
check_exists "apps/web/app/manifest.json" "PWA manifest"
check_contains "apps/api/src/registration/registration.service.spec.ts" "waitlist.*position|getWaitlistPosition" "Waitlist position unit tests"
check_contains "apps/api/src/admin/admin.service.spec.ts" "getEnrollmentTrend|enrollment.*trend" "Enrollment trend unit tests"
check_contains "apps/web/components/app-shell.tsx" "学术管理|注册管理|通知记录|邀请码" "Admin nav grouped sections"

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
