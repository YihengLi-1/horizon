# University SIS MVP Monorepo

Minimal full-stack SIS + registration MVP for 10k users.

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

4. Migrate + seed
```bash
pnpm db:migrate
pnpm db:seed
```

5. Run apps
```bash
pnpm dev
```

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000](http://localhost:4000)

## Seed Accounts
- Admin: `admin@university.edu / Admin123!`
- Student 1: `alice@student.edu` or `S1001` / `Student123!`
- Student 2: `brian@student.edu` or `S1002` / `Student123!`
- Invite code: `INVITE-2026`

## Monorepo Scripts
- `pnpm dev` - run API + Web
- `pnpm db:migrate` - run Prisma migration
- `pnpm db:seed` - seed sample data
- `pnpm db:generate` - generate Prisma client
- `pnpm smoke:web` - route-level smoke check using seeded accounts
- `pnpm test:e2e:web` - critical UI E2E checks (student + admin flows, runtime error guard)
- `pnpm test:e2e:api` - P0 API regression checks (registration rules, waitlist promote, drop deadline, CSV fail-fast)

## API Documentation
- See [apps/api/ROUTES.md](apps/api/ROUTES.md)

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
