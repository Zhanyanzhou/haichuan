/**
 * 在一次性本地 MySQL 上跑完整 Nest 与前端，验证上传、保存、发布和鉴权。
 * 不读取业务库，不打印连接串、口令或令牌。失败时只清理本轮容器和临时目录。
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listeningPids } from './process-guard.mjs';
import { assertExactAcceptanceTempRoot } from './temp-guard.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const serverDir = join(repoRoot, 'server');
const clientDir = join(repoRoot, 'client');
const requireFromServer = createRequire(join(serverDir, 'package.json'));
const requireFromClient = createRequire(join(clientDir, 'package.json'));
const sharp = requireFromServer('sharp');
const bcrypt = requireFromServer('bcrypt');
const { PrismaClient } = requireFromServer('@prisma/client');
const { chromium } = requireFromClient('playwright');

const MYSQL_IMAGE = 'mysql:8.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b';
const DATABASE_NAME = 'haichuan_image_r5';
const DATABASE_USER = 'hc_image_r5';
const MYSQL_PORT = 33173;
const API_PORT = 3019;
const WEB_PORT = 5177;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const USER_PORTS = [3000, 5173];

const runPid = process.pid;
const tempRoot = join(tmpdir(), `haichuan-image-r5-${runPid}`);
const appDir = join(tempRoot, 'app');
const publicRoot = join(tempRoot, 'public-uploads');
const archiveRoot = join(tempRoot, 'archive');
const paymentRoot = join(tempRoot, 'payment-proofs');
const productRoot = join(tempRoot, 'product-media');
const backupRoot = join(tempRoot, 'backups');
const shotDir = join(repoRoot, 'docs', 'research', 'image-quality-2026-11-04', 'r5-screenshots');
const resultPath = join(repoRoot, 'docs', 'research', 'image-quality-2026-11-04', 'cursor-acceptance-r5-closure.json');

const rootPassword = randomBytes(24).toString('base64url');
const databasePassword = randomBytes(24).toString('base64url');
const loginPassword = randomBytes(18).toString('base64url');
const jwtSecret = randomBytes(48).toString('hex');
const container = `hc-image-r5-${runPid}`;
const staffUsername = `r5s${runPid}`;
const reviewerUsername = `r5a${runPid}`;
const editorUsername = `r5e${runPid}`;
const customerPhone = `139${String(runPid).padStart(8, '0').slice(-8)}`;

const steps = [];
const checks = {};
let databaseUrl = '';
let prisma;
let nestChild;
let viteChild;
let browser;
let createdContainer = false;

function redact(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/mysql:\/\/[^\s'"]+/gi, 'mysql://***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer ***')
    .replace(/eyJ[A-Za-z0-9._~+/-]+/g, '***');
}

function note(name, detail) {
  steps.push({ name, at: new Date().toISOString(), ...detail });
}

function fail(message) {
  const error = new Error(message);
  error.closure = true;
  throw error;
}

function assertFree(port) {
  const pids = listeningPids(port);
  if (pids.length > 0) fail(`端口 ${port} 已被占用，拒绝绑定`);
}

function commandOf(pid) {
  const output = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`,
  ], { encoding: 'utf8' });
  return redact(output.stdout || '');
}

function killOwned(child, marker) {
  if (!child?.pid) return;
  const command = commandOf(child.pid).toLowerCase();
  const root = repoRoot.toLowerCase();
  const rootSeen = command.includes(root) || command.includes(root.replaceAll('\\', '/'));
  if (!command.includes(marker) || !rootSeen) return;
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8' });
}

async function http(path, { token, method = 'GET', json, form, origin = API_ORIGIN } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const response = await fetch(`${origin}${path}`, { method, headers, body });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 240) };
  }
  const messageSource = parsed?.message ?? '';
  const message = Array.isArray(messageSource)
    ? messageSource.join('；')
    : typeof messageSource === 'string'
      ? messageSource
      : redact(messageSource).slice(0, 400);
  return {
    status: response.status,
    message: message.slice(0, 400),
    data: parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed,
    cacheControl: response.headers.get('cache-control') || '',
    etag: response.headers.get('etag') || '',
  };
}

function formWith(buffer, filename) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), filename);
  return form;
}

async function png(width, height, color) {
  return sharp({
    create: { width, height, channels: 3, background: color },
  }).png().toBuffer();
}

async function loginStaff(username) {
  const result = await http('/api/auth/login', {
    method: 'POST',
    json: { username, password: loginPassword },
  });
  const token = typeof result.data?.accessToken === 'string' ? result.data.accessToken : '';
  return { status: result.status, message: result.message, token, role: result.data?.user?.role || null };
}

function mediaSummary(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: item.id,
    url: item.url,
    status: item.status,
    metadataStatus: item.metadataStatus ?? null,
    width: item.width ?? null,
    height: item.height ?? null,
    displayWidth: item.displayWidth ?? null,
    displayHeight: item.displayHeight ?? null,
    revision: item.authorization?.revision ?? null,
  };
}

async function authorize(assetId, staffToken, reviewerToken) {
  const drafted = await http(`/api/upload/media/${assetId}/authorization/draft`, {
    token: staffToken,
    method: 'PUT',
    json: {
      expectedRevision: 1,
      sourceType: 'BRAND_OWNED',
      authorizationBasis: 'r5 isolated closure',
      evidenceReference: `local://r5/${assetId}`,
      publicWebUseAllowed: true,
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  const draftRevision = Number(drafted.data?.authorization?.revision);
  const submitted = await http(`/api/upload/media/${assetId}/authorization/submit`, {
    token: staffToken,
    method: 'POST',
    json: { expectedRevision: draftRevision },
  });
  const submitRevision = Number(submitted.data?.authorization?.revision);
  const approved = await http(`/api/upload/media/${assetId}/authorization/approve`, {
    token: reviewerToken,
    method: 'POST',
    json: { expectedRevision: submitRevision, reviewNote: 'r5 two-person approval' },
  });
  return {
    drafted: drafted.status,
    submitted: submitted.status,
    approved: approved.status,
    revision: Number(approved.data?.authorization?.revision),
    message: approved.message || submitted.message || drafted.message,
  };
}

async function decodeUrl(url) {
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  let meta = {};
  if (response.status === 200 && bytes.length > 0) {
    try {
      meta = await sharp(bytes).metadata();
    } catch {
      meta = { format: 'undecodable' };
    }
  }
  return {
    status: response.status,
    bytes: bytes.length,
    format: meta.format || null,
    width: meta.width || null,
    height: meta.height || null,
    etag: response.headers.get('etag') || '',
    message: response.status === 200 ? '' : bytes.toString('utf8').slice(0, 120),
  };
}

async function imageFacts(page) {
  return page.evaluate(() => [...document.querySelectorAll('img')].map((img) => {
    const picture = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
    const sources = picture
      ? [...picture.querySelectorAll('source')].map((source) => ({
        media: source.getAttribute('media') || '',
        srcset: source.getAttribute('srcset') || '',
        sizes: source.getAttribute('sizes') || '',
      }))
      : [];
    let current;
    try {
      current = new URL(img.currentSrc || img.src, location.href);
    } catch {
      current = new URL(location.href);
    }
    const chosen = sources.find((source) => source.srcset.split(',').some((candidate) => {
      const raw = candidate.trim().split(/\s+/)[0];
      if (!raw) return false;
      return new URL(raw, location.href).pathname === current.pathname;
    })) || null;
    const box = img.getBoundingClientRect();
    return {
      currentSrc: img.currentSrc || '',
      src: img.getAttribute('src') || '',
      sizes: img.getAttribute('sizes') || '',
      srcset: img.getAttribute('srcset') || '',
      chosenSrcset: chosen?.srcset || '',
      chosenSizes: chosen?.sizes || '',
      cssWidth: Math.round(box.width),
      cssHeight: Math.round(box.height),
      dpr: window.devicePixelRatio,
      sources,
    };
  }));
}

async function waitForPublishedHero(page, marker) {
  await page.waitForFunction((expected) => {
    const img = document.querySelector('[data-page-document-state="published"] .hc-phase1-hero__media img');
    return Boolean(img && img.currentSrc.includes(expected) && img.getAttribute('srcset'));
  }, marker, { timeout: 45_000 });
}

function expectedSrcSet(src, displayWidth) {
  const tiers = [480, 800, 1200, 1680, 2400, 2880, 3840];
  const seen = new Set();
  const candidates = [];
  for (const tier of tiers) {
    const outputWidth = Math.min(tier, displayWidth);
    if (seen.has(outputWidth)) continue;
    seen.add(outputWidth);
    const url = new URL(src, 'https://public-media.local');
    url.searchParams.set('width', String(tier));
    url.searchParams.set('rv', '2');
    candidates.push(`${url.pathname}${url.search} ${outputWidth}w`);
    if (displayWidth <= tier) break;
  }
  return candidates.join(', ');
}

function docker(args, timeout = 120_000) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout });
}

async function waitForMysql() {
  let consecutive = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = docker([
      'exec', '-e', `MYSQL_PWD=${rootPassword}`, container,
      'mysql', '-uroot', '--batch', '--skip-column-names', '--execute', 'SELECT 1',
    ], 15_000);
    consecutive = probe.status === 0 ? consecutive + 1 : 0;
    if (consecutive >= 3) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  fail('隔离数据库未在时限内就绪');
}

function mysql(sql) {
  const result = docker([
    'exec', '-e', `MYSQL_PWD=${rootPassword}`, container,
    'mysql', '-uroot', '--batch', '--skip-column-names', '--execute', sql,
  ], 60_000);
  if (result.status !== 0) fail(`隔离数据库初始化失败：${redact(result.stderr || result.stdout || '').slice(0, 240)}`);
  return (result.stdout || '').trim();
}

async function startNest() {
  const nestEnv = { ...process.env };
  for (const key of ['DATABASE_URL', 'REAL_MYSQL_TEST_DATABASE_URL', 'MEDIA_REAL_MYSQL_URL']) delete nestEnv[key];
  Object.assign(nestEnv, {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(API_PORT),
    JWT_SECRET: jwtSecret,
    PAYMENT_PROVIDER_MODE: 'disabled',
    PUBLIC_MEDIA_ROOT: publicRoot,
    PAGE_MEDIA_ARCHIVE_ROOT: archiveRoot,
    PAYMENT_PROOF_MEDIA_ROOT: paymentRoot,
    PRODUCT_MEDIA_ROOT: productRoot,
    BACKUP_DIR: backupRoot,
    HAICHUAN_EXPECT_DATABASE_NAME: DATABASE_NAME,
    HAICHUAN_EXPECT_CWD: appDir,
    HAICHUAN_EXPECT_PUBLIC_ROOT: publicRoot,
    HAICHUAN_NEST_MAIN: join(serverDir, 'dist', 'main.js'),
  });
  const logPath = join(tempRoot, 'nest.log');
  nestChild = spawn(process.execPath, [join(repoRoot, 'scripts', 'image-quality-acceptance', 'closure-main.mjs')], {
    cwd: appDir,
    env: nestEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const writeLog = (chunk) => appendFileSync(logPath, redact(chunk.toString()));
  nestChild.stdout.on('data', writeLog);
  nestChild.stderr.on('data', writeLog);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (nestChild.exitCode != null) {
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-1200) : '';
      fail(`完整 Nest 已退出：${log}`);
    }
    try {
      const health = await http('/api/health');
      if (health.status === 200 && health.data?.status === 'alive') return health;
    } catch {
      // 进程尚未监听。
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  fail('完整 Nest 未在时限内监听');
}

function startWeb() {
  const configPath = join(tempRoot, 'closure-web.config.mjs');
  const envModule = pathToFileURL(join(clientDir, 'vite-public-env.mjs')).href;
  const clientPackage = join(clientDir, 'package.json');
  writeFileSync(configPath, `import path from 'node:path';
import { createRequire } from 'node:module';
import { createPublicClientEnvDefinitions } from ${JSON.stringify(envModule)};
const clientRoot = ${JSON.stringify(clientDir)};
const requireFromClient = createRequire(${JSON.stringify(clientPackage)});
const { defineConfig, loadEnv } = requireFromClient('vite');
const react = requireFromClient('@vitejs/plugin-react');
const env = loadEnv('development', clientRoot, '');
env.VITE_API_BASE_URL = '';
export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  envPrefix: [],
  define: createPublicClientEnvDefinitions(env),
  resolve: { alias: { '@': path.join(clientRoot, 'src') } },
  server: {
    host: '127.0.0.1',
    port: ${WEB_PORT},
    strictPort: true,
    proxy: {
      '/api': { target: ${JSON.stringify(API_ORIGIN)}, changeOrigin: true },
      '/uploads': { target: ${JSON.stringify(API_ORIGIN)}, changeOrigin: true },
    },
  },
});
`);
  const runToken = randomBytes(16).toString('hex');
  viteChild = spawn(process.execPath, [
    join(repoRoot, 'scripts', 'image-quality-acceptance', 'vite-child.mjs'),
    runToken,
    configPath,
    '127.0.0.1',
    String(WEB_PORT),
  ], {
    cwd: clientDir,
    env: { ...process.env, BROWSER: 'none', DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logPath = join(tempRoot, 'vite.log');
  const writeLog = (chunk) => appendFileSync(logPath, redact(chunk.toString()));
  viteChild.stdout.on('data', writeLog);
  viteChild.stderr.on('data', writeLog);
}

async function waitForWeb() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(WEB_ORIGIN);
      if (response.status < 500) return response.status;
    } catch {
      // Vite 尚未监听。
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  const logPath = join(tempRoot, 'vite.log');
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-800) : '';
  fail(`隔离前端未在时限内监听：${log}`);
}

async function browserPass(staffToken, desktop, mobile) {
  browser = await chromium.launch();
  const desktopContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitForPublishedHero(desktopPage, 'width=3840');
  const desktopFacts = await imageFacts(desktopPage);
  const desktopHit = desktopFacts.find((item) => item.currentSrc.includes('width=3840'));
  const desktopDecoded = desktopHit ? await decodeUrl(desktopHit.currentSrc) : null;
  await desktopPage.screenshot({ path: join(shotDir, 'public-desktop.png') });
  checks.desktop3840 = Boolean(
    desktopHit
    && desktopHit.currentSrc.includes('width=3840')
    && desktopHit.cssWidth === 1920
    && desktopHit.dpr === 2
    && desktopHit.sizes.includes('100vw')
    && desktopDecoded?.format === 'webp'
    && desktopDecoded.width === 3840
    && desktopDecoded.height === 2160,
  );
  note('public-desktop', {
    ok: checks.desktop3840,
    sizes: desktopHit?.sizes || '',
    cssWidth: desktopHit?.cssWidth || 0,
    dpr: desktopHit?.dpr || 0,
    srcset: desktopHit?.srcset || '',
    decoded: desktopDecoded,
  });

  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const phonePage = await phoneContext.newPage();
  await phonePage.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitForPublishedHero(phonePage, mobile.hash);
  const phoneFacts = await imageFacts(phonePage);
  const phoneHit = phoneFacts.find((item) => item.currentSrc.includes(mobile.hash));
  const phoneDecoded = phoneHit ? await decodeUrl(phoneHit.currentSrc) : null;
  const phoneSrcSet = expectedSrcSet(mobile.url, 941);
  const phoneCandidate = phoneHit?.chosenSrcset || '';
  await phonePage.screenshot({ path: join(shotDir, 'public-phone.png') });
  checks.phone941 = Boolean(
    phoneHit
    && phoneHit.cssWidth === 390
    && phoneHit.dpr === 3
    && phoneCandidate === phoneSrcSet
    && phoneCandidate.includes('941w')
    && !phoneCandidate.includes('1200w')
    && phoneDecoded?.format === 'webp'
    && phoneDecoded?.width === 941
    && phoneDecoded?.height === 1672,
  );
  note('public-phone', {
    ok: checks.phone941,
    sizes: phoneHit?.chosenSizes || phoneHit?.sizes || '',
    cssWidth: phoneHit?.cssWidth || 0,
    dpr: phoneHit?.dpr || 0,
    srcset: phoneCandidate,
    imgSrcset: phoneHit?.srcset || '',
    expectedSrcSet: phoneSrcSet,
    decoded: phoneDecoded,
  });

  const coverContext = await browser.newContext({
    viewport: { width: 1200, height: 1800 },
    deviceScaleFactor: 2,
  });
  const coverPage = await coverContext.newPage();
  await coverPage.goto(WEB_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitForPublishedHero(coverPage, 'width=3840');
  const before = await imageFacts(coverPage);
  const beforeHero = before.find((item) => item.currentSrc.includes(desktop.url) && item.currentSrc.includes('width=3840'));
  await coverPage.evaluate(() => {
    const img = document.querySelector('.hc-phase1-hero__media img');
    img?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 240 }));
    window.scrollTo(0, 48);
  });
  await coverPage.waitForTimeout(250);
  const immediate = await coverPage.evaluate(() => {
    const img = document.querySelector('.hc-phase1-hero__media img');
    return {
      currentSrc: img?.currentSrc || '',
      srcset: img?.getAttribute('srcset') || '',
      sizes: img?.getAttribute('sizes') || '',
    };
  });
  await coverPage.waitForFunction((marker) => {
    const img = document.querySelector('[data-page-document-state="published"] .hc-phase1-hero__media img');
    return Boolean(img && img.currentSrc.includes(marker) && img.getAttribute('srcset'));
  }, 'width=3840', { timeout: 4000 }).catch(() => undefined);
  const after = await imageFacts(coverPage);
  const afterHero = after.find((item) => item.currentSrc.includes(desktop.url) || item.src.includes(desktop.url));
  const coverDecoded = beforeHero ? await decodeUrl(beforeHero.currentSrc) : null;
  const heroStable = Boolean(
    beforeHero
    && afterHero
    && beforeHero.currentSrc === afterHero.currentSrc
    && beforeHero.sizes === afterHero.sizes
    && beforeHero.chosenSrcset === afterHero.chosenSrcset,
  );
  await coverPage.screenshot({ path: join(shotDir, 'public-cover.png') });
  checks.coverStable = Boolean(
    beforeHero
    && beforeHero.cssWidth >= 1100
    && beforeHero.cssHeight > beforeHero.cssWidth
    && !beforeHero.sizes.endsWith('px')
    && coverDecoded?.width === 3840
    && coverDecoded?.height === 2160
    && heroStable,
  );
  note('public-cover', {
    ok: checks.coverStable,
    sizes: beforeHero?.sizes || '',
    cssWidth: beforeHero?.cssWidth || 0,
    cssHeight: beforeHero?.cssHeight || 0,
    dpr: beforeHero?.dpr || 0,
    currentSrc: beforeHero?.currentSrc || '',
    immediateCurrentSrc: immediate.currentSrc,
    immediateSrcset: immediate.srcset,
    afterCurrentSrc: afterHero?.currentSrc || '',
    afterCss: afterHero ? { cssWidth: afterHero.cssWidth, cssHeight: afterHero.cssHeight } : null,
    afterSrcs: after.map((item) => item.currentSrc).slice(0, 6),
    decoded: coverDecoded,
    stable: heroStable,
    frame: 'published-home-hero-desktop-cover-1200x1800',
  });

  const editorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const editorPage = await editorContext.newPage();
  try {
    await editorPage.goto(`${WEB_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await editorPage.locator('#admin-login-username').fill(staffUsername);
    await editorPage.locator('#admin-login-password').fill(loginPassword);
    await editorPage.locator('button[type="submit"]').click();
    await editorPage.waitForURL((url) => url.pathname.startsWith('/admin/') && !url.pathname.includes('/login'), { timeout: 30_000 });
    await editorPage.goto(`${WEB_ORIGIN}/admin/editor/home`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await editorPage.locator('[aria-label="编辑设备：桌面端与移动端布局可分别调整"]').waitFor({ timeout: 45_000 });
    const mobileButton = editorPage.getByRole('button', { name: /移动端布局/ });
    const desktopButton = editorPage.getByRole('button', { name: /桌面端布局/ });
    await mobileButton.click();
    const mobilePressed = await mobileButton.getAttribute('aria-pressed');
    await editorPage.screenshot({ path: join(shotDir, 'editor-mobile.png') });
    await desktopButton.click();
    const desktopPressed = await desktopButton.getAttribute('aria-pressed');
    checks.editorDevice = mobilePressed === 'true' && desktopPressed === 'true';
    const zoomOutput = editorPage.locator('output[aria-label*="缩放"]').first();
    let zoomLabel = await zoomOutput.getAttribute('aria-label');
    for (let step = 0; step < 6; step += 1) {
      const current = Number((zoomLabel.match(/缩放\s*(\d+)%/) || [])[1] || 0);
      if (current >= 60 && current <= 70) break;
      const control = current > 70 ? '缩小画布' : '放大画布';
      await editorPage.getByRole('button', { name: control }).click();
      zoomLabel = await zoomOutput.getAttribute('aria-label');
    }
    checks.zoomObserved = /缩放\s*(6[0-9]|70)%/.test(zoomLabel || '');
    const nearestZoomPercent = Number((zoomLabel.match(/缩放\s*(\d+)%/) || [])[1] || 0);
    await editorPage.screenshot({ path: join(shotDir, 'editor-desktop.png') });
    note('editor', {
      mobilePressed,
      desktopPressed,
      zoomLabel,
      exact67Control: false,
      nearestZoomPercent,
      unsaved: false,
      staffTokenUsed: Boolean(staffToken),
    });
    let unsaved = false;
    for (const frame of editorPage.frames()) {
      const candidate = frame.getByText('隔离验收首屏').first();
      if (await candidate.count()) {
        await candidate.click();
        break;
      }
    }
    await editorPage.getByRole('button', { name: '文字', exact: true }).click();
    const titleInputs = editorPage.getByRole('textbox', { name: '主标题' });
    const titleCount = await titleInputs.count();
    let titleInput = null;
    for (let index = 0; index < titleCount; index += 1) {
      const candidate = titleInputs.nth(index);
      if (await candidate.isVisible()) {
        titleInput = candidate;
        break;
      }
    }
    if (!titleInput) throw new Error(`可见的主标题输入不存在，共 ${titleCount} 个`);
    await titleInput.click();
    await titleInput.press('End');
    await editorPage.keyboard.type('补');
    await titleInput.press('Tab');
    unsaved = await editorPage.getByText('有未保存修改').first().isVisible().catch(() => false);
    checks.unsavedObserved = unsaved;
    await editorPage.screenshot({ path: join(shotDir, 'editor-unsaved.png') });
    note('editor-unsaved', { unsaved, titleCount });
  } catch (error) {
    await editorPage.screenshot({ path: join(shotDir, 'editor-blocked.png') }).catch(() => undefined);
    note('editor-blocked', {
      url: editorPage.url(),
      message: error instanceof Error ? error.message.split('\n')[0] : 'editor-failed',
    });
  }
  await browser.close();
  browser = undefined;
}

async function main() {
  Object.assign(checks, {
    staffLogin: false,
    uploadBoth: false,
    libraryReread: false,
    save: false,
    reopen: false,
    publish: false,
    publicApi: false,
    desktop3840: false,
    phone941: false,
    coverStable: false,
    editorDevice: false,
    zoomObserved: false,
    unsavedObserved: false,
    byUrlStaff: false,
    byUrlAnonymous: false,
    byUrlCustomer: false,
    byUrlIllegal: false,
    byUrlMissing: false,
    byUrlArchived: false,
    byUrlFileMissingRecovery: false,
    cacheRevokeDb: false,
  });
  if (process.versions.node.split('.')[0] !== '22') fail('必须使用 Node 22');
  if (existsSync(resultPath)) fail('闭环结果文件已存在，拒绝覆盖');
  for (const port of [MYSQL_PORT, API_PORT, WEB_PORT]) assertFree(port);
  const userBefore = Object.fromEntries(USER_PORTS.map((port) => [port, listeningPids(port)]));
  const dockerVersion = docker(['version', '--format', '{{.Server.Version}}'], 30_000);
  if (dockerVersion.status !== 0) fail('本机 Docker 不可用');
  mkdirSync(appDir, { recursive: true });
  mkdirSync(publicRoot, { recursive: true });
  mkdirSync(archiveRoot, { recursive: true });
  mkdirSync(paymentRoot, { recursive: true });
  mkdirSync(productRoot, { recursive: true });
  mkdirSync(backupRoot, { recursive: true });
  mkdirSync(shotDir, { recursive: true });

  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '-e', `MYSQL_ROOT_PASSWORD=${rootPassword}`,
    '-p', `127.0.0.1:${MYSQL_PORT}:3306`,
    '--tmpfs', '/var/lib/mysql:rw,nosuid,nodev',
    MYSQL_IMAGE,
    '--server-id=1',
    '--log-bin=mysql-bin',
    '--log-bin-trust-function-creators=ON',
    '--init-connect=SET collation_connection = utf8mb4_unicode_ci',
  ], 600_000);
  if (started.status !== 0) fail(`隔离数据库容器未启动：${redact(started.stderr || '').slice(0, 240)}`);
  createdContainer = true;
  await waitForMysql();
  mysql(`CREATE DATABASE ${DATABASE_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  mysql(`CREATE USER '${DATABASE_USER}'@'%' IDENTIFIED BY '${databasePassword}';`);
  mysql(`GRANT ALL PRIVILEGES ON ${DATABASE_NAME}.* TO '${DATABASE_USER}'@'%'; FLUSH PRIVILEGES;`);
  const collation = mysql(`SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${DATABASE_NAME}';`);
  databaseUrl = `mysql://${DATABASE_USER}:${encodeURIComponent(databasePassword)}@127.0.0.1:${MYSQL_PORT}/${DATABASE_NAME}`;
  const parsed = new URL(databaseUrl);
  if (parsed.pathname !== `/${DATABASE_NAME}` || parsed.hostname !== '127.0.0.1') fail('隔离数据库地址未通过自检');

  const migrateEnv = { ...process.env };
  delete migrateEnv.DATABASE_URL;
  delete migrateEnv.REAL_MYSQL_TEST_DATABASE_URL;
  delete migrateEnv.MEDIA_REAL_MYSQL_URL;
  migrateEnv.DATABASE_URL = databaseUrl;
  const migrate = spawnSync(process.execPath, [
    join(serverDir, 'node_modules', 'prisma', 'build', 'index.js'),
    'migrate', 'deploy',
  ], { cwd: serverDir, env: migrateEnv, encoding: 'utf8', timeout: 300_000 });
  if (migrate.status !== 0) fail(`迁移未完成：${redact(`${migrate.stdout || ''}\n${migrate.stderr || ''}`).slice(-500)}`);

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const selected = await prisma.$queryRaw`SELECT DATABASE() AS db`;
  const selectedName = selected?.[0]?.db;
  if (selectedName !== DATABASE_NAME) fail('连接没有落在本轮隔离库');
  const migrationCount = await prisma.$queryRaw`SELECT COUNT(*) AS total FROM _prisma_migrations`;
  const passwordHash = await bcrypt.hash(loginPassword, 10);
  await prisma.user.createMany({
    data: [
      { username: staffUsername, password: passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      { username: reviewerUsername, password: passwordHash, role: 'ADMIN', status: 'ACTIVE' },
      { username: editorUsername, password: passwordHash, role: 'EDITOR', status: 'ACTIVE' },
    ],
  });
  await prisma.customer.create({
    data: { phone: customerPhone, passwordHash, name: '隔离客户', status: 'ACTIVE' },
  });
  await prisma.siteSetting.create({
    data: {
      key: 'site',
      value: {
        siteName: '隔离验收店铺',
        canonicalBaseUrl: 'https://isolated.example.invalid',
        defaultLocale: 'zh-CN',
        publishedLocales: ['zh-CN'],
      },
    },
  });
  note('database', {
    databaseName: DATABASE_NAME,
    host: '127.0.0.1',
    port: MYSQL_PORT,
    collation,
    migrationCount: Number(migrationCount?.[0]?.total || 0),
    dockerServer: (dockerVersion.stdout || '').trim(),
  });

  const health = await startNest();
  startWeb();
  const webStatus = await waitForWeb();
  note('processes', { health: health.status, webStatus, apiPort: API_PORT, webPort: WEB_PORT });

  const staff = await loginStaff(staffUsername);
  const reviewer = await loginStaff(reviewerUsername);
  const editor = await loginStaff(editorUsername);
  checks.staffLogin = staff.status === 201 && Boolean(staff.token) && staff.role === 'SUPER_ADMIN'
    && reviewer.status === 201 && Boolean(reviewer.token)
    && editor.status === 201 && editor.role === 'EDITOR';
  note('login', {
    staff: staff.status,
    reviewer: reviewer.status,
    editor: editor.status,
    staffRole: staff.role,
    editorRole: editor.role,
    tokensPresent: {
      staff: Boolean(staff.token),
      reviewer: Boolean(reviewer.token),
      editor: Boolean(editor.token),
    },
  });
  if (!checks.staffLogin || !reviewer.token) fail('测试员工登录未完成');

  const anonymousList = await http('/api/upload/media');
  const desktopBuffer = await png(3840, 2160, { r: 236, g: 232, b: 224 });
  const phoneBuffer = await png(941, 1672, { r: 214, g: 206, b: 194 });
  const probeBuffer = await png(64, 64, { r: 180, g: 170, b: 156 });
  const archiveBuffer = await png(48, 48, { r: 120, g: 116, b: 108 });
  const uploaded = {};
  for (const [name, buffer, filename] of [
    ['desktop', desktopBuffer, 'r5-desktop.png'],
    ['phone', phoneBuffer, 'r5-phone.png'],
    ['probe', probeBuffer, 'r5-probe.png'],
    ['archive', archiveBuffer, 'r5-archive.png'],
  ]) {
    const result = await http('/api/upload/image', {
      token: staff.token,
      method: 'POST',
      form: formWith(buffer, filename),
    });
    uploaded[name] = { result, summary: mediaSummary(result.data) };
  }
  const library = await http('/api/upload/media?type=image&pageSize=20', { token: staff.token });
  const libraryItems = Array.isArray(library.data?.list) ? library.data.list.map(mediaSummary) : [];
  checks.uploadBoth = uploaded.desktop.result.status === 201
    && uploaded.phone.result.status === 201
    && /^\/uploads\/page-assets\/[a-f0-9]{64}\.png$/.test(uploaded.desktop.summary?.url || '');
  checks.libraryReread = libraryItems.some((item) => item.url === uploaded.desktop.summary?.url
    && item.metadataStatus === 'measured'
    && item.displayWidth === 3840
    && item.displayHeight === 2160)
    && libraryItems.some((item) => item.url === uploaded.phone.summary?.url
      && item.metadataStatus === 'measured'
      && item.displayWidth === 941
      && item.displayHeight === 1672);
  note('upload', {
    anonymousList: anonymousList.status,
    statuses: Object.fromEntries(Object.entries(uploaded).map(([name, item]) => [name, item.result.status])),
    library: libraryItems,
    ok: checks.uploadBoth && checks.libraryReread,
  });

  const approvals = {};
  for (const name of ['desktop', 'phone', 'probe']) {
    approvals[name] = await authorize(uploaded[name].summary.id, staff.token, reviewer.token);
  }
  note('authorization', approvals);

  const desktopUrl = uploaded.desktop.summary.url;
  const phoneUrl = uploaded.phone.summary.url;
  const puckData = {
    content: [{
      type: '首屏主视觉',
      props: {
        id: 'r5-isolated-hero',
        title: '隔离验收首屏',
        desktopImage: desktopUrl,
        mobileImage: phoneUrl,
        altText: '中性色块测试图',
        actionText: '',
        targetType: 'none',
        productId: 0,
        linkUrl: '',
      },
    }],
    root: { props: {} },
  };
  const metadata = {
    seoTitle: '隔离验收',
    seoDescription: '一次性测试页面，不面向真实客户。',
    ogImage: desktopUrl,
    contentOwner: '隔离验收',
    mediaRights: [
      { assetUrl: desktopUrl, source: '任务生成的中性测试图', authorizationId: 'R5-DESKTOP' },
      { assetUrl: phoneUrl, source: '任务生成的中性测试图', authorizationId: 'R5-PHONE' },
    ],
  };
  const saved = await http('/api/page-modules/document', {
    token: staff.token,
    method: 'PUT',
    json: { pageKey: 'home', locale: 'zh-CN', puckData, metadata },
  });
  const reopened = await http('/api/page-modules/document/admin?pageKey=home&locale=zh-CN', { token: staff.token });
  const reopenedHero = reopened.data?.puckData?.content?.[0]?.props || {};
  checks.save = saved.status === 200 && typeof saved.data?.contentHash === 'string';
  checks.reopen = reopened.status === 200
    && reopenedHero.desktopImage === desktopUrl
    && reopenedHero.mobileImage === phoneUrl
    && reopened.data?.contentHash === saved.data?.contentHash;
  const published = await http('/api/page-modules/document/publish', {
    token: staff.token,
    method: 'PUT',
    json: {
      pageKey: 'home',
      locale: 'zh-CN',
      expectedUpdatedAt: saved.data?.updatedAt,
      expectedContentHash: saved.data?.contentHash,
      selfReviewAcknowledged: true,
    },
  });
  checks.publish = published.status === 200;
  const publicDocument = await http('/api/page-modules/document/published?pageKey=home');
  const facts = publicDocument.data?.mediaFacts || {};
  checks.publicApi = publicDocument.status === 200
    && publicDocument.data?.status === 'PUBLISHED'
    && facts[desktopUrl]?.displayWidth === 3840
    && facts[phoneUrl]?.displayWidth === 941;
  note('page', {
    save: saved.status,
    saveMessage: saved.message,
    reopen: reopened.status,
    reopenImages: { desktop: reopenedHero.desktopImage || null, mobile: reopenedHero.mobileImage || null },
    publish: published.status,
    publishMessage: published.message,
    publicStatus: publicDocument.status,
    documentStatus: publicDocument.data?.status || null,
    factWidths: Object.fromEntries(Object.entries(facts).map(([url, fact]) => [url, fact.displayWidth])),
  });

  if (checks.publicApi) {
    try {
      await browserPass(staff.token, uploaded.desktop.summary, {
        url: phoneUrl,
        hash: phoneUrl.split('/').pop(),
      });
    } catch (error) {
      note('browser-failed', { message: redact(error?.message || error).slice(0, 500) });
      if (browser) await browser.close().catch(() => {});
      browser = undefined;
    }
  }

  const probeUrl = uploaded.probe.summary.url;
  const derived = `${API_ORIGIN}${probeUrl}?width=480&rv=2`;
  const firstDerived = await decodeUrl(derived);
  const secondDerived = await decodeUrl(derived);
  const revoked = await http(`/api/upload/media/${uploaded.probe.summary.id}/authorization/revoke`, {
    token: staff.token,
    method: 'POST',
    json: { expectedRevision: approvals.probe.revision, reason: 'r5 cache authorization propagation' },
  });
  const revocationRow = await prisma.mediaAssetAuthorization.findUnique({
    where: { assetId: uploaded.probe.summary.id },
    select: { revocationStatus: true },
  });
  const afterRevoke = await decodeUrl(derived);
  checks.cacheRevokeDb = firstDerived.status === 200
    && secondDerived.status === 200
    && firstDerived.etag !== ''
    && secondDerived.etag === firstDerived.etag
    && revoked.status >= 200
    && revoked.status < 300
    && revocationRow?.revocationStatus === 'REVOKED'
    && afterRevoke.status === 404
    && afterRevoke.message.includes('素材当前不可公开访问');
  note('cache-revocation', {
    first: { status: firstDerived.status, etag: firstDerived.etag, width: firstDerived.width },
    secondEtag: secondDerived.etag,
    revoke: revoked.status,
    databaseStatus: revocationRow?.revocationStatus || null,
    after: { status: afterRevoke.status, message: afterRevoke.message, etag: afterRevoke.etag },
    ok: checks.cacheRevokeDb,
  });

  const customer = await http('/api/customers/login', {
    method: 'POST',
    json: { phone: customerPhone, password: loginPassword },
  });
  const customerToken = typeof customer.data?.accessToken === 'string' ? customer.data.accessToken : '';
  const byUrl = async (token, url) => http(`/api/upload/media/by-url?url=${encodeURIComponent(url)}`, { token });
  const staffByUrl = await byUrl(staff.token, desktopUrl);
  const editorByUrl = await byUrl(editor.token, desktopUrl);
  const anonymousByUrl = await byUrl('', desktopUrl);
  const customerByUrl = await byUrl(customerToken, desktopUrl);
  const customerUpload = await http('/api/upload/image', {
    token: customerToken,
    method: 'POST',
    form: formWith(probeBuffer, 'customer.png'),
  });
  const blank = await byUrl(staff.token, ' ');
  const external = await byUrl(staff.token, 'https://example.invalid/a.png');
  const missing = await byUrl(staff.token, `/uploads/page-assets/${'ab'.repeat(32)}.png`);
  const archived = await http(`/api/upload/media/${uploaded.archive.summary.id}`, {
    token: staff.token,
    method: 'DELETE',
  });
  const archivedByUrl = await byUrl(staff.token, uploaded.archive.summary.url);
  const recoveryFile = join(publicRoot, uploaded.probe.summary.url.replace(/^\/uploads\//, ''));
  const recoveryCopy = join(tempRoot, 'probe-restore.png');
  if (!existsSync(recoveryFile)) fail('隔离公开目录中找不到刚上传的探测图');
  copyFileSync(recoveryFile, recoveryCopy);
  rmSync(recoveryFile);
  const missingFile = await byUrl(staff.token, probeUrl);
  copyFileSync(recoveryCopy, recoveryFile);
  const restoredFile = await byUrl(staff.token, probeUrl);
  checks.byUrlStaff = staffByUrl.status === 200
    && staffByUrl.data?.metadataStatus === 'measured'
    && editorByUrl.status === 200;
  checks.byUrlAnonymous = anonymousByUrl.status === 401;
  checks.byUrlCustomer = customer.status === 201
    && Boolean(customerToken)
    && customerByUrl.status === 401
    && customerUpload.status === 401;
  checks.byUrlIllegal = blank.status === 400 && blank.message.includes('素材地址无效')
    && external.status === 400;
  checks.byUrlMissing = missing.status === 404 && missing.message.includes('素材不存在');
  checks.byUrlArchived = archived.status === 200
    && archivedByUrl.status === 200
    && archivedByUrl.data?.status === 'ARCHIVED'
    && archivedByUrl.data?.metadataStatus == null;
  checks.byUrlFileMissingRecovery = missingFile.status === 200
    && missingFile.data?.metadataStatus === 'unknown'
    && missingFile.data?.displayWidth == null
    && restoredFile.data?.metadataStatus === 'measured';
  note('by-url', {
    staff: staffByUrl.status,
    editor: editorByUrl.status,
    anonymous: anonymousByUrl.status,
    customerLogin: customer.status,
    customerRead: customerByUrl.status,
    customerUpload: customerUpload.status,
    blank: { status: blank.status, message: blank.message },
    external: { status: external.status, message: external.message },
    missing: { status: missing.status, message: missing.message },
    archived: { status: archived.status, read: archivedByUrl.status, assetStatus: archivedByUrl.data?.status || null },
    fileMissing: missingFile.data?.metadataStatus || null,
    fileRestored: restoredFile.data?.metadataStatus || null,
  });

  const userAfter = Object.fromEntries(USER_PORTS.map((port) => [port, listeningPids(port)]));
  const passed = Object.values(checks).every(Boolean);
  const output = {
    generatedAt: new Date().toISOString(),
    acceptanceId: 'r5',
    node: process.version,
    isolation: {
      databaseName: DATABASE_NAME,
      databaseHost: '127.0.0.1',
      mysqlPort: MYSQL_PORT,
      apiPort: API_PORT,
      webPort: WEB_PORT,
      tempRoot,
      businessDatabaseUsed: false,
    },
    userPorts: { before: userBefore, after: userAfter },
    checks,
    passed,
    steps,
    notProven: [
      '数据库瞬时读失败后的自动恢复只由既有直接测试覆盖；完整 Nest 没有安全的故障注入点。',
    ],
  };
  writeFileSync(resultPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ resultPath, passed, checks }, null, 2));
  if (!passed) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  note('stopped', { message: redact(error?.message || error).slice(0, 500) });
  const partial = {
    generatedAt: new Date().toISOString(),
    acceptanceId: 'r5',
    passed: false,
    checks,
    steps,
  };
  if (!existsSync(resultPath)) writeFileSync(resultPath, JSON.stringify(partial, null, 2));
  console.error(redact(error?.message || error));
  process.exitCode = error?.closure ? 2 : 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  killOwned(viteChild, 'vite-child.mjs');
  killOwned(nestChild, 'closure-main.mjs');
  if (prisma) await prisma.$disconnect().catch(() => {});
  if (createdContainer) docker(['rm', '-f', container], 60_000);
  try {
    const canonical = assertExactAcceptanceTempRoot({
      tempRoot,
      acceptanceId: 'r5',
      apiPid: runPid,
    });
    rmSync(canonical, { recursive: true, force: true });
  } catch (error) {
    console.error(`临时目录未删除：${error.message}`);
  }
}
