FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL="/api"
ARG VITE_PUBLIC_SITE_ORIGIN=""
ARG VITE_ANALYTICS_ENABLED="false"
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_PUBLIC_SITE_ORIGIN=${VITE_PUBLIC_SITE_ORIGIN}
ENV VITE_ANALYTICS_ENABLED=${VITE_ANALYTICS_ENABLED}
RUN npm run build

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

ARG BUILD_REVISION
ARG BUILD_SOURCE
ARG MIGRATION_BUNDLE_SHA256
RUN test -n "$BUILD_REVISION" \
    && test -n "$BUILD_SOURCE" \
    && test -n "$MIGRATION_BUNDLE_SHA256"
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      io.haichuan.component="client" \
      io.haichuan.migration-bundle-sha256="${MIGRATION_BUNDLE_SHA256}"

COPY --chown=nginx:nginx nginx-main.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080 8081
