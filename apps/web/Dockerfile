# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

FROM installer AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=web

FROM node:24-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodegroup \
    && adduser --system --uid 1001 webuser
COPY --from=builder --chown=webuser:nodegroup /app/apps/web/.next/standalone ./
COPY --from=builder --chown=webuser:nodegroup /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=webuser:nodegroup /app/apps/web/public ./apps/web/public
USER webuser
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]