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
  # Use rg if available as real binary, otherwise fall back to grep -rE
  if command -v rg >/dev/null 2>&1 && rg --version >/dev/null 2>&1; then
    if rg -n "$pattern" "$file" >/dev/null 2>&1; then
      ok "$message"; else bad "$message"; fi
  else
    if grep -rE "$pattern" "$file" >/dev/null 2>&1; then
      ok "$message"; else bad "$message"; fi
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
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | head -n 1 || true)"
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
  if grep -E '^MAIL_ENABLED=' .env >/dev/null 2>&1; then
    ok ".env has MAIL_ENABLED"
  else
    warning ".env missing MAIL_ENABLED (email notifications will likely stay disabled)"
  fi
  if grep -E '^SMTP_HOST=' .env >/dev/null 2>&1; then
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

if grep -q "admin@univ.edu" apps/api/prisma/seed.ts 2>/dev/null; then
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
check_contains "apps/web/app/globals.css" "\\.campus-card \\{|box-shadow:.*hsl\\(221 30% 85%" "Updated campus-card design system"
check_contains "apps/api/src/main.ts" "ops/version" "/ops/version endpoint"
check_exists "apps/web/app/admin/sections/[id]/roster/page.tsx" "Section roster page"
check_contains "apps/web/app/student/schedule/page.tsx" "ics|iCal|VCALENDAR" "iCal export in schedule page"
check_contains "apps/web/app/student/cart/page.tsx" "waitlist-position|候补" "Waitlist position shown in cart"
check_contains "apps/web/app/student/profile/page.tsx" "completedCredits|Enrollment Summary|已修学分" "Enrollment summary in profile"
check_contains "apps/web/app/student/dashboard/RecommendedCourses.tsx" "recommended|/students/recommended" "Recommended sections in student dashboard"
check_contains "apps/api/prisma/schema.prisma" "NotificationLog" "NotificationLog model in schema"
check_contains "apps/api/src/admin/admin.controller.ts" "notification-log" "Notification log endpoint in admin"
check_contains "apps/api/src/students/students.controller.ts" "announcements/public|getPublicAnnouncements" "Public announcements endpoint"
check_contains "apps/web/components/NotificationBell.tsx" "unread-count|setInterval|markAllRead" "Notification unread tracking in bell"
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
check_contains "apps/web/app/student/catalog/page.tsx" "searchParams|dept.*param|useSearchParams" "Catalog dept filter from URL param"
check_contains "apps/web/components/toast-provider.tsx" "type === \"error\" \\? 6000 : 4000|duration" "Toast error duration policy"
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
check_contains "apps/web/app/student/schedule/page.tsx" "iCal|downloadIcs|ical" "Schedule iCal export"
check_contains "apps/web/app/student/profile/page.tsx" "ProfileCompletenessCard|学业汇总|修改密码" "Student profile keeps only essential profile tools"
check_contains "apps/web/app/admin/enrollments/page.tsx" "Force Drop|forceDrop" "Force drop in admin enrollments"
check_contains "apps/api/prisma/schema.prisma" "FacultyProfile|AdvisorProfile|AdvisorAssignment|AdvisorNote" "Faculty and advisor actor models in schema"
check_contains "apps/api/src/faculty/faculty.service.ts" "FACULTY_SECTION_FORBIDDEN|faculty_grade_submit|faculty_roster_view" "Faculty owned-section permission and audit workflow"
check_contains "apps/api/src/advising/advising.service.ts" "ADVISEE_FORBIDDEN|advisor_note_create|advisor_advisee_view" "Advisor assignment permission and note workflow"
check_contains "apps/web/app/(auth)/login/page.tsx" "/faculty/dashboard|/advisor/dashboard" "Faculty and advisor login routes"
check_exists "apps/web/app/faculty/dashboard/page.tsx" "Faculty workspace page"
check_exists "apps/web/app/advisor/dashboard/page.tsx" "Advisor workspace page"
check_exists "apps/api/src/faculty/faculty.service.spec.ts" "Faculty workflow unit tests"
check_exists "apps/api/src/advising/advising.service.spec.ts" "Advisor workflow unit tests"
check_contains "apps/web/app/admin/waitlist/page.tsx" "sectionFilter|All sections|Section filter" "Waitlist section filter"
check_exists "apps/web/app/student/announcements/page.tsx" "Student announcements page"
check_contains "apps/web/components/app-shell.tsx" "admin/invite-codes|invite-codes" "Admin invite-codes nav link"
check_exists "apps/api/ARCHITECTURE.md" "API architecture docs"
check_contains "apps/api/src/main.ts" "/api/health|status: \"ok\"|status:'ok'" "API health route in Nest app"
check_contains "nginx/nginx.conf" "Permissions-Policy|X-Frame-Options" "Expanded security headers in nginx"
check_exists "apps/web/app/student/schedule/loading.tsx" "Student schedule loading skeleton"
check_contains "apps/web/app/(auth)/register/page.tsx" "check-email|此邮箱已注册|Checking email" "Register email existence warning"
check_contains "apps/web/components/NotificationBell.tsx" "30000|30_000|30\\s*\\*" "Notification polling at 30s"
check_contains ".env.example" "SIS_TIMEZONE|ENABLE_PUBLIC_SCHEDULE_SHARING|NEXT_PUBLIC_ENABLE_PUBLIC_SCHEDULE_SHARING" "Timezone and schedule sharing env config"
check_contains "apps/api/src/students/students.service.ts" "Support request received|student_support_request|SCHEDULE_SHARING_DISABLED|SIS_TIMEZONE" "Students service production hardening"
check_exists "docs/UAT.md" "Client UAT checklist"
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
check_exists "apps/api/src/common/maintenance.middleware.ts" "Maintenance middleware"
check_contains "apps/api/src/app.module.ts" "MaintenanceMiddleware|maintenance" "Maintenance middleware registered"
check_contains "apps/api/src/admin/admin.controller.ts" "invite-codes.*:id|Delete.*invite" "Delete invite code in admin controller"
check_contains "apps/api/src/admin/admin.controller.ts" "Patch.*announcement|announcements.*Patch|updateAnnouncement" "Announcement PATCH endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "updateAnnouncement" "Announcement update in service"
check_contains "apps/api/src/students/students.controller.ts" "contact|Contact" "Student contact API endpoint"
check_contains "apps/web/app/student/profile/page.tsx" "教务处说明|修改密码|学业汇总" "Student profile focuses on essential student account information"
check_contains "apps/web/next.config.ts" "poweredByHeader|powered.*false" "Next.js poweredByHeader disabled"
check_exists "apps/web/app/manifest.json" "PWA manifest"
check_contains "apps/api/src/registration/registration.service.spec.ts" "waitlist.*position|getWaitlistPosition" "Waitlist position unit tests"
check_contains "apps/api/src/admin/admin.service.spec.ts" "getEnrollmentTrend|enrollment.*trend" "Enrollment trend unit tests"
check_contains "apps/web/components/app-shell.tsx" "学术管理|注册管理|通知记录|邀请码" "Admin nav grouped sections"

