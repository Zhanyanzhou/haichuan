/**
 * 图片质量 A–C 隔离读取验收的边界说明。
 * start-isolated-read.mjs 与 verify-isolated-read.mjs 都引用这里，避免两份口径。
 *
 * 启动：node scripts/image-quality-acceptance/start-isolated-read.mjs
 * 验收：node scripts/image-quality-acceptance/verify-isolated-read.mjs
 * 停止：node scripts/image-quality-acceptance/stop-isolated-read.mjs
 */
export const ACCEPTANCE_ID = 'r5';
export const API_HOST = '127.0.0.1';
export const API_PORT = 3018;
export const WEB_HOST = '127.0.0.1';
export const WEB_PORT = 5176;
export const USER_API_PORT = 3000;
export const USER_WEB_PORT = 5173;

export const BOUNDARY = {
  acceptanceId: ACCEPTANCE_ID,
  ports: {
    isolatedApi: `${API_HOST}:${API_PORT}`,
    isolatedWeb: `${WEB_HOST}:${WEB_PORT}`,
    untouchedUserApi: `127.0.0.1:${USER_API_PORT}`,
    untouchedUserWeb: `127.0.0.1:${USER_WEB_PORT}`,
  },
  real: [
    '已构建的 PageModulesService.getLocalizedPublishedPageDocument：进程工作目录与真实 Nest 一样是 server/，真实 Prisma 只读已发布首页，并用该目录解析出的公开文件头生成 mediaFacts。',
    '已构建的 PublicUploadsGateway 与 UploadService.getResponsivePublicImage：真实路径分类、公开授权、校验和、派生宽度、内存缓存和磁盘缓存代码。',
    '派生缓存文件写在本次临时目录，不写 server/private-media。',
    '页面公开素材字节先复制到临时公开根；网关只读这些副本。',
    'Vite 使用 client 源码和 client 依赖，把 /api 与 /uploads 代理到本次 3018。',
  ],
  stubOrSnapshot: [
    '图片请求使用启动时一次只读 findMany 种下的内存素材快照。integrityCheckedAt 只改这份快照。',
    '存储键行锁的 SELECT FOR UPDATE 由快照应答，不在常用库加锁。',
    'POST /acceptance/stub-revocation 只翻转快照里的 revocationStatus，用来证明缓存命中前仍检查授权。',
  ],
  proxy: [
    '本次没有单独实现的 GET /api 只读转发到用户 3000，用于首页其余数据。响应不带本次验收身份头。',
    '转发不接受 POST、PUT、PATCH、DELETE。',
  ],
  writeProtection: [
    '真实 Prisma 中间件拒绝 create、update、delete、upsert、executeRaw、runCommandRaw，在 SQL 发出前抛错。',
    'queryRaw 只用于已发布页读取；公开首页读取路径本身不加 FOR UPDATE。',
    '不调用 UploadService.onModuleInit，不启动 AppModule、定时任务或启动对账。',
    '停止脚本先核对状态文件、仓库、本轮身份和精确临时目录，再结束对应进程。',
  ],
  notClaimed: [
    '上传、入库、保存、重开、测试发布没有在常用库执行。',
    'by-url 的角色、缺失、归档和失败恢复由 server 直接测试覆盖，不经常用库。',
    '手工改画框只算几何探针，不是已保存模板布局验收。',
    'health、PID 或 databaseConfigured 单独不能证明这条链路。身份头必须同时对上代码版本、构建文件哈希和进程命令行。',
  ],
};
