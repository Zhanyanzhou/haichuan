FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional --legacy-peer-deps \
    && rm -rf node_modules/prisma node_modules/.bin/prisma

# 受签名运维镜像：从锁文件安装出的构建层仅复制 Prisma CLI 的闭包，
# 并固化备份脚本、bash 与数据库客户端；不携带完整开发工具链。
FROM runtime-deps AS operations

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p node_modules/.bin \
    && ln -sf ../prisma/build/index.js node_modules/.bin/prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY scripts/backup.sh scripts/check-backup-health.sh scripts/restore.sh scripts/restore-drill.sh scripts/prune-backups.sh /usr/local/bin/
RUN chmod 0555 /usr/local/bin/backup.sh /usr/local/bin/check-backup-health.sh /usr/local/bin/restore.sh /usr/local/bin/restore-drill.sh /usr/local/bin/prune-backups.sh

ENV NODE_ENV=production

ARG BUILD_REVISION
ARG BUILD_SOURCE
ARG MIGRATION_BUNDLE_SHA256
RUN test -n "$BUILD_REVISION" \
    && test -n "$BUILD_SOURCE" \
    && test -n "$MIGRATION_BUNDLE_SHA256"
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      io.haichuan.component="operations" \
      io.haichuan.migration-bundle-sha256="${MIGRATION_BUNDLE_SHA256}"

USER node

CMD ["./node_modules/.bin/prisma", "migrate", "status"]

FROM runtime-deps

WORKDIR /app
ENV NODE_ENV=production

ARG BUILD_REVISION
ARG BUILD_SOURCE
ARG MIGRATION_BUNDLE_SHA256
RUN test -n "$BUILD_REVISION" \
    && test -n "$BUILD_SOURCE" \
    && test -n "$MIGRATION_BUNDLE_SHA256"
LABEL org.opencontainers.image.source="${BUILD_SOURCE}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      io.haichuan.component="server" \
      io.haichuan.migration-bundle-sha256="${MIGRATION_BUNDLE_SHA256}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

RUN mkdir -p /app/uploads /app/private-media/page-assets-archive /app/private-media/products \
    && chown -R node:node /app/uploads /app/private-media

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