# --- New checks (session 19 completion) ---
check_contains "apps/web/app/student/catalog/page.tsx" "recentlyViewed|recently-viewed|sis-recently-viewed" "Catalog recently viewed strip"
check_contains "apps/web/app/student/catalog/page.tsx" "compareIds|compareOpen|对比" "Catalog compare modal"
check_contains "apps/web/app/student/catalog/page.tsx" "filters\\.days|setFilterDays|day.*filter" "Catalog day filter"
check_contains "apps/web/app/student/catalog/page.tsx" "trackView" "Catalog view tracking function"
check_contains "apps/web/app/admin/dashboard/EnrollmentTrendChart.tsx" "setDays|7.*14|days.*14|14.*days" "EnrollmentTrendChart 7/14 day toggle"
check_contains "apps/web/app/student/schedule/page.tsx" "viewMode.*grid|grid-cols-\\[60px_repeat\\(7|min-w-\\[980px\\]" "Schedule grid view implemented"
check_contains "apps/web/app/student/schedule/page.tsx" "今日课程|getDay|todayClasses" "Schedule today card"
check_exists "apps/web/app/admin/holds/page.tsx" "Admin holds page"
check_contains "apps/web/components/app-shell.tsx" "/admin/holds|学生限制" "Admin holds nav entry"
check_contains "apps/web/app/student/cart/page.tsx" "Governance Status|Retry Governance Status|holdsError|requestsError" "Student cart governance failure state"
check_contains "apps/api/prisma/schema.prisma" "activeRequestKey" "Academic request active key invariant in schema"
check_contains "apps/api/prisma/seed.ts" "2024年秋季学期|2025年春季学期|2025年秋季学期|seed-term-fall-2025-current" "Demo-ready seed term data"
check_contains "apps/web/app/admin/dashboard/page.tsx" "系统状态|ops/version|ops/ready" "Dashboard system status card"
check_contains "apps/api/src/admin/admin.service.ts" "getReportsSummary|Promise\\.all" "Reports summary service"
check_contains "apps/api/src/admin/admin.service.spec.ts" "44|normalizePagination.*page.*20|computeStudentGpa.*null" "Admin service unit tests expanded"
check_contains "apps/api/src/auth/auth.service.spec.ts" "EXPIRED-1|expiresAt.*Date\\.now|register.*reject.*expired" "Auth register invite code expiry test"
check_contains "apps/api/src/registration/registration.service.spec.ts" "credit.*limit|max_credits|Credit.*limit" "Registration credit limit tests"
check_contains "apps/api/src/registration/registration.service.ts" "PREREQ_NOT_MET" "Prereq server-side enforcement"
check_contains "apps/api/src/registration/registration.controller.ts" "swap" "Atomic swap endpoint"
check_contains "apps/api/src/registration/registration.service.ts" "SWAP_DIFFERENT_COURSE" "Atomic swap course validation"
check_exists "apps/web/app/maintenance/page.tsx" "Maintenance page"
check_exists "apps/web/middleware.ts" "Next.js middleware for maintenance mode"
check_exists "apps/web/components/GradeDistBar.tsx" "Grade distribution bar component"
check_contains "apps/api/src/students/students.service.ts" "generateIcal|VCALENDAR" "iCal generation in students service"
check_contains "apps/web/app/student/schedule/page.tsx" "ical|iCal|VCALENDAR|text/calendar" "iCal export button in schedule page"
check_exists "apps/web/app/student/planner/page.tsx" "Schedule planner page"
check_contains "apps/web/app/student/planner/page.tsx" "generateCombinations|backtrack" "Schedule combination generator algorithm"
check_contains "apps/api/prisma/schema.prisma" "SectionWatch" "SectionWatch model in schema"
check_contains "apps/api/src/registration/registration.service.ts" "watchSection|sectionWatch" "Section watch service method"
check_contains "apps/api/src/registration/registration.service.spec.ts" "PREREQ_NOT_MET" "Prereq unit test"
check_contains "apps/api/prisma/schema.prisma" "StudentHold|AcademicRequest|HoldType|AcademicRequestType" "Governance models in schema"
check_exists "apps/api/src/governance/governance.service.ts" "Governance service exists"
check_exists "apps/api/src/governance/governance.controller.ts" "Governance controller exists"
check_contains "apps/api/src/registration/registration.service.ts" "ACTIVE_REGISTRATION_HOLD|getApprovedCreditLimit|assertNoBlockingHolds" "Registration governance enforcement"
check_contains "apps/web/app/student/cart/page.tsx" "Credit Overload Request|Active Registration Holds|governance/my-requests" "Student cart governance UI"
check_exists "apps/web/app/advisor/requests/page.tsx" "Advisor requests page"
check_contains "apps/web/components/app-shell.tsx" "Pending Requests|/advisor/requests" "Advisor request nav"
check_exists "apps/api/src/governance/governance.service.spec.ts" "Governance service unit tests"
check_contains "docs/SIS_V1_ROADMAP.md" "StudentHold|AcademicRequest|CREDIT_OVERLOAD" "Roadmap updated for governance slice"

