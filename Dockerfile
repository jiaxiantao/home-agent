FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS migrator

COPY prisma.config.ts tsconfig.json ./
COPY src/lib ./src/lib
COPY prisma ./prisma

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /pnpm /pnpm
COPY . .

RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "server.js"]

# One-shot DB init: docker compose run --rm migrate
FROM migrator AS migrate
CMD ["pnpm", "db:setup"]
