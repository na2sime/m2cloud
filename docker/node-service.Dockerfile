# syntax=docker/dockerfile:1
# Multi-stage build for any Node service. Pass --build-arg SERVICE=<name>.
# tsup bundles the service + its @m2cloud/* workspace deps into dist/index.js;
# npm deps stay external and are provided by a pruned, production-only
# node_modules created with `pnpm deploy`.
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS build
ARG SERVICE
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @m2cloud/${SERVICE} build
# Produce a self-contained deploy dir: dist/ + a production node_modules.
# --legacy is required by pnpm v10 to deploy non-injected workspaces.
RUN pnpm --filter @m2cloud/${SERVICE} deploy --prod --legacy /prod

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /prod/dist ./dist
COPY --from=build --chown=app:app /prod/node_modules ./node_modules
# Migration SQL (used by the gateway-api `node dist/migrate.js` job).
COPY --from=build --chown=app:app /repo/packages/db/migrations ./migrations
USER app
EXPOSE 3000 3001 3002
CMD ["node", "dist/index.js"]
