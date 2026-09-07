FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional

# 受签名运维镜像：从锁文件安装出的构建层仅复制 Prisma CLI 的闭包，
# 并固化备份脚本、bash 与数据库客户端；不携带完整开发工具链。
FROM runtime-deps AS operations

RUN apk add --no-cache bash mariadb-client openssl

COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p node_modules/.bin \
    && ln -s ../prisma/build/index.js node_modules/.bin/prisma
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

RUN apk add --no-cache openssl

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

RUN mkdir -p /app/uploads /app/private-media/products \
    && chown -R node:node /app/uploads /app/private-media

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
