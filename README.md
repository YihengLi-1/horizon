# Horizon Student Information System

Horizon is a production-oriented student information system for academic operations and student self-service. It models the workflows behind registration, waitlists, prerequisites, grades, terms, appeals, notifications, and administrative controls—not just the screens around them.

> 中文说明：[README.zh-CN.md](README.zh-CN.md)

## Why this project

Student systems combine policy, state, concurrency, security, and many user roles. Horizon is an engineering exercise in translating those real operational constraints into explicit data models, API behavior, validation, and observable workflows.

## Highlights

- **Concurrency-safe enrollment:** PostgreSQL `SELECT FOR UPDATE` prevents seat oversubscription during simultaneous registration.
- **Workflow modeling:** prerequisite checks, waitlist promotion, registration windows, holds, grade locks, appeals, and term-state transitions.
- **Multi-role access:** student, faculty, advisor, and administrator experiences with role-based controls.
- **Operational readiness:** Docker environments, health endpoints, request IDs, Prometheus/Grafana monitoring, alerts, and backup-restore drills.
- **Verification:** API smoke tests, Playwright critical-flow tests, unit tests, CI type/build checks, and a 457-check static readiness suite.
- **Documentation:** OpenAPI/Swagger, schema documentation, UAT guidance, disaster-recovery notes, and operating procedures.

## Architecture

| Layer | Technologies |
|---|---|
| Web | Next.js 15, TypeScript |
| API | NestJS, TypeScript, OpenAPI |
| Data | PostgreSQL, Prisma |
| Shared validation | Zod in a pnpm monorepo |
| Security | JWT/cookies, CSRF origin guard, throttling, RBAC, audit logs |
| Operations | Docker Compose, Nginx, Prometheus, Grafana, Alertmanager |
| Testing | Node API E2E, Playwright browser E2E, unit tests, readiness checks |

## Core workflows

- Course catalog → cart → preflight checks → registration
- Full section → ordered waitlist → automatic promotion and notification
- Prerequisite validation → waiver request and review
- Faculty grade entry → completion locks → transcript and GPA views
- Academic term state machine from upcoming through close
- Administrative batch operations, reporting, audit review, and notification logs

## Reliability and safety

- Row-level enrollment locking and database constraints protect capacity and state.
- Shared schemas reduce drift between the web application, API, and database.
- API throttling, CSRF checks, input validation, sanitization, and soft deletion limit common failure modes.
- Health and readiness endpoints, metrics, alerts, and structured operational checks support diagnosis.
- Backup tooling creates a PostgreSQL dump, restores it to an isolated drill database, validates the result, and cleans up.
- E2E coverage exercises both API workflows and critical student/admin browser paths.

## Quick start

### Requirements

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+, or Docker

```bash
pnpm install
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
pnpm --filter @sis/api exec prisma migrate deploy
pnpm --filter @sis/api exec prisma db seed
```

Start the API and web application in separate terminals:

```bash
pnpm --filter @sis/api run dev
pnpm --filter web run dev
```

Then open:

- Web: [http://localhost:3000](http://localhost:3000)
- API documentation: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

### Docker

```bash
docker compose up -d
docker compose exec api pnpm --filter @sis/api exec prisma db seed
```

## Verification

```bash
bash scripts/readiness-check.sh
pnpm test:e2e:api
pnpm test:e2e:web
```

The readiness script's documented expected result is `457 pass, 0 warn, 0 fail`. The repository also includes load-test and backup-restore drill scripts; run them against an isolated local environment.

## Repository map

```text
apps/api/       NestJS API and Prisma schema
apps/web/       Next.js application
packages/shared Shared schemas and constants
monitoring/     Prometheus, Grafana, and Alertmanager configuration
scripts/        E2E, readiness, smoke, load, backup, and recovery tooling
docs/           API, schema, UAT, SOP, and disaster-recovery documentation
```

