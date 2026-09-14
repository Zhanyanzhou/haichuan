FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS verify

WORKDIR /release

COPY .release-seo/public-seo-snapshot.json ./public-seo-snapshot.json
COPY .release-seo/public-seo-routes.conf ./public-seo-routes.conf
COPY .release-seo/public-seo-policy.conf ./public-seo-policy.conf
COPY .release-seo/tools/ ./tools/
COPY dist/ ./dist/

ARG VITE_API_BASE_URL="/api"
ARG VITE_PUBLIC_SITE_ORIGIN
ARG VITE_ANALYTICS_ENABLED="false"
ARG PUBLIC_SEO_SNAPSHOT_HASH
ARG PUBLIC_SEO_PRERENDER_MANIFEST_SHA256
ARG PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST
ARG PUBLIC_SEO_CONTENT_READY
ARG PUBLIC_SEO_SOURCE_KIND
RUN test -n "$VITE_API_BASE_URL" \
    && test -n "$VITE_PUBLIC_SITE_ORIGIN" \
    && test "$VITE_ANALYTICS_ENABLED" = "false" -o "$VITE_ANALYTICS_ENABLED" = "true" \
    && test -n "$PUBLIC_SEO_SNAPSHOT_HASH" \
    && test -n "$PUBLIC_SEO_PRERENDER_MANIFEST_SHA256" \
    && test -n "$PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST" \
    && test "$PUBLIC_SEO_CONTENT_READY" = "true" -o "$PUBLIC_SEO_CONTENT_READY" = "false" \
    && test "$PUBLIC_SEO_SOURCE_KIND" = "approved-snapshot" -o "$PUBLIC_SEO_SOURCE_KIND" = "safe-fallback" \
    && node ./tools/generate-public-seo-artifacts.mjs \
      --strict \
      --check \
      --origin "$VITE_PUBLIC_SITE_ORIGIN" \
      --manifest ./public-seo-snapshot.json \
      --prerender-manifest ./dist/prerendered-routes.json \
      --out-dir ./dist \
      --nginx-map ./public-seo-routes.conf \
      --nginx-policy ./public-seo-policy.conf \
    && test "$(node -e 'const value=require("./public-seo-snapshot.json"); process.stdout.write(value.snapshotHash || "")')" = "$PUBLIC_SEO_SNAPSHOT_HASH" \
    && test "$(sha256sum ./dist/prerendered-routes.json | cut -d ' ' -f 1)" = "$PUBLIC_SEO_PRERENDER_MANIFEST_SHA256" \
    && rm ./dist/prerendered-routes.json

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

ARG BUILD_REVISION
ARG BUILD_SOURCE
ARG MIGRATION_BUNDLE_SHA256
ARG PUBLIC_SEO_SNAPSHOT_HASH
ARG PUBLIC_SEO_PRERENDER_MANIFEST_SHA256
ARG PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST
ARG PUBLIC_SEO_CONTENT_READY
ARG PUBLIC_SEO_SOURCE_KIND
RUN test -n "$BUILD_REVISION" \
    && test -n "$BUILD_SOURCE" \
    && test -n "$MIGRATION_BUNDLE_SHA256" \
    && test -n "$PUBLIC_SEO_SNAPSHOT_HASH" \
    && test -n "$PUBLIC_SEO_PRERENDER_MANIFEST_SHA256" \
    && test -n "$PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST" \
    && test "$PUBLIC_SEO_CONTENT_READY" = "true" -o "$PUBLIC_SEO_CONTENT_READY" = "false" \
    && test "$PUBLIC_SEO_SOURCE_KIND" = "approved-snapshot" -o "$PUBLIC_SEO_SOURCE_KIND" = "safe-fallback"
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      io.haichuan.component="client" \
      io.haichuan.migration-bundle-sha256="${MIGRATION_BUNDLE_SHA256}" \
      io.haichuan.public-seo-snapshot-sha256="${PUBLIC_SEO_SNAPSHOT_HASH}" \
      io.haichuan.public-seo-prerender-manifest-sha256="${PUBLIC_SEO_PRERENDER_MANIFEST_SHA256}" \
      io.haichuan.public-seo-source-artifact-digest="${PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST}" \
      io.haichuan.public-seo-content-ready="${PUBLIC_SEO_CONTENT_READY}" \
      io.haichuan.public-seo-source-kind="${PUBLIC_SEO_SOURCE_KIND}"

COPY --chown=nginx:nginx nginx-main.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=verify --chown=nginx:nginx /release/public-seo-routes.conf /etc/nginx/public-seo-routes.conf
COPY --from=verify --chown=nginx:nginx /release/public-seo-policy.conf /etc/nginx/public-seo-policy.conf
COPY --from=verify --chown=nginx:nginx /release/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080 8081
