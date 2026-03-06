# GPT Handoff Report — University SIS "地平线"
**Date:** 2026-03-06 | **Gate:** 170 pass, 0 warn, 0 fail | **Tests:** 44 (all passing)

---

## Project Layout

```
/地平线
├── apps/api          NestJS 10, port 4000
├── apps/web          Next.js 15 App Router, port 3000
├── packages/shared   Shared types
├── apps/api/prisma   PostgreSQL + Prisma ORM (schema.prisma 299 lines)
├── monitoring/       Prometheus + Grafana + Alertmanager configs
├── nginx/            Reverse proxy config
├── scripts/          readiness-check.sh, e2e-api-p0.mjs, backup scripts
└── docs/             API.md, SCHEMA.md, ARCHITECTURE.md
```

### Run Commands
```bash
pnpm install
pnpm --filter @sis/api dev          # API on :4000
pnpm --filter web dev               # Web on :3000
bash scripts/readiness-check.sh     # 170-check gate
pnpm test:api                        # 44 unit tests
pnpm --filter web exec tsc --noEmit  # TS check (must produce no output)
pnpm --filter @sis/api build         # API build check
```

---

## Current State — Fully Implemented

### Auth & Security
- JWT (2h) + RefreshToken (30d rotation) via httpOnly cookies
- CSRF cookie `sis-csrf` / header `x-csrf-token`
- Login lockout (8 attempts → `lockedUntil` set)
- Password change invalidates ALL refresh tokens
- Email verification on registration; forgot password with cooldown
- Check-email-exists endpoint (`/auth/check-email`)
- Rate limiting: `THROTTLE_TTL` / `THROTTLE_LIMIT` env vars
- Helmet + CSP, AllExceptionsFilter, X-Request-ID header, ValidationPipe (whitelist)
- `sanitizeHtml()` util (`apps/api/src/common/sanitize.ts`)

### Database Models (Prisma)
User, StudentProfile, InviteCode, EmailVerificationToken, RefreshToken, Term, Course, Section, MeetingTime, Enrollment, Waitlist, CartItem, AuditLog, Notification, NotificationLog, CourseRating, Announcement, SystemSetting, WebhookRegistration

Key indexes: `(studentId, status)` on Enrollment, soft-delete `deletedAt` on User/Section/Course, `FOR UPDATE` locking in enroll path.

### Admin Pages (15 routes under `/admin/`)
| Route | Key Features |
|---|---|
| `/admin/dashboard` | KPIs, 7/14-day enrollment trend chart, donut chart, ops health, QuickSearch, audit action counts, deployment info, RefreshButton |
| `/admin/students` | Paginated, inline edit + savingId spinner, GPA leaderboard, mobile card view, detail drawer (grades tab), role management |
| `/admin/courses` | Dept filter, add form, inline edit, prereq dependency chain display |
| `/admin/sections` | Add form, double-click capacity edit, conflict detector, clone, bulk notify, rating avg |
| `/admin/sections/[id]/roster` | Roster list + CSV export |
| `/admin/enrollments` | Paginated, status filter, force drop, bulk approve PENDING, CSV export, mobile card view |
| `/admin/waitlist` | Section filter, manual promote |
| `/admin/terms` | KPI row, registration open/close toggle, delete guard |
| `/admin/reports` | Enrollment stats, utilization, top sections, dept breakdown, GPA distribution, data quality card (noGpa/noInstructor/noGradeCompleted), AllTranscripts CSV, print styles + PrintButton |
| `/admin/import` | Students CSV import (template download + row errors) + Grades import tabs |
| `/admin/announcements` | Full CRUD, badge count in sidebar |
| `/admin/notifications` | NotificationLog viewer |
| `/admin/invite-codes` | Bulk generate, copy, delete |
| `/admin/sessions` | In-memory session list + revoke |
| `/admin/settings` | Read-only env display + SystemSettingsEditor (maintenance_mode) |

### Student Pages (15 routes under `/student/`)
| Route | Key Features |
|---|---|
| `/student/dashboard` | QuickCoursesPanel, RecommendedCourses (dept-based), getNextAction smart card |
| `/student/catalog` | Filters (dept/modality/credits/days pills), search (debounced 300ms, "/" focus shortcut), sort, compare modal (up to 3 sections side-by-side), recently viewed strip (sessionStorage, scrolls on click), capacity alert toggle (localStorage), BookmarkButton, prereq tags, seat indicators |
| `/student/cart` | Waitlist position shown, cart conflict detection |
| `/student/schedule` | List view + 7-day grid view (CSS grid), iCal export, share button (btoa), print |
| `/student/grades` | Semester + cumulative GPA breakdown table, GpaTrendChart SVG, drop deadline warning, transcript CSV export |
| `/student/history` | Enrollment history timeline, per-term download |
| `/student/bookmarks` | BookmarkButton (localStorage), bookmarks list page |
| `/student/announcements` | Public announcements |
| `/student/notifications` | Notification history |
| `/student/profile` | Gradient avatar, enrollment summary, goal field, privacy settings |
| `/student/contact` | Contact advisor form |
| `/student/help` | FAQ page |