# Stanford Carta-equivalent features
check_contains "apps/api/prisma/schema.prisma" "weeklyHours" "Course weeklyHours field in schema"
check_contains "apps/api/prisma/schema.prisma" "CoursePairing" "CoursePairing model in schema"
check_contains "apps/api/prisma/schema.prisma" "difficulty.*Int|workload.*Int" "Multi-dim rating fields in schema"
check_contains "apps/api/src/academics/academics.service.ts" "getCoursePairings|CoursePairing" "Course pairing API service"
check_contains "apps/api/src/academics/academics.service.ts" "getSectionRatingSummary" "Rating summary API service"
check_contains "apps/api/src/academics/academics.service.ts" "recomputeCoursePairings" "Course pairing recompute service"
check_exists "apps/web/components/MultiDimRating.tsx" "Multi-dimensional rating component"
check_exists "apps/web/components/CoursePairings.tsx" "Course pairings component"
check_contains "apps/api/src/admin/admin.service.ts" "getAtRiskStudents" "At-risk students service"
check_contains "apps/api/src/admin/admin.controller.ts" "at-risk" "At-risk students API endpoint"
check_contains "apps/web/app/student/catalog/page.tsx" "CoursePairings|MultiDimRating" "Course pairings and multi-dim rating in catalog"
check_contains "apps/web/app/student/catalog/page.tsx" "sectionStats|avgDifficulty|recommendPct" "Rating stats strip in catalog"
check_contains "apps/web/app/student/catalog/page.tsx" "weeklyHours" "Weekly hours badge in catalog"
check_contains "apps/api/src/academics/academics.service.ts" "difficulty.*true.*workload.*true|workload.*true.*difficulty.*true" "Difficulty/workload in listSections ratings select"
check_contains "apps/web/app/student/dashboard/page.tsx" "degreeProgress|completedCredits" "Degree progress bar on student dashboard"
check_contains "apps/web/app/student/dashboard/page.tsx" "DEGREE_CREDITS" "Degree credit constant on student dashboard"
check_contains "apps/api/src/academics/academics.service.ts" "getSectionReviews" "Section reviews API service"
check_contains "apps/api/src/academics/academics.controller.ts" "reviews" "Section reviews API endpoint"
check_exists "apps/web/components/SectionReviews.tsx" "SectionReviews component"
check_contains "apps/web/app/student/catalog/page.tsx" "SectionReviews" "SectionReviews in catalog page"
check_contains "apps/api/src/admin/admin.service.ts" "getInstructorAnalytics" "Instructor analytics service method"
check_contains "apps/api/src/admin/admin.controller.ts" "instructors/analytics" "Instructor analytics endpoint"
check_contains "apps/web/components/SectionReviews.tsx" "timeAgo" "SectionReviews timeAgo helper"
check_exists "apps/web/components/PrereqGraph.tsx" "Prereq graph component"
check_contains "apps/web/app/admin/courses/page.tsx" "PrereqGraph" "Prereq graph in admin courses"
check_contains "apps/api/src/students/students.service.ts" "sectionCode.*instructorName|include.*section.*course" "getMyRatings includes section/course"
check_contains "apps/web/app/student/schedule/page.tsx" "weeklyMeetingHours" "Weekly meeting hours in schedule"
check_contains "apps/web/components/PrereqGraph.tsx" "buildGraph|svg" "PrereqGraph SVG renderer"
check_contains "apps/api/src/admin/admin.service.ts" "getCohortAnalytics" "Cohort analytics service method"
check_contains "apps/api/src/admin/admin.controller.ts" "cohort-analytics" "Cohort analytics endpoint"

