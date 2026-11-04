/**
 * 图片质量 A–C 隔离读取服务。
 *
 * 启动：node scripts/image-quality-acceptance/start-isolated-read.mjs
 * 验收：node scripts/image-quality-acceptance/verify-isolated-read.mjs
 * 停止：node scripts/image-quality-acceptance/stop-isolated-read.mjs
 *
 * 端口：API 127.0.0.1:3018，Vite 127.0.0.1:5176。用户的 3000 / 5173 不启动、不停止、不替换。
 * 构建产物：server/dist。源文件比 dist 新时拒绝启动，先在 server 执行 npm run build。
 * 代码版本：git rev-parse HEAD，并带三个 dist 文件的 SHA-256。响应头
 * X-Haichuan-Image-Acceptance、X-Haichuan-Image-Acceptance-Pid、X-Haichuan-Image-Code、
 * X-Haichuan-Image-Dist 必须和这些值一致。
 *
 * 真实：PageModulesService 读常用库里的已发布首页和真实 uploads 文件头。
 * 真实：PublicUploadsGateway 与 UploadService 的授权、校验和、派生和缓存代码。
 * 验收探针：GET /acceptance/read-probe 和 /acceptance/recent-uploads 只服务本次进程，不是产品接口。
 * 快照：图片行来自启动时一次只读 findMany；integrityCheckedAt 只改内存快照。
 * 代理：其余 GET /api 转到 127.0.0.1:3000，不带验收身份头，且拒绝非 GET/HEAD。
 * 写入防护：真实 Prisma 的写操作和 FOR UPDATE / FOR SHARE 在 SQL 前抛错。
 * 不启动 AppModule、定时任务或 UploadService.onModuleInit。
 * 临时副本和派生缓存在系统临时目录，停止脚本只删除该目录。
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createWriteStream, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  ACCEPTANCE_ID,
  API_HOST,
  API_PORT,
  BOUNDARY,
  USER_API_PORT,
  USER_WEB_PORT,
  WEB_PORT,
} from './boundary.mjs';
import { commandLine, listeningPids } from './process-guard.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const serverDir = join(repoRoot, 'server');
const clientDir = join(repoRoot, 'client');
const stateDir = join(repoRoot, '.codex-tmp', 'image-quality-acceptance');
const statePath = join(stateDir, `${ACCEPTANCE_ID}-state.json`);
const viteLogPath = join(stateDir, `vite.${ACCEPTANCE_ID}.log`);
const tokenArg = process.argv.indexOf('--run-token');
const runToken = tokenArg >= 0 ? process.argv[tokenArg + 1] : '';
if (tokenArg >= 0 && !/^[a-f0-9]{32}$/.test(runToken || '')) {
  fail('run token is invalid');
  process.exit(2);
}
if (tokenArg < 0) {
  const token = randomBytes(16).toString('hex');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--run-token', token], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
  await new Promise(() => {});
}
const requireFromServer = createRequire(join(serverDir, 'package.json'));

const DIST_FILES = {
  uploadService: 'dist/modules/upload/upload.service.js',
  gateway: 'dist/modules/upload/public-uploads.gateway.js',
  pageModules: 'dist/modules/page-modules/page-modules.service.js',
};
const SOURCE_FILES = {
  uploadService: 'src/modules/upload/upload.service.ts',
  gateway: 'src/modules/upload/public-uploads.gateway.ts',
  pageModules: 'src/modules/page-modules/page-modules.service.ts',
};

function fail(message) {
  console.error(message);
  process.exitCode = 2;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sqlText(query) {
  if (Array.isArray(query)) return query.join(' ');
  if (query && typeof query === 'object' && Array.isArray(query.strings)) return query.strings.join(' ');
  return '';
}

const newer = [];
for (const [name, source] of Object.entries(SOURCE_FILES)) {
  const sourceStat = statSync(join(serverDir, source));
  const distStat = statSync(join(serverDir, DIST_FILES[name]));
  if (sourceStat.mtimeMs > distStat.mtimeMs) newer.push(source);
}
if (newer.length > 0) {
  fail(`dist is older than source: ${newer.join(', ')}. Run npm run build in server before starting.`);
  process.exit(2);
}

for (const port of [API_PORT, WEB_PORT]) {
  const pids = listeningPids(port);
  if (pids.length > 0) {
    fail(`127.0.0.1:${port} is already in use by pid ${pids.join(', ')}. This start does not stop it.`);
    process.exit(2);
  }
}

const envFile = join(serverDir, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL) {
  fail('DATABASE_URL is not set. Refusing to guess a database.');
  process.exit(2);
}

const codeVersion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const distHashes = Object.fromEntries(Object.entries(DIST_FILES).map(([name, file]) => [name, sha256(join(serverDir, file))]));
const distFingerprint = createHash('sha256').update(JSON.stringify(distHashes)).digest('hex');
const userApiPid = listeningPids(USER_API_PORT)[0] ?? null;
const userWebPid = listeningPids(USER_WEB_PORT)[0] ?? null;

const { PrismaClient } = requireFromServer('@prisma/client');
const { PageModulesService } = requireFromServer('./dist/modules/page-modules/page-modules.service.js');
const { MediaAuthorizationResolverService } = requireFromServer('./dist/modules/upload/media-authorization-resolver.service.js');
const { UploadService } = requireFromServer('./dist/modules/upload/upload.service.js');
const { MediaAuthorizationService } = requireFromServer('./dist/modules/upload/media-authorization.service.js');
const { PublicUploadsGateway } = requireFromServer('./dist/modules/upload/public-uploads.gateway.js');
const { normalizeDecimals } = requireFromServer('./dist/common/interceptors/transform.interceptor.js');
const { requirePublishedPublicContentLocale } = requireFromServer('./dist/common/content-locale.js');
const { resolveMediaStorageRoots } = requireFromServer('./dist/modules/upload/media-storage-paths.js');
const express = requireFromServer('express');

const prisma = new PrismaClient({ log: ['error'] });
const blockedWrites = [];
const writeActions = new Set([
  'create', 'createMany', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany', 'executeRaw', 'runCommandRaw',
]);
prisma.$use(async (params, next) => {
  const rendered = JSON.stringify(params.args ?? '');
  const locksRows = (params.action === 'queryRaw' || params.action === 'executeRaw')
    && /for\s+(update|share)/i.test(rendered);
  if (writeActions.has(params.action) || locksRows) {
    blockedWrites.push(`${params.model || 'raw'}.${params.action}`);
    throw new Error(`blocked-write:${params.model || 'raw'}.${params.action}`);
  }
  return next(params);
});

// 真实 Nest 从 server/ 启动。相对媒体根按 process.cwd() 解析；这里对齐该目录，
// 否则会去仓库根的 uploads，读不到 server/uploads 里的已发布文件。
process.chdir(serverDir);
const pages = new PageModulesService(prisma, new MediaAuthorizationResolverService(prisma));
await prisma.$connect();

const locale = requirePublishedPublicContentLocale(undefined);
const seededDocument = await pages.getLocalizedPublishedPageDocument('home', locale);
const facts = seededDocument?.mediaFacts && typeof seededDocument.mediaFacts === 'object'
  ? seededDocument.mediaFacts
  : {};
const storageKeys = Object.keys(facts)
  .filter((url) => url.startsWith('/uploads/page-assets/'))
  .map((url) => url.slice('/uploads/'.length));

const realRows = storageKeys.length === 0 ? [] : await prisma.mediaAsset.findMany({
  where: { storageKey: { in: storageKeys }, accessLevel: 'PUBLIC' },
  include: { authorization: true },
});

const realPublicRoot = resolveMediaStorageRoots().publicRoot;
const tempRoot = join(tmpdir(), `haichuan-image-${ACCEPTANCE_ID}-${process.pid}`);
mkdirSync(tempRoot, { recursive: true });
const publicRoot = join(tempRoot, 'uploads');
const copiedKeys = [];
for (const row of realRows) {
  const source = join(realPublicRoot, row.storageKey);
  if (!existsSync(source)) continue;
  const target = join(publicRoot, row.storageKey);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  copiedKeys.push(row.storageKey);
}

const assets = new Map(realRows.map((row) => [row.storageKey, row]));
let absorbedIntegrityUpdates = 0;
const snapshotWriteAttempts = [];
const imagePrisma = {
  mediaAsset: {
    async findUnique({ where }) {
      if (where?.storageKey) return assets.get(where.storageKey) ?? null;
      return [...assets.values()].find((asset) => asset.id === where?.id) ?? null;
    },
    async findFirst({ where }) {
      return [...assets.values()].find((asset) => matchesAsset(asset, where)) ?? null;
    },
    async update({ where, data }) {
      const asset = [...assets.values()].find((item) => item.id === where?.id || item.storageKey === where?.storageKey);
      if (!asset) throw new Error('snapshot asset missing');
      const keys = Object.keys(data ?? {});
      const safe = keys.every((key) => key === 'integrityCheckedAt' || key === 'quarantineReason')
        && (data.quarantineReason === undefined || data.quarantineReason === null);
      if (!safe) {
        snapshotWriteAttempts.push(keys.join(','));
        throw new Error(`blocked-snapshot-write:${keys.join(',')}`);
      }
      if ('integrityCheckedAt' in data) asset.integrityCheckedAt = data.integrityCheckedAt;
      if ('quarantineReason' in data) asset.quarantineReason = null;
      absorbedIntegrityUpdates += 1;
      return asset;
    },
  },
  product: {
    async updateMany() {
      snapshotWriteAttempts.push('product.updateMany');
      throw new Error('blocked-snapshot-write:product.updateMany');
    },
  },
  productImage: {
    findFirst: (...args) => prisma.productImage.findFirst(...args),
  },
  $transaction: async (work) => work(imagePrisma),
  $queryRaw: async (query) => {
    const text = sqlText(query);
    if (text.includes('media_assets') && /for\s+update/i.test(text)) return [{ id: 1 }];
    throw new Error('unexpected snapshot query');
  },
};

const previousEnv = {
  PUBLIC_MEDIA_ROOT: process.env.PUBLIC_MEDIA_ROOT,
  PAGE_MEDIA_ARCHIVE_ROOT: process.env.PAGE_MEDIA_ARCHIVE_ROOT,
  PAYMENT_PROOF_MEDIA_ROOT: process.env.PAYMENT_PROOF_MEDIA_ROOT,
  PRODUCT_MEDIA_ROOT: process.env.PRODUCT_MEDIA_ROOT,
};
const previousCwd = process.cwd();
process.chdir(tempRoot);
process.env.PUBLIC_MEDIA_ROOT = publicRoot;
process.env.PAGE_MEDIA_ARCHIVE_ROOT = join(tempRoot, 'archive');
process.env.PAYMENT_PROOF_MEDIA_ROOT = join(tempRoot, 'proofs');
process.env.PRODUCT_MEDIA_ROOT = join(tempRoot, 'products');
mkdirSync(process.env.PAGE_MEDIA_ARCHIVE_ROOT, { recursive: true });
mkdirSync(process.env.PAYMENT_PROOF_MEDIA_ROOT, { recursive: true });
mkdirSync(process.env.PRODUCT_MEDIA_ROOT, { recursive: true });
const uploadService = new UploadService(imagePrisma, new MediaAuthorizationService(imagePrisma));
process.chdir(previousCwd);
for (const [name, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const app = express();
function stamp(response) {
  response.setHeader('X-Haichuan-Image-Acceptance', ACCEPTANCE_ID);
  response.setHeader('X-Haichuan-Image-Acceptance-Pid', String(process.pid));
  response.setHeader('X-Haichuan-Image-Code', codeVersion);
  response.setHeader('X-Haichuan-Image-Dist', distFingerprint);
}

app.get('/acceptance/health', (_request, response) => {
  stamp(response);
  response.json({
    acceptanceId: ACCEPTANCE_ID,
    pid: process.pid,
    codeVersion,
    distHashes,
    distFingerprint,
    blockedWrites,
    snapshotWriteAttempts,
    absorbedIntegrityUpdates,
    responsiveMemoryCacheEntries: uploadService.responsivePublicMediaCache.size,
    factCount: Object.keys(facts).length,
    copiedFileCount: copiedKeys.length,
    tempRoot,
    boundary: BOUNDARY,
  });
});

app.get('/acceptance/db-authorization', async (request, response, next) => {
  try {
    stamp(response);
    const storageKey = String(request.query.storageKey || '');
    if (!assets.has(storageKey)) {
      response.status(404).json({ error: 'not-seeded' });
      return;
    }
    const row = await prisma.mediaAsset.findUnique({
      where: { storageKey },
      select: {
        storageKey: true,
        authorization: { select: { revocationStatus: true, reviewStatus: true } },
      },
    });
    response.json({
      storageKey: row?.storageKey ?? null,
      revocationStatus: row?.authorization?.revocationStatus ?? null,
      reviewStatus: row?.authorization?.reviewStatus ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/acceptance/stub-revocation', express.json({ limit: '1kb' }), (request, response) => {
  stamp(response);
  const storageKey = String(request.body?.storageKey || '');
  const revocationStatus = request.body?.revocationStatus;
  if (revocationStatus !== 'REVOKED' && revocationStatus !== 'ACTIVE') {
    response.status(400).json({ error: 'revocationStatus' });
    return;
  }
  const asset = assets.get(storageKey);
  if (!asset?.authorization) {
    response.status(404).json({ error: 'not-seeded' });
    return;
  }
  asset.authorization.revocationStatus = revocationStatus;
  response.json({ storageKey, revocationStatus, persistedToDatabase: false });
});

app.get('/api/page-modules/document/published', async (request, response, next) => {
  const pageKey = typeof request.query.pageKey === 'string' && request.query.pageKey
    ? request.query.pageKey
    : 'home';
  if (pageKey !== 'home') {
    next();
    return;
  }
  try {
    stamp(response);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const document = await pages.getLocalizedPublishedPageDocument(
      pageKey,
      requirePublishedPublicContentLocale(request.query.locale),
    );
    response.json(normalizeDecimals({
      code: 200,
      data: document,
      message: 'success',
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    next(error);
  }
});

const recentUploadRequests = [];
app.get('/acceptance/read-probe', async (request, response) => {
  stamp(response);
  const storageKey = String(request.query.storageKey || '');
  const width = Number(request.query.width || 480);
  const asset = assets.get(storageKey);
  const filePath = join(publicRoot, storageKey);
  try {
    const media = await uploadService.getResponsivePublicImage(storageKey, width, true);
    response.json({
      ok: true,
      bytes: media.buffer.byteLength,
      mimeType: media.mimeType,
      inSnapshot: Boolean(asset),
      accessLevel: asset?.accessLevel ?? null,
      fileExists: existsSync(filePath),
      uploadDirInTemp: String(uploadService.uploadDir).includes('haichuan-image-r4'),
    });
  } catch (error) {
    response.status(typeof error?.getStatus === 'function' ? error.getStatus() : 500).json({
      ok: false,
      message: error?.message || 'error',
      inSnapshot: Boolean(asset),
      accessLevel: asset?.accessLevel ?? null,
      fileExists: existsSync(filePath),
      uploadDirInTemp: String(uploadService.uploadDir).includes('haichuan-image-r4'),
    });
  }
});

app.use('/uploads', (request, response, next) => {
  recentUploadRequests.push({
    url: request.url,
    originalUrl: request.originalUrl,
  });
  if (recentUploadRequests.length > 8) recentUploadRequests.shift();
  stamp(response);
  next();
});
app.get('/acceptance/recent-uploads', (_request, response) => {
  stamp(response);
  response.json(recentUploadRequests);
});
new PublicUploadsGateway(
  { httpAdapter: { getInstance: () => app } },
  uploadService,
).onModuleInit();

app.use('/api', (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.status(405).type('text/plain').send('acceptance-proxy-rejects-writes');
    return;
  }
  const upstream = requireFromServer('http').request({
    hostname: '127.0.0.1',
    port: USER_API_PORT,
    path: request.originalUrl,
    method: request.method,
    headers: { ...request.headers, host: `127.0.0.1:${USER_API_PORT}` },
  }, (proxied) => {
    response.writeHead(proxied.statusCode ?? 502, proxied.headers);
    proxied.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.status(502).type('text/plain').send('proxied-read-unavailable');
  });
  upstream.end();
});

app.use((error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  stamp(response);
  const status = typeof error?.getStatus === 'function' ? error.getStatus() : 500;
  const body = typeof error?.getResponse === 'function' ? error.getResponse() : error?.message;
  const text = typeof body === 'string' ? body : body?.message || 'error';
  response.status(status).type('text/plain; charset=utf-8').send(String(text));
});

mkdirSync(stateDir, { recursive: true });
const server = app.listen(API_PORT, API_HOST);
const viteChild = fileURLToPath(new URL('./vite-child.mjs', import.meta.url));
const viteConfig = fileURLToPath(new URL('./vite.config.mjs', import.meta.url));
mkdirSync(dirname(viteLogPath), { recursive: true });
const viteLog = createWriteStream(viteLogPath, { flags: 'w' });
const vite = spawn(process.execPath, [
  viteChild,
  runToken,
  viteConfig,
  API_HOST,
  String(WEB_PORT),
], {
  cwd: clientDir,
  env: { ...process.env, BROWSER: 'none', DATABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
vite.stdout.pipe(viteLog);
vite.stderr.pipe(viteLog);

const state = {
  acceptanceId: ACCEPTANCE_ID,
  repoRoot,
  runToken,
  apiPid: process.pid,
  apiCommandLine: commandLine(process.pid),
  vitePid: vite.pid,
  apiPort: API_PORT,
  webPort: WEB_PORT,
  codeVersion,
  distHashes,
  distFingerprint,
  tempRoot,
  userApiPid,
  userWebPid,
  startedAt: new Date().toISOString(),
};
writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(JSON.stringify({
  listening: `http://${API_HOST}:${API_PORT}`,
  web: `http://127.0.0.1:${WEB_PORT}`,
  pid: process.pid,
  vitePid: vite.pid,
  codeVersion,
  distFingerprint,
  factCount: Object.keys(facts).length,
  copiedFileCount: copiedKeys.length,
  statePath,
}, null, 2));

function matchesAsset(asset, where) {
  if (!where) return true;
  if (typeof where.storageKey === 'string' && asset.storageKey !== where.storageKey) return false;
  // 字符串自带 startsWith 方法。只有 Prisma 过滤对象上的 startsWith 才是前缀条件。
  if (where.storageKey && typeof where.storageKey === 'object' && typeof where.storageKey.startsWith === 'string'
    && !asset.storageKey.startsWith(where.storageKey.startsWith)) return false;
  if (where.accessLevel && asset.accessLevel !== where.accessLevel) return false;
  if (where.id !== undefined && asset.id !== where.id) return false;
  if (where.url && `/uploads/${asset.storageKey}` !== where.url) return false;
  return true;
}

async function shutdown() {
  vite.kill();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
}

process.on('SIGINT', () => { shutdown().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { shutdown().finally(() => process.exit(0)); });
vite.on('exit', (code) => {
  console.error(`isolated vite exited: ${code}`);
});
