# API Architecture

## Modules
- `auth` handles login, refresh rotation, password reset, email verification, account lockout, and session tracking.
- `registration` owns cart, submit, drop, waitlist position, and schedule/grade projections.
- `students` exposes student-facing profile, transcript, announcements, notifications, and recommendations.
- `admin` owns academic operations, CRUD, reporting, imports, invite codes, audit reads, and analytics.
- `notifications` centralizes mail delivery, mail health snapshots, and notification logging.
- `common` provides Prisma access, guards, response helpers, cache, logger, exception filter, and security helpers.

## Auth Flow
1. `POST /auth/login` validates credentials and lockout state.
2. Access JWT is issued into `access_token`; refresh token is stored in DB and `sis-refresh`.
3. CSRF token is issued in a readable cookie for browser clients.
4. `POST /auth/refresh` rotates refresh token and renews access cookie.
5. `POST /auth/logout` clears cookies, deletes refresh tokens, and removes tracked active sessions.

## Registration Transaction Flow
1. `precheck` and `submit` load cart, active enrollments, completed history, and section counts.
2. `buildEnrollmentPlan()` performs prerequisite, meeting conflict, capacity, approval, and credit-limit checks.
3. `submitCart()` re-runs validation inside a retryable transaction.
4. `FOR UPDATE` row locks are used on target sections to avoid concurrent seat races.
5. Enrollment writes, cart deletion, audit logs, and notification dispatch follow the transaction result.

## Drop and Waitlist Flow
1. Waitlisted entries can always be dropped.
2. Enrolled and pending approvals are blocked after `dropDeadline`.
3. Dropping an enrolled seat auto-promotes the next waitlisted student.
4. Promotion writes audit events and sends a best-effort email.

## Audit Integrity Chain
- Each audit log stores `prevIntegrityHash` and `integrityHash`.
- Hash values are generated from canonicalized audit payload plus the previous hash.
- `/admin/audit-logs/integrity` provides a quick integrity snapshot for ops/admin use.

## Webhook Lifecycle
1. Admin registers a webhook endpoint and event list.
2. Domain services emit events through `dispatch(...)`.
3. Delivery is non-blocking and in-memory for now.
4. Failed webhook calls do not break the user request path.

## Caching
- `apiCache.getOrSet()` is used for terms and heavier report/stat endpoints.
- Settings and readiness-like checks intentionally stay lightweight and direct.

## Ops Surface
- `/ops/ready`, `/ops/metrics`, `/ops/metrics/snapshot`, `/ops/version`, `/ops/db-check`
- `/health` and `/api/health` are available for simpler upstream health checks.
