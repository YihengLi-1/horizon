# University Student Portal / Registrar Ops Monorepo

Student self-service and registrar/admin academic operations portal built as a pnpm monorepo with a Next.js 15 frontend, NestJS API, Prisma, and PostgreSQL.

## Scope Statement

This repository is not a full institutional SIS. It currently covers:
- student self-service registration, schedule, grades, and profile workflows
- registrar/admin operations for courses, sections, terms, enrollments, reports, and imports
- minimal faculty-owned section roster and grade submission
- minimal advisor-owned advisee and credit overload review workflow

It does not currently implement:
- billing, tuition, bursar, or financial-aid operations
- public schedule sharing by default in production handoff mode
- multi-step approval chains beyond credit overload
- program, degree, and graduation audit domains

## Stack
- `apps/web`: Next.js App Router + TypeScript + Tailwind + shadcn-style UI components
- `apps/api`: NestJS + Prisma + PostgreSQL + Zod validation
- `packages/shared`: shared Zod schemas/types

## Quick Start

1. Install deps
```bash
pnpm install
```

2. Start PostgreSQL
```bash
docker compose up -d
```

3. Configure env
```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- Set `SIS_TIMEZONE` to the institution timezone used for academic calendar and iCal export.
- Keep `ENABLE_PUBLIC_SCHEDULE_SHARING=false` and `NEXT_PUBLIC_ENABLE_PUBLIC_SCHEDULE_SHARING=false` unless you have added expiry/revocation controls and approved the privacy risk.

4. Create local development schema + seed
```bash
pnpm db:migrate:dev
pnpm db:seed
```

5. Run apps
```bash
pnpm dev
```

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000](http://localhost:4000)

## Seed Accounts
- Admin: `admin@sis.edu / Admin@2026!`
- Student 1: `student1@sis.edu` or `S2601` / `Student@2026!`
- Student 2: seed file contains additional sample student records; check [seed.ts](/Users/yihengli/Desktop/TA/访达/地平线/apps/api/prisma/seed.ts) before client demos
- Faculty: `faculty1@sis.edu / Faculty@2026!`
- Advisor: `advisor1@sis.edu / Advisor@2026!`
- Student invite codes seeded for demos: `OPEN-2026`, `LIMIT10-2026`
- Governance/UAT term: `Fall 2026` has future sections and an open registration window for hold and overload validation

## Monorepo Scripts
- `pnpm dev` - run API + Web
- `pnpm db:migrate:dev` - development-only Prisma migration workflow (`prisma migrate dev`)
- `pnpm db:migrate:deploy` - apply committed migrations in staging/production/handoff environments (`prisma migrate deploy`)
- `pnpm db:seed` - seed sample data
- `pnpm db:generate` - generate Prisma client
- `pnpm readiness:check` - static production-readiness checks
- `pnpm test:api` - API unit tests
- `pnpm smoke:web` - route-level smoke check using seeded accounts
- `pnpm test:e2e:web` - critical UI E2E checks (student + admin flows, runtime error guard)
- `pnpm test:e2e:api` - P0 API regression checks (registration rules, waitlist promote, drop deadline, CSV fail-fast)

## Monitoring
- Grafana: [http://localhost:3100](http://localhost:3100)
- Prometheus: [http://localhost:9090](http://localhost:9090)
- Alertmanager: [http://localhost:9093](http://localhost:9093)

## API Documentation
- See [apps/api/ROUTES.md](apps/api/ROUTES.md)
- See [docs/UAT.md](/Users/yihengli/Desktop/TA/访达/地平线/docs/UAT.md) for client acceptance scenarios.
- See [docs/SIS_V1_ROADMAP.md](/Users/yihengli/Desktop/TA/访达/地平线/docs/SIS_V1_ROADMAP.md) for the staged evolution plan toward a formal university-grade SIS.

## Known Limitations
- Invite codes create student registrations only. Admin role assignment is a separate admin action.
- Faculty and advisor flows are real but narrow. Faculty can only manage owned section rosters and grades; advisors can only review assigned students and overload requests.
- Student support requests are routed to admin notification logs. There is no separate helpdesk/ticketing subsystem yet.
- Public schedule sharing is disabled by default for privacy reasons.
- Admin session tracking is operational only and resets when the API process restarts.
- Governance demos should use `Fall 2026`; seeded Spring 2026 sections are already in progress.

## Migration Safety
- `pnpm db:migrate:dev` is for local schema development only.
- `pnpm db:migrate:deploy` is the only repo-level migration command that should be used for staging, production, Docker handoff environments, and delivery rehearsal.
- Do not use `prisma migrate dev` during deployment or handoff validation.

## Project Tree (key)
```text
.
├── apps
│   ├── api
│   │   ├── prisma
│   │   │   ├── migrations/20260301000000_init/migration.sql
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src
│   │   │   ├── admin/
│   │   │   ├── academics/
│   │   │   ├── auth/
│   │   │   ├── audit/
│   │   │   ├── common/
│   │   │   ├── registration/
│   │   │   ├── students/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── ROUTES.md
│   └── web
│       ├── app
│       │   ├── (auth)/
│       │   ├── admin/
│       │   └── student/
│       ├── components/ui/
│       └── lib/
├── packages
│   └── shared/src/schemas.ts
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```
