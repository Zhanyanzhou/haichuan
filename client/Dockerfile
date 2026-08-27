FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build

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

ARG BUILD_REVISION=local
ARG BUILD_SOURCE=local
ARG MIGRATION_BUNDLE_SHA256=local
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      io.haichuan.component="client" \
      io.haichuan.migration-bundle-sha256="${MIGRATION_BUNDLE_SHA256}"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