### Key API Endpoints (NestJS)
```
Admin:
  GET  /admin/stats/enrollment-trend?days=7|14
  GET  /admin/stats/dept-breakdown
  GET  /admin/stats/top-sections
  GET  /admin/stats/gpa-distribution
  GET  /admin/stats/registration
  GET  /admin/reports/summary
  GET  /admin/data-quality
  POST /admin/import/students|courses|sections
  POST /admin/sections/:id/clone
  POST /admin/sections/:id/notify
  POST /admin/enrollments/bulk-approve
  GET/DELETE /auth/sessions
  GET  /admin/notification-log
  GET/POST/PATCH/DELETE /admin/announcements
  GET/POST/DELETE /admin/invite-codes
  POST /admin/invite-codes/bulk
  PATCH /admin/users/:id/role
  PATCH /admin/sections/:id
  PATCH /admin/courses/:id

Students:
  GET  /students/recommended  (dept-based, cached)
  GET  /students/announcements/public
  GET  /registration/grades  (with semesterGpa)
  GET  /students/notifications
  POST /students/contact
```

### Infrastructure & Ops
- Docker Compose: web + api + postgres + postgres-backup + prometheus + grafana + alertmanager + nginx
- `docker-compose.prod.yml` production overlay
- Nginx: security headers (CSP, X-Content-Type, Permissions-Policy, X-Frame-Options), static caching, auth rate limiting
- Prometheus metrics at `/ops/metrics/prometheus`
- Alert rules: HighErrorRate, SlowResponse, HighMailFailureRate
- `/ops/ready`, `/ops/version`, `/ops/metrics`, `/ops/db-check` health endpoints
- Postgres backup sidecar + `backup-restore-drill.sh`
- API compression (threshold 1024 bytes)
- TtlCache (30s in-memory) on terms and recommended sections
- StructuredLogger (request IP + UA + response time)
- Swagger/OpenAPI at `/api/docs`
- GitHub Actions CI (`ci.yml`)
- PWA `manifest.json`
- SessionExpiryBanner (≤10 min warning)
- StudentMobileNav.tsx (bottom bar)
- CommandPalette (Cmd+K, 16 commands, fuzzy search)
- ToastProvider + useToast hook
- Error boundaries: error.tsx × 4 (global/admin/student/auth)
- SkipLink accessibility component
- Dark mode support (campus-* design system)

### Testing
- **44 unit tests (3 suites):**
  - `registration.service.spec.ts` (13) — enroll, waitlist, drop, credit limit, concurrency, waitlist position
  - `auth.service.spec.ts` (16) — lockout, register, refresh, password change, invite code expiry, nonexistent user
  - `admin.service.spec.ts` (15) — GPA computation (A/B/C/F/null/W), pagination, trend, top sections, sanitize
- E2E smoke: `scripts/e2e-api-p0.mjs` (24 steps, ANSI colored output)
- Docker smoke: `scripts/smoke-docker.sh`
- Readiness gate: `scripts/readiness-check.sh` (170 checks, uses `grep -E` NOT `rg`)

---

## What GPT Should Work On Next

### Priority A — UX Polish

**A1. Catalog recently-viewed scroll offset (easy)**
- File: `apps/web/app/student/catalog/page.tsx`
- Problem: Fixed compare bar at bottom can overlap the section the recently-viewed anchor scrolls to.
- Fix: Add `style={{ scrollMarginTop: "80px" }}` to the `<article>` element at line ~1007.

**A2. Reports page — term filter dropdown (medium)**
- File: `apps/web/app/admin/reports/page.tsx`
- Add `searchParams: Promise<{ termId?: string }>` to page props (Next.js 15 async pattern).
- Fetch terms from `/academics/terms`. Add a `<select>` in the hero bar.
- Pass `?termId={termId}` to `fetchAllEnrollments()` and the stats endpoints.
- The page is already `force-dynamic`.

**A3. Admin sections page — meeting time editor (medium)**
- File: `apps/web/app/admin/sections/page.tsx`
- Add a modal/drawer to edit section meeting times: weekday select (Mon–Sat) + start/end time inputs (converted to minutes).
- Call `PATCH /admin/sections/:id` with `{ meetingTimes: [...] }`. `UpdateSectionDto` already accepts this.

