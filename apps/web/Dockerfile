# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json         ./apps/web/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM deps AS builder
ENV NEXT_BUILD_STANDALONE=1
ENV NODE_ENV=production

COPY tsconfig.base.json  ./
COPY packages/shared/    ./packages/shared/
COPY apps/web/           ./apps/web/

# Build shared package first (main now points to dist/index.js)
RUN pnpm --filter @sis/shared build

# Build args injected at build time (override for your domain)
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm --filter @sis/web build

# ── Stage 3: production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# The standalone output includes a minimal server + all traced deps
COPY --from=builder /repo/apps/web/.next/standalone          ./
COPY --from=builder /repo/apps/web/.next/static              ./apps/web/.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
