# Student Portal / Registrar Ops Handoff

## Scope
This repository is ready to hand off as a student self-service plus registrar/admin academic operations portal.

Included scope:
- student login, profile, schedule, transcript, notifications, cart, planner, and catalog browsing
- registrar/admin operations for students, courses, sections, terms, enrollments, announcements, reports, imports, invite codes, and system settings
- monitoring, health endpoints, backup scripts, Docker deployment, and static readiness checks

Out of scope:
- faculty/instructor actor accounts and faculty-owned workflows
- advisor assignment, advising queues, and degree audit
- billing, tuition, bursar, financial aid, refunds
- public schedule sharing in production handoff mode

## Current Delivery Position
Treat this as a registrar/student portal, not a full institutional SIS.

The current handoff expectation is:
- student self-service workflows are available
- registrar/admin workflows are available
- support requests route to admin notification logs
- invite codes create student registrations only
- instructor names are informational text on sections, not user accounts

## Required Environment Variables
Minimum required for local/demo boot:
- `DATABASE_URL`
- `JWT_SECRET`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_CSRF_COOKIE_NAME`
- `NEXT_PUBLIC_CSRF_HEADER_NAME`

Production-critical:
- `WEB_URL`
- `CSRF_ALLOWED_ORIGINS`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `SIS_TIMEZONE`
- `ENABLE_PUBLIC_SCHEDULE_SHARING=false`
- `NEXT_PUBLIC_ENABLE_PUBLIC_SCHEDULE_SHARING=false`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`

Recommended default institution setting:
- `SIS_TIMEZONE=America/Los_Angeles`

## Deployment Steps
1. Copy env files and set production values.
2. Install dependencies: `pnpm install`
3. Generate Prisma client: `pnpm db:generate`
4. Apply schema changes: `pnpm db:migrate`
5. Seed demo data only if needed: `pnpm db:seed`
6. Build and validate:
   - `pnpm --filter web exec tsc --noEmit`
   - `pnpm --filter @sis/api build`
   - `pnpm test:api`
   - `pnpm readiness:check`
7. Start stack:
   - local dev: `pnpm dev`
   - Docker: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
8. Run smoke/UAT before handoff.

## Demo / Seed Credentials
- Admin: `admin@sis.edu / Admin@2026!`
- Student: `student1@sis.edu` or `S2601` / `Student@2026!`
- Seeded student invite codes: `OPEN-2026`, `LIMIT10-2026`

## Operational Limitations
- `/admin/sessions` is operational-only session tracking backed by in-memory state. It resets on API restart.
- `/student/contact` is a registrar/support request logger, not a helpdesk ticket queue.
- Public schedule sharing is disabled by default and should remain disabled unless expiry/revocation/privacy controls are added.
- If SMTP is not configured, email-dependent workflows are not institution-ready.
- Instructor names are free-text informational fields on sections.

## Go-Live Caveats
- Change all seeded/demo passwords before any non-demo rollout.
- Replace seeded invite codes or disable them before external access.
- Do not enable public schedule sharing without a privacy decision and additional controls.
- Validate the institution timezone before using iCal export in UAT.
- Treat reports as registrar operational reporting, not institution-wide SIS compliance reporting.

## Verification Commands
Run before client handoff:
```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter @sis/api build
pnpm test:api
pnpm readiness:check
pnpm test:e2e
pnpm test:e2e:web
```

## UAT Reference
Use [docs/UAT.md](/Users/yihengli/Desktop/TA/访达/地平线/docs/UAT.md) as the acceptance checklist for student and registrar/admin scenarios.

## Known Risks
- No faculty/advisor domain exists.
- No finance domain exists.
- Some analytics/report wording is registrar-focused, not institution-wide SIS terminology.
- Admin session tracking is not durable across process restarts.
- Support requests are routed to admin logs rather than a dedicated ticket system.
