# Horizon Student Information System

Horizon is a production-oriented student information system for academic operations and student self-service. It models the workflows behind registration, waitlists, prerequisites, grades, terms, appeals, notifications, and administrative controls—not just the screens around them.

[CI and unit tests](https://github.com/YihengLi-1/horizon/actions/workflows/ci.yml) · [Registration logic](apps/api/src/registration/registration.service.ts) · [Unit-test scenarios](apps/api/src/registration/registration.service.spec.ts)

Horizon is an engineering project modeling academic workflows, not an official ASU system. The repository demonstrates implementation and test coverage; it does not claim institution-wide adoption.

> 中文说明：[README.zh-CN.md](README.zh-CN.md)

## Why this project

Student systems combine policy, state, concurrency, security, and many user roles. Horizon is an engineering exercise in translating those real operational constraints into explicit data models, API behavior, validation, and observable workflows.

## Highlights

- **Concurrency-safe enrollment:** PostgreSQL `SELECT FOR UPDATE` prevents seat oversubscription during simultaneous registration.
- **Workflow modeling:** prerequisite checks, waitlist promotion, registration windows, holds, grade locks, appeals, and term-state transitions.
- **Multi-role access:** student, faculty, advisor, and administrator experiences with role-based controls.
- **Operational readiness:** Docker environments, health endpoints, request IDs, Prometheus/Grafana monitoring, alerts, and backup-restore drills.
- **Verification:** API smoke tests, Playwright critical-flow tests, API unit tests enforced in CI, type/build checks, and a separate static readiness checklist.
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
- pnpm 10.8.0 (the version declared in `package.json`)
- PostgreSQL 15+, or Docker

```bash
pnpm install --frozen-lockfile
cp .env.example .env
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Optional: use the repository's local PostgreSQL and Redis services.
docker compose up -d db redis
pnpm --filter @sis/shared build
pnpm --filter @sis/api exec prisma generate
pnpm --filter @sis/api exec prisma migrate deploy
pnpm --filter @sis/api exec prisma db seed
```

The root template's database URL matches the Compose defaults. If using an existing local PostgreSQL instance, update `DATABASE_URL` in `apps/api/.env` first. Configure a local `JWT_SECRET`; the example values are development placeholders. Seeding creates demonstration records, so use a dedicated development database.

Start the API and web application in separate terminals:

```bash
pnpm --filter @sis/api run dev
pnpm --filter @sis/web run dev
```

Then open:

- Web: [http://localhost:3000](http://localhost:3000)
- API documentation: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

### Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api pnpm --filter @sis/api exec prisma db seed
```

## Verification

The unit suite uses mocked dependencies and does not require a running database:

```bash
pnpm --filter @sis/shared build
pnpm --filter @sis/api exec prisma generate
pnpm test:api
```

CI runs these unit tests as a required step, followed by web type checks and the API build. Test failures fail the job. The static readiness checklist is explicitly advisory: it checks files, configuration, and expected patterns rather than exercising application behavior.

For integration testing, start the local services and seed the development database first:

```bash
pnpm test:e2e:api
pnpm --filter @sis/web exec playwright install chromium
pnpm test:e2e:web
```

API and browser E2E scripts are available for local use; they are not currently part of CI. Read each script's environment requirements before running it. Load tests and backup-restore drills also require isolated local services.

```bash
bash scripts/readiness-check.sh
```

A passing build or static checklist is not a production certification. The most useful evidence is the specific behavior exercised by a test and the outcome of its latest run.

## Repository map

```text
apps/api/       NestJS API and Prisma schema
apps/web/       Next.js application
packages/shared Shared schemas and constants
monitoring/     Prometheus, Grafana, and Alertmanager configuration
scripts/        E2E, readiness, smoke, load, backup, and recovery tooling
docs/           API, schema, UAT, SOP, and disaster-recovery documentation
```

