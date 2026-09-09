# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

FROM installer AS builder
COPY --from=pruner /app/out/full/ .
# placeholder only - prisma generate reads schema, never connects.
# the real url gets injected at container runtime via compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder"
RUN pnpm --filter api exec prisma generate
RUN pnpm exec turbo run build --filter=api
RUN pnpm --filter=api --prod deploy --legacy /app/deployed

FROM node:24-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodegroup \
    && adduser --system --uid 1001 apiuser
COPY --from=builder --chown=apiuser:nodegroup /app/deployed .
USER apiuser
EXPOSE 4000
CMD ["node", "dist/index.js"]