# Tripwire hosted backend: the Next.js app in apps/web, with SQLite on a Fly volume at /data.
# Build context is the repo root (pnpm workspace). Built remotely by `fly deploy`.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
# Manifests first so dependency install is cached across source-only changes. The extension's
# manifest is copied only so the lockfile resolves; its sources never enter the image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
RUN pnpm install --frozen-lockfile --filter "web..."
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm -F web build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TRIPWIRE_HOSTED=1 \
    TRIPWIRE_DB=/data/tripwire.db
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
# 0.0.0.0 inside the container is safe: proxy.ts refuses any Host but TRIPWIRE_HOSTED_HOST.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