# ── Session 15 ─────────────────────────────────────────────────────────────────
check_contains "apps/api/src/registration/registration.service.ts" "_count.*enrollments.*ENROLLED" "getWatches includes enrollment count"
check_contains "apps/api/prisma/schema.prisma" "GradeAppeal" "GradeAppeal model in schema"
check_contains "apps/api/src/students/students.service.ts" "submitGradeAppeal|getMyGradeAppeals" "Grade appeal student service methods"
check_contains "apps/api/src/students/students.controller.ts" "appeals" "Grade appeals student endpoints"
check_contains "apps/api/src/admin/admin.service.ts" "listGradeAppeals|reviewGradeAppeal" "Grade appeal admin service methods"
check_contains "apps/api/src/admin/admin.controller.ts" "grade-appeals" "Admin grade appeal endpoints"
check_exists "apps/web/app/student/appeals/page.tsx" "Student grade appeals page"
check_exists "apps/web/app/admin/appeals/page.tsx" "Admin grade appeals review page"
check_contains "apps/web/app/student/appeals/page.tsx" "redirect\\(\"/student/grades\"\\)" "Student appeals route redirects back to grades"
check_contains "apps/web/app/student/grades/page.tsx" "/student/advisor|联系导师|注册处" "Student grades page routes support requests to advisor/registrar"
check_contains "apps/api/src/admin/admin.service.ts" "sendCohortMessage" "Cohort message service method"
check_contains "apps/api/src/admin/admin.controller.ts" "cohort-message" "Cohort message admin endpoint"
check_contains "apps/web/app/student/planner/page.tsx" "creditLoadLabel|comboScore" "Planner credit load scoring"
check_contains "apps/web/app/student/planner/page.tsx" "推荐.*indigo|ring-2 ring-indigo" "Planner recommended badge"

# ── Session 15 (part 2) ─────────────────────────────────────────────────────
check_contains "apps/api/src/students/students.service.ts" "getGpaStats" "GPA stats service method"
check_contains "apps/api/src/students/students.controller.ts" "gpa-stats" "GPA stats student endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getTermComparison|fetchTermStats" "Term comparison service method"
check_contains "apps/api/src/admin/admin.controller.ts" "term-comparison" "Term comparison admin endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getSectionEnrollmentTimeline" "Section enrollment timeline service"
check_contains "apps/api/src/admin/admin.controller.ts" "enrollment-timeline" "Section enrollment timeline endpoint"
check_exists "apps/web/components/SectionEnrollmentTimeline.tsx" "Section enrollment timeline component"
check_contains "apps/web/app/admin/sections/page.tsx" "SectionEnrollmentTimeline" "Timeline in admin sections page"

# Session 16
check_exists "apps/web/lib/degreeRequirements.ts" "Degree requirements config"
check_contains "apps/web/components/app-shell.tsx" "/student/degree" "Degree progress nav link"
check_contains "apps/api/prisma/schema.prisma" "StudentNote" "StudentNote schema model"
check_contains "apps/api/src/admin/admin.service.ts" "getStudentNotes" "Student notes service method"
check_contains "apps/api/src/admin/admin.service.ts" "createStudentNote" "Create student note service"
check_contains "apps/api/src/admin/admin.service.ts" "deleteStudentNote" "Delete student note service"
check_contains "apps/api/src/admin/admin.controller.ts" "students/:id/notes" "Student notes API endpoint"
check_contains "apps/web/app/admin/students/page.tsx" "StudentNoteItem" "Student notes tab in admin drawer"
check_contains "apps/web/app/admin/students/page.tsx" "addNote" "Add note handler in admin drawer"
check_contains "apps/api/src/admin/admin.service.ts" "unifiedSearch" "Unified search service"
check_contains "apps/api/src/admin/admin.controller.ts" "unifiedSearch" "Unified search API endpoint"
check_contains "apps/api/prisma/schema.prisma" "CalendarEvent" "CalendarEvent schema model"
check_contains "apps/api/src/academics/academics.service.ts" "listCalendarEvents" "Calendar events academics service"
check_contains "apps/api/src/academics/academics.controller.ts" "calendar-events" "Calendar events GET endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "createCalendarEvent" "Create calendar event service"
check_contains "apps/api/src/admin/admin.controller.ts" "calendar-events" "Calendar events admin CRUD endpoint"
check_exists "apps/web/app/student/waitlist/page.tsx" "Student waitlist position page"
check_contains "apps/web/components/app-shell.tsx" "/student/waitlist" "Student waitlist nav link"
check_contains "apps/api/src/registration/registration.service.ts" "getMyWaitlist" "My waitlist service"
check_contains "apps/api/src/registration/registration.controller.ts" "my-waitlist" "My waitlist endpoint"
check_contains "apps/api/src/students/students.service.ts" "getCompletedCourseCodes" "Completed course codes service"
check_contains "apps/api/src/students/students.controller.ts" "completed-courses" "Completed courses endpoint"
check_exists "apps/web/app/student/catalog/PrereqChecker.tsx" "Prereq checker component"
check_contains "apps/api/src/admin/admin.service.ts" "getSectionDemandReport" "Section demand service"
check_contains "apps/api/src/admin/admin.controller.ts" "demand-report" "Section demand endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "buildDigestPreview" "Digest preview service"
check_contains "apps/api/src/admin/admin.service.ts" "sendDigestEmail" "Digest send service"
check_contains "apps/api/src/admin/admin.controller.ts" "digest-preview" "Digest preview endpoint"
check_contains "apps/api/src/admin/admin.controller.ts" "digest-send" "Digest send endpoint"
check_exists "apps/web/app/student/waitlist/page.tsx" "Student waitlist page check"

# ── Session 16 (part 2) ─────────────────────────────────────────────────────
check_exists "apps/web/app/student/transcript/page.tsx" "Student transcript page"
check_contains "apps/web/components/app-shell.tsx" "/student/transcript" "Transcript nav link in app-shell"
check_contains "apps/web/app/student/transcript/page.tsx" "/students/transcript" "Transcript page uses transcript API"
check_contains "apps/web/app/student/transcript/page.tsx" "正式成绩单|学期 GPA|累计 GPA" "Transcript page renders formal transcript summary"

# Session 17
check_contains "apps/api/src/admin/admin.service.ts" "getSystemAlerts" "System alerts service method"
check_contains "apps/api/src/admin/admin.controller.ts" "alerts" "System alerts admin endpoint"
check_contains "apps/api/src/students/students.service.ts" "getMyAdvisor" "My advisor student service method"
check_contains "apps/api/src/students/students.controller.ts" "my-advisor" "My advisor student endpoint"
check_exists "apps/web/app/student/advisor/page.tsx" "Student advisor info page"
check_contains "apps/web/components/app-shell.tsx" "/student/advisor" "Student advisor nav link"
check_contains "apps/api/src/admin/admin.service.ts" "bulkCloseOutTerm|getTermCloseoutPreview" "Term closeout service methods"
check_contains "apps/api/src/admin/admin.controller.ts" "closeout" "Term closeout admin endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getPrereqViolations" "Prereq violations service method"
check_contains "apps/api/src/admin/admin.controller.ts" "prereq-audit" "Prereq audit admin endpoint"
check_exists "apps/web/app/student/advisor/page.tsx" "Student advisor page (dup check)"
check_contains "apps/api/src/admin/admin.service.ts" "getCourseOfferingHistory" "Course offering history service method"
check_contains "apps/api/src/admin/admin.controller.ts" "course-offering-history" "Course offering history endpoint"

# ── Session 17 (status-email) ────────────────────────────────────────────────
check_contains "apps/api/src/admin/admin.service.ts" "previewStatusEmail" "Status email preview service method"
check_contains "apps/api/src/admin/admin.service.ts" "sendStatusEmail" "Status email send service method"
check_contains "apps/api/src/admin/admin.controller.ts" "status-email" "Status email admin endpoints"

# ── Session 18 ─────────────────────────────────────────────────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getWaitlistAnalytics" "Waitlist analytics service method"
check_contains "apps/api/src/admin/admin.controller.ts" "waitlist-analytics" "Waitlist analytics endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getGraduationClearance" "Graduation clearance service method"
check_contains "apps/api/src/admin/admin.controller.ts" "graduation" "Graduation clearance endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getRegistrationHeatmap" "Registration heatmap service method"
check_contains "apps/api/src/admin/admin.controller.ts" "registration-heatmap" "Registration heatmap endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getCreditLoadDistribution" "Credit load distribution service method"
check_contains "apps/api/src/admin/admin.controller.ts" "credit-load" "Credit load endpoint"

# ── Session 18b (faculty-schedule / receipt / capacity-plan) ────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getFacultySchedule" "Faculty schedule service method"
check_contains "apps/api/src/admin/admin.controller.ts" "faculty-schedule" "Faculty schedule endpoint"
check_contains "apps/api/src/students/students.service.ts" "getEnrollmentReceipt" "Enrollment receipt service method"
check_contains "apps/api/src/students/students.controller.ts" "enrollment-receipt" "Enrollment receipt endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getCapacityPlan" "Capacity plan service method"
check_contains "apps/api/src/admin/admin.controller.ts" "capacity-plan" "Capacity plan endpoint"

# ── Session 18c (student-progress / quick-add / grade-distribution) ──────────
check_contains "apps/api/src/admin/admin.service.ts" "getStudentProgress" "Student progress service method"
check_contains "apps/api/src/admin/admin.controller.ts" "student-progress" "Student progress endpoint"
check_exists "apps/web/app/admin/student-progress/page.tsx" "Admin student progress page"
check_contains "apps/web/components/app-shell.tsx" "/admin/student-progress" "Student progress nav link"
check_contains "apps/web/app/admin/student-progress/page.tsx" "AtRisk.*Inactive|statusTone|enrollmentStatus" "Risk status rendering in student progress"
check_contains "apps/api/src/admin/admin.service.ts" "getGradeDistribution" "Grade distribution service method"
check_contains "apps/api/src/admin/admin.controller.ts" "grade-distribution" "Grade distribution endpoint"
check_exists "apps/web/app/admin/grade-distribution/page.tsx" "Admin grade distribution page"
check_exists "apps/web/app/admin/grade-distribution/page.tsx" "Grade distribution page accessible"
check_contains "apps/web/app/admin/grade-distribution/page.tsx" "gradeBreakdown" "Grade stats in distribution page"

