# ── Stage 1: install all workspace deps ──────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json         ./apps/api/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build + deploy bundle ───────────────────────────────────────────
FROM deps AS builder
COPY tsconfig.base.json  ./
COPY packages/shared/    ./packages/shared/
COPY apps/api/           ./apps/api/

# Generate Prisma client and compile TypeScript
RUN pnpm --filter @sis/api exec prisma generate
RUN pnpm --filter @sis/api build

# pnpm deploy creates a self-contained, flat (non-symlinked) node_modules
# prisma is now a prod dep so it is included in --prod
RUN pnpm deploy --filter @sis/api --prod --legacy /deploy

# Copy compiled dist + prisma schema into the deploy directory
RUN cp -r apps/api/dist /deploy/dist
RUN cp -r apps/api/prisma /deploy/prisma

# Sanity checks
RUN test -f /deploy/dist/src/main.js       || (echo "❌ dist/src/main.js missing" && exit 1)
RUN test -f /deploy/node_modules/.bin/prisma || (echo "❌ prisma binary missing" && exit 1)

# ── Stage 3: minimal production runtime ──────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Copy the self-contained bundle from pnpm deploy
COPY --from=builder /deploy .

EXPOSE 4000

# Run DB migrations then start the server
CMD ["sh", "-c", \
  "node_modules/.bin/prisma generate && \
   node_modules/.bin/prisma migrate deploy && \
   node dist/src/main.js"]