**A4. Student grades — semester trend arrows (easy)**
- File: `apps/web/app/student/grades/page.tsx`
- In the semester GPA breakdown table, show ↑ ↓ → arrow for each semester vs previous.
- Implementation: sort terms by `startDate`, compare current GPA with previous.

**A5. Student schedule — iCal filename with term (easy)**
- File: `apps/web/app/student/schedule/page.tsx`
- Find where the `.ics` blob is downloaded. Change `filename` from `schedule.ics` to `schedule-${termName.replace(/\s+/g, "-")}.ics`.

### Priority B — Backend Hardening

**B1. Prerequisite server-side enforcement (important)**
- File: `apps/api/src/registration/registration.service.ts`
- In the `enroll()` transaction, after checking capacity and credit limit, fetch the section's course prerequisites.
- Check if student has COMPLETED enrollment for each prerequisite courseId.
- Throw `BadRequestException("PREREQ_NOT_MET")` with a list of missing codes if any are unmet.
- Add test in `registration.service.spec.ts`.

**B2. Webhook retry logic (medium)**
- File: `apps/api/src/webhooks/webhook.ts`
- Wrap the fetch call in a retry loop: max 3 attempts, delays 1000ms / 2000ms / 4000ms.
- On final failure, call `prisma.auditLog.create({ action: "WEBHOOK_FAILURE", ... })`.

**B3. Admin import sections — CSV template (easy)**
- File: `apps/web/app/admin/import/page.tsx`
- Already has student import template. Add a "Download Template" button for sections tab.
- Template columns: `courseCode,sectionCode,instructorName,capacity,modality,location`.

**B4. Maintenance mode web redirect (medium)**
- File: `apps/web/middleware.ts` (create or edit existing)
- On any student/admin route response with `X-Maintenance: true` header, redirect to `/maintenance`.
- Create `apps/web/app/maintenance/page.tsx` with a friendly 503-style UI.

### Priority C — Observability

**C1. Admin dashboard auto-refresh toggle (easy)**
- File: `apps/web/app/admin/dashboard/page.tsx`
- Add a toggle button near RefreshButton: "Auto-refresh: ON/OFF" with 60s interval.
- Use `setInterval` in a `useEffect` with cleanup. Show a countdown badge (e.g. "30s").
- This is a Server Component page — the toggle needs to be in a separate `"use client"` component.

**C2. Grafana dashboard JSON provisioning (medium)**
- Create `monitoring/grafana/provisioning/dashboards/dashboards.yml`:
  ```yaml
  apiVersion: 1
  providers:
    - name: default
      folder: SIS
      type: file
      options:
        path: /etc/grafana/dashboards
  ```
- Create `monitoring/grafana/dashboards/sis-overview.json` with panels for:
  - HTTP request rate (from `http_requests_total`)
  - Error rate (`rate(http_requests_total{status=~"5.."}[5m])`)
  - Process uptime (from `process_uptime_seconds`)

**C3. Alertmanager Slack routing (easy)**
- File: `monitoring/alertmanager.yml`
- Add a Slack receiver using `SLACK_WEBHOOK_URL` env var (passed via docker-compose env).
- Route `HighErrorRate` to Slack; route all others to email (existing).

### Priority D — Testing Expansion

**D1. Students service spec (new file)**
- Create `apps/api/src/students/students.service.spec.ts`
- Tests:
  - `getRecommendedSections` returns sections matching student's dept prefix
  - `getPublicAnnouncements` returns only active non-expired announcements
  - semesterGpa calculation groups by termId correctly

**D2. Notifications service spec (new file)**
- Create `apps/api/src/notifications/notifications.service.spec.ts`
- Tests:
  - `sendGradePostedEmail` calls nodemailer transporter with correct subject containing grade
  - `getHealthSnapshot` returns `{ sent, failed, failRate }` with correct numbers

**D3. E2E smoke test — expand to 30 steps**
- File: `scripts/e2e-api-p0.mjs`
- Add 6 more steps: waitlist auto-promotion flow, forgot-password flow, admin bulk-approve, announcements CRUD, invite-code generate + use.
- Update readiness check: change `Step 24|24.*passed|24/24` pattern to `Step 30|30.*passed|30/30`.

### Priority E — Accessibility

**E1. Compare modal — focus trap + Escape key**
- File: `apps/web/app/student/catalog/page.tsx`
- The compare modal (line ~1313) lacks focus trap. On open, move focus to the modal. Tab should cycle within. Escape should close.
- Simplest approach: add `onKeyDown={(e) => e.key === "Escape" && setCompareOpen(false)}` to the backdrop div, and `autoFocus` on the close button.