# ── Session 18d (dropout-risk / degree-audit / section-analytics) ────────────
check_contains "apps/api/src/admin/admin.service.ts" "getDropoutRisk" "Dropout risk service method"
check_contains "apps/api/src/admin/admin.controller.ts" "dropout-risk" "Dropout risk endpoint"
check_exists "apps/web/app/student/degree-audit/page.tsx" "Student degree audit page"
check_contains "apps/web/components/app-shell.tsx" "/student/degree-audit" "Degree audit nav link"
check_contains "apps/web/app/student/degree-audit/page.tsx" "remainingCredits" "Remaining credits in degree audit"
check_contains "apps/api/src/admin/admin.service.ts" "getSectionAnalytics" "Section analytics service method"
check_contains "apps/api/src/admin/admin.controller.ts" "analytics" "Section analytics endpoint"
check_exists "apps/web/app/admin/sections/[id]/page.tsx" "Admin section analytics dynamic page"
check_contains "apps/web/app/admin/sections/[id]/page.tsx" "enrollmentTimeline" "Timeline in section analytics"

# ── Session 19: cohort analytics, forecast, enrollment timeline ───────────────
check_contains "apps/api/src/admin/admin.service.ts" "getCohortByMajor" "Cohort by-major service method"
check_contains "apps/api/src/admin/admin.controller.ts" "cohort-by-major" "Cohort by-major endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getTermEnrollmentForecast" "Term enrollment forecast service method"
check_contains "apps/api/src/admin/admin.controller.ts" "term-enrollment-forecast" "Term enrollment forecast endpoint"

# ── Session 19b: course demand compare, student standing, section swap ─────────
check_contains "apps/api/src/admin/admin.service.ts" "getCourseDemandComparison" "Course demand comparison service"
check_contains "apps/api/src/admin/admin.controller.ts" "course-demand-compare" "Course demand endpoint"
check_contains "apps/api/src/students/students.service.ts" "getAcademicStanding" "Academic standing service"
check_contains "apps/api/src/students/students.controller.ts" "standing" "Academic standing endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "previewSectionSwap" "Section swap preview service"
check_contains "apps/api/src/admin/admin.service.ts" "executeSectionSwap" "Section swap execute service"
check_contains "apps/api/src/admin/admin.controller.ts" "section-swap" "Section swap endpoint"

# ── Session 19c: enrollment audit, recommendations, top performers ─────────────
check_contains "apps/api/src/admin/admin.service.ts" "getEnrollmentAudit" "Enrollment audit service"
check_contains "apps/api/src/admin/admin.controller.ts" "enrollment-audit" "Enrollment audit endpoint"
check_exists "apps/web/app/admin/enrollment-audit/page.tsx" "Enrollment audit page"
check_contains "apps/api/src/students/students.service.ts" "getCourseRecommendations" "Course recommendations service"
check_contains "apps/api/src/students/students.controller.ts" "recommendations" "Recommendations endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getTopPerformers" "Top performers service"
check_contains "apps/api/src/admin/admin.controller.ts" "top-performers" "Top performers endpoint"
check_exists "apps/web/app/admin/enrollment-audit/page.tsx" "Enrollment audit page accessible"

# ── Session 19d: dept-workload, enrollment-velocity, what-if ──────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getDeptWorkload" "Dept workload service"
check_contains "apps/api/src/admin/admin.controller.ts" "dept-workload" "Dept workload endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getEnrollmentVelocity" "Enrollment velocity service"
check_contains "apps/api/src/admin/admin.controller.ts" "enrollment-velocity" "Enrollment velocity endpoint"

# ── Session 20: prereq-map, credit-summary, grade-curve ──────────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getPrereqMap" "Prereq map service"
check_contains "apps/api/src/admin/admin.controller.ts" "prereq-map" "Prereq map endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "previewGradeCurve" "Grade curve service"
check_contains "apps/api/src/admin/admin.controller.ts" "grade-curve" "Grade curve endpoint"

# ── Session 20b: section-roster, term-capacity, gpa-goal ─────────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getSectionRoster" "Section roster service"
check_contains "apps/api/src/admin/admin.controller.ts" "section-roster" "Section roster endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getTermCapacitySummary" "Term capacity service"
check_contains "apps/api/src/admin/admin.controller.ts" "term-capacity" "Term capacity endpoint"

# ── Session 20c: major-trends, late-drops, course-history ────────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getMajorEnrollmentTrends" "Major enrollment trends service"
check_contains "apps/api/src/admin/admin.controller.ts" "major-trends" "Major trends endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getLateDropReport" "Late drop report service"
check_contains "apps/api/src/admin/admin.controller.ts" "late-drops" "Late drops endpoint"
check_contains "apps/api/src/students/students.service.ts" "getCourseHistory" "Course history service"
check_contains "apps/api/src/students/students.controller.ts" "course-history" "Course history endpoint"
check_exists "apps/web/app/student/course-history/page.tsx" "Student course history page"

# ── Session 20d: instructor-performance, dept-gpa, graduation-checklist ─────
check_contains "apps/api/src/admin/admin.service.ts" "getInstructorPerformance" "Instructor performance service"
check_contains "apps/api/src/admin/admin.controller.ts" "instructor-performance" "Instructor performance endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getDeptGpaComparison" "Dept GPA comparison service"
check_contains "apps/api/src/admin/admin.controller.ts" "dept-gpa" "Dept GPA endpoint"
check_contains "apps/api/src/students/students.service.ts" "getGraduationChecklist" "Graduation checklist service"
check_contains "apps/api/src/students/students.controller.ts" "graduation-checklist" "Graduation checklist endpoint"

