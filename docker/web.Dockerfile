# syntax=docker/dockerfile:1
# Frontend: build the Vite SPA, serve static files with nginx.
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# In the cluster the ingress serves /api and /ws on the same origin, so the
# SPA talks to relative paths. The ws client upgrades these to absolute URLs.
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/ws
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN pnpm --filter @m2cloud/web build

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