**E2. Admin table column sort aria**
- Files: `apps/web/app/admin/students/page.tsx`, `apps/web/app/admin/enrollments/page.tsx`
- Add `aria-sort="ascending"|"descending"|"none"` to sortable `<th>` elements.
- Add ↑ ↓ icons next to the active sort column label.

**E3. Student mobile nav — active route highlight**
- File: `apps/web/components/StudentMobileNav.tsx`
- Use `usePathname()` from `next/navigation`.
- Apply `text-blue-600` + a bottom dot indicator to the matching nav tab.

---

## Environment Variables (.env)

```bash
DATABASE_URL=postgresql://sis:sis@localhost:5432/sis
JWT_SECRET=<long-random-string>
CSRF_COOKIE_NAME=sis-csrf
CSRF_HEADER_NAME=x-csrf-token
NEXT_PUBLIC_CSRF_COOKIE_NAME=sis-csrf
NEXT_PUBLIC_CSRF_HEADER_NAME=x-csrf-token
NEXT_PUBLIC_API_URL=http://localhost:4000
MAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@sis.edu
SMTP_PASS=<smtp-password>
MAIL_FROM=noreply@sis.edu
CORS_ORIGINS=http://localhost:3000
SESSION_SECRET=<long-random-string>
GRAFANA_URL=http://grafana:3001
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

---

## Key Files Map

| File | Purpose |
|---|---|
| `apps/api/src/app.module.ts` | Root module, middleware, throttler |
| `apps/api/src/main.ts` | Bootstrap, CSRF guard, ops endpoints |
| `apps/api/src/admin/admin.controller.ts` | All admin REST endpoints |
| `apps/api/src/admin/admin.service.ts` | Admin business logic (~3142 lines) |
| `apps/api/src/registration/registration.service.ts` | Enroll/drop/waitlist/cart/FOR UPDATE |
| `apps/api/src/auth/auth.service.ts` | JWT, refresh, lockout |
| `apps/api/src/notifications/notifications.service.ts` | SMTP + NotificationLog |
| `apps/api/prisma/schema.prisma` | DB schema |
| `apps/api/prisma/seed.ts` | Demo data seeder |
| `apps/web/lib/api.ts` | Client-side fetch with CSRF |
| `apps/web/lib/server-api.ts` | Server-side fetch (RSC) |
| `apps/web/components/app-shell.tsx` | Admin layout + nav groups |
| `apps/web/app/student/catalog/page.tsx` | Catalog (~1400 lines) |
| `apps/web/app/admin/dashboard/page.tsx` | Admin dashboard |
| `apps/web/app/admin/reports/page.tsx` | Reports |
| `scripts/readiness-check.sh` | 170-check gate (uses `grep -E`, NOT `rg`) |
| `scripts/e2e-api-p0.mjs` | 24-step E2E smoke |
| `monitoring/alerts.yml` | Prometheus alert rules |
| `nginx/nginx.conf` | Nginx reverse proxy config |
| `docker-compose.yml` | Full dev stack |
| `docker-compose.prod.yml` | Production overlay |

---

## Known Gotchas

1. **`rg` is aliased on this machine** to Claude's binary in interactive zsh only.
   Scripts MUST use `grep -E` / `grep -rE` — never `rg`. The readiness check already does this.

2. **Pagination pattern**: `GET /admin/enrollments` returns `{ data, total, page, pageSize }`.
   The reports page uses `fetchAllEnrollments()` which pages automatically. Keep this pattern.

3. **Campus design system**: Always use `campus-page`, `campus-hero`, `campus-card`, `campus-kpi`, `campus-toolbar`, `campus-chip`, `campus-input`, `campus-select`, `campus-eyebrow`. Do NOT replace with raw Tailwind.

4. **Meeting times**: `{ weekday: 0–6 (0=Sun), startMinutes: 0–1439, endMinutes: 1–1440 }`.
   Use `minutesToTime(min)` and `timeToMinutes(hhmm)` helpers (in shared or inline).

5. **Server components**: Add `export const dynamic = "force-dynamic"` to any page needing fresh data.

6. **Next.js 15 searchParams**: Use `searchParams: Promise<{...}>` pattern (async, awaited in component body).

7. **Test isolation**: `jest.clearAllMocks()` in `beforeEach`. `activeSessions.clear()` in auth tests.

---

## Gate Verification (run all before claiming done)

```bash
pnpm --filter web exec tsc --noEmit       # No output = clean
pnpm --filter @sis/api build               # No errors
pnpm test:api                               # 44+ passed, 0 failed
bash scripts/readiness-check.sh            # 170+ pass, 0 warn, 0 fail
```