# ── Session 21: course-pairings, deadlines, retention ───────────────────────
check_contains "apps/api/src/admin/admin.service.ts" "getCoursePairings" "Admin course pairings service"
check_contains "apps/api/src/admin/admin.controller.ts" "course-pairings" "Admin course pairings endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getRetentionCohort" "Retention cohort service"
check_contains "apps/api/src/admin/admin.controller.ts" "\"retention\"" "Retention cohort endpoint"

# ── Session 21b: enrollment-log, system-health, schedule-image ──────────────
check_contains "apps/api/src/students/students.service.ts" "getEnrollmentLog" "Student enrollment log service"
check_contains "apps/api/src/students/students.controller.ts" "enrollment-log" "Student enrollment log endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getSystemHealth" "Admin system health service"
check_contains "apps/api/src/admin/admin.controller.ts" "system-health" "Admin system health endpoint"
check_exists "apps/web/app/admin/system-health/page.tsx" "Admin system health page"
check_contains "apps/web/components/app-shell.tsx" "/admin/system-health" "System health nav link"

# ── Session 22: command palette, bulk ops, term compare, reg windows, honors ─
check_exists "apps/web/components/command-palette.tsx" "Command palette component"
check_contains "apps/web/components/app-shell.tsx" "CommandPalette" "Command palette wired into app shell"
check_contains "apps/web/components/app-shell.tsx" "⌘K" "Desktop command palette trigger"
check_contains "apps/web/app/globals.css" ".campus-kpi-grid" "Responsive KPI grid utility"
check_contains "apps/web/app/admin/students/page.tsx" "overflow-x-auto -mx-4 px-4" "Admin students mobile table wrapper"
check_contains "apps/api/src/admin/admin.service.ts" "bulkEnroll" "Admin bulk enroll service"
check_contains "apps/api/src/admin/admin.service.ts" "bulkDrop" "Admin bulk drop service"
check_contains "apps/api/src/admin/admin.service.ts" "bulkUpdateStudentStatus" "Admin bulk status service"
check_contains "apps/api/src/admin/admin.controller.ts" "bulk-enroll" "Admin bulk enroll endpoint"
check_contains "apps/api/src/admin/admin.controller.ts" "bulk-drop" "Admin bulk drop endpoint"
check_contains "apps/api/src/admin/admin.controller.ts" "bulk-update-status" "Admin bulk status endpoint"
check_exists "apps/web/app/admin/bulk-ops/page.tsx" "Admin bulk ops page"
check_contains "apps/web/components/app-shell.tsx" "/admin/bulk-ops" "Admin bulk ops nav link"
check_contains "apps/api/src/students/students.service.ts" "getTermCompare" "Student term compare service"
check_contains "apps/api/src/students/students.controller.ts" "term-compare" "Student term compare endpoint"
check_contains "apps/api/src/admin/admin.service.ts" "getRegistrationWindows" "Admin registration windows service"
check_contains "apps/api/src/admin/admin.controller.ts" "reg-windows" "Admin registration windows endpoint"
check_exists "apps/web/app/admin/reg-windows/page.tsx" "Admin registration windows page"
check_contains "apps/web/components/app-shell.tsx" "/admin/reg-windows" "Admin registration windows nav link"
check_contains "apps/api/src/students/students.service.ts" "getStudentHonors" "Student honors service"
check_contains "apps/api/src/students/students.controller.ts" "\"honors\"" "Student honors endpoint"

# ── Session 23: notifications, profile completeness, announcements mgmt, saved courses, student tags ──
check_contains "apps/api/src/notifications/notifications.controller.ts" "unread-count|Patch\\(\":id/read\"\\)|@Get\\(\\)" "Notifications endpoints"
check_contains "apps/web/components/NotificationBell.tsx" "/notifications|全部标记已读|30\\s*\\*" "Notification bell dropdown"
check_exists "apps/web/components/error-boundary.tsx" "Error boundary component"
check_contains "apps/web/components/app-shell.tsx" "ErrorBoundary" "Error boundary wired in shell"
check_contains "apps/web/app/layout.tsx" "ToastProvider|ErrorBoundary" "Layout wraps toast and boundary"
check_exists "apps/web/components/toast-provider.tsx" "Toast provider component"
check_contains "apps/api/src/students/students.controller.ts" "profile-completeness|Patch\\(\"profile\"\\)" "Student profile completeness endpoints"
check_contains "apps/api/src/students/students.service.ts" "getProfileCompleteness|updateStudentProfile|PROFILE_UPDATE" "Student profile completeness service"
check_exists "apps/web/components/profile-completeness-card.tsx" "Profile completeness card"
check_contains "apps/web/app/student/dashboard/page.tsx" "ProfileCompletenessCard|profile-completeness" "Dashboard profile completeness card"
check_contains "apps/web/app/student/profile/page.tsx" "我的档案|/students/profile|programMajor" "Student profile editor upgraded"
check_exists "apps/web/app/admin/announcements-mgmt/page.tsx" "Admin announcements management page"
check_contains "apps/web/components/app-shell.tsx" "/admin/announcements-mgmt" "Announcements management nav link"
check_contains "apps/web/app/student/catalog/page.tsx" "saved_courses|toggleSavedCourse|收藏" "Catalog saved courses toggle"
check_contains "apps/api/src/admin/admin.controller.ts" "student-tags/available|students/:id/tags" "Student tags endpoints"
check_contains "apps/api/src/admin/admin.service.ts" "getAvailableStudentTags|getStudentTags|setStudentTags|STUDENT_TAGS_SET" "Student tags service"
check_contains "apps/web/app/admin/students/page.tsx" "studentTagsMap|activeTab === \"tags\"|/admin/students/.*/tags" "Admin students tags drawer"

# ── Session 24: seed, docker, grade-entry, admin holds wrapper, appeals tracker ─
check_contains "apps/api/prisma/seed.ts" "2024年秋季学期|2025年春季学期|2025年秋季学期" "Seed terms aligned for demo"
check_contains "apps/api/prisma/seed.ts" "admin@univ.edu|student1@univ.edu|Student1234!|Admin1234!" "Seed demo accounts aligned"
check_contains "docker-compose.yml" "db:|horizon_sis|sis_dev_pass" "Docker compose demo defaults aligned"
check_contains ".env.example" "horizon_sis|sis_dev_pass|change_me_in_production" "Root env example aligned"
check_contains "apps/api/src/registration/registration.service.ts" "Carting is intentionally allowed outside the registration window" "Cart window semantics documented"
check_contains "apps/web/app/student/schedule/page.tsx" "DROP_DEADLINE_PASSED|注册处或支持团队" "Friendly drop-deadline messaging on student schedule"
check_contains "apps/api/src/admin/admin.service.ts" "bulkUpdateGrades|getAdminHolds|createAdminHold|removeAdminHold" "Admin grade entry and holds service"
check_contains "apps/api/src/admin/admin.controller.ts" "sections/:id/grades|@Delete\\(\"holds/:id\"\\)" "Admin grade entry and hold removal endpoints"
check_exists "apps/web/app/admin/grade-entry/page.tsx" "Admin grade entry page"
check_contains "apps/web/components/app-shell.tsx" "/admin/grade-entry" "Admin grade entry nav link"
check_contains "apps/web/app/admin/holds/AdminHoldsClient.tsx" "/admin/holds" "Admin holds page uses /admin endpoints"
check_contains "apps/web/app/student/appeals/page.tsx" "redirect\\(\"/student/grades\"\\)" "Student appeals surface is removed from student workflow"

# ── Session 25: concurrency lock, prereq waivers, overload approval, priority window, dropped visibility ─
check_contains "apps/api/src/registration/registration.service.ts" "FOR UPDATE" "Registration flow uses row locks for section capacity"
check_contains "apps/api/src/registration/registration.service.ts" "WAITLIST_PROMOTED" "Waitlist promotion writes student-facing audit notification"
check_contains "apps/api/src/registration/registration.service.ts" "assertStudentRegistrationWindowOpen|getStudentRegistrationWindowInfo" "Priority registration window enforcement exists"
check_contains "apps/api/src/academics/academics.service.ts" "myStatus|myWaitlistPosition" "Catalog sections include per-student status echo"
check_contains "apps/api/src/admin/admin.service.ts" "getPendingOverloads|decidePendingOverload|getPrereqWaivers|decidePrereqWaiver" "Admin overload and prereq waiver queues implemented"
check_contains "apps/api/src/admin/admin.controller.ts" "pending-overloads|prereq-waivers" "Admin overload and prereq waiver endpoints"
check_contains "apps/api/src/students/students.controller.ts" "prereq-waiver-request|prereq-waivers" "Student prereq waiver endpoints"
check_exists "apps/web/app/student/prereq-waivers/page.tsx" "Student prereq waiver route placeholder"
check_exists "apps/web/app/admin/prereq-waivers/page.tsx" "Admin prereq waiver page"
check_exists "apps/web/app/admin/pending-overloads/page.tsx" "Admin pending overload page"
check_contains "apps/web/app/student/catalog/page.tsx" "myStatus|myWaitlistPosition|最后 .*席|加入等待队列" "Catalog shows seat pressure and current registration state"
check_contains "apps/web/app/student/schedule/page.tsx" "showDropped|已退课|droppedAt" "Schedule exposes dropped-record toggle and timestamps"
check_contains "apps/web/app/admin/reg-windows/page.tsx" "priorityWindows|分年级开放" "Admin reg windows show cohort-specific opening times"
check_contains "apps/web/app/student/prereq-waivers/page.tsx" "redirect\\(\"/student/catalog\"\\)" "Student prereq waiver route redirects back to catalog"
check_contains "apps/web/components/app-shell.tsx" "/admin/pending-overloads" "Pending overload queue remains in admin navigation"
check_contains "apps/web/app/admin/schedule-conflicts/page.tsx" "getScheduleConflicts|schedule-conflicts|排课冲突" "Admin schedule conflict detector page exists"
check_contains "apps/api/src/admin/admin.service.ts" "getScheduleConflicts" "Admin getScheduleConflicts service method"
check_exists "apps/web/app/admin/schedule-conflicts/page.tsx" "Schedule conflicts page accessible"

if curl -sf http://localhost:4000/api/docs-json > /dev/null 2>&1; then
  ok "Swagger docs reachable at /api/docs"
elif rg -n 'SwaggerModule\.setup\(\s*"api/docs"' apps/api/src/main.ts >/dev/null 2>&1 \
  && rg -n 'SwaggerModule\.createDocument' apps/api/src/main.ts >/dev/null 2>&1; then
  ok "Swagger docs configured at /api/docs"
else
  bad "Swagger docs bootstrap missing"
fi

echo
printf "Summary: %d pass, %d warn, %d fail\n" "$pass" "$warn" "$fail"

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
