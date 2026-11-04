/**
 * 验收 127.0.0.1:3018 / 5176 上的本次隔离读取。
 *
 * node scripts/image-quality-acceptance/verify-isolated-read.mjs
 *
 * 先启动 start-isolated-read.mjs。本脚本只发 GET，外加一次只翻转内存快照的
 * POST /acceptance/stub-revocation。不上传、不保存、不发布。
 * 证据默认写入 cursor-acceptance-r5-runtime.json。已有记录不会被覆盖。
 * 可用 --evidence <新文件> 指定本次输出。
 * 图片尺寸来自响应字节解码，不采用 naturalWidth 或 URL 参数作为结论。
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ACCEPTANCE_ID, API_PORT, WEB_PORT } from './boundary.mjs';
import { commandLine, commandMatchesRun, listeningPids } from './process-guard.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const researchDir = resolve(repoRoot, 'docs', 'research', 'image-quality-2026-11-04');
const protectedEvidence = new Set([
  'cursor-acceptance-r4-runtime.json',
  'cursor-acceptance-r4-evidence.json',
  'cursor-acceptance-r4.md',
  'cursor-acceptance-r3.md',
  'cursor-acceptance-r3-evidence.json',
  'cursor-acceptance-r2.md',
  'cursor-acceptance-r2-evidence.json',
]);
const evidenceFlag = process.argv.indexOf('--evidence');
const requestedEvidence = evidenceFlag >= 0
  ? process.argv[evidenceFlag + 1]
  : join(researchDir, 'cursor-acceptance-r5-runtime.json');
if (!requestedEvidence) {
  console.error('缺少验收输出路径');
  process.exit(2);
}
const evidencePath = resolve(requestedEvidence);
if (!evidencePath.startsWith(`${researchDir}${sep}`) && !evidencePath.startsWith(`${researchDir}/`)) {
  console.error('验收输出必须位于本轮研究目录');
  process.exit(2);
}
if (protectedEvidence.has(basename(evidencePath)) || existsSync(evidencePath)) {
  console.error('拒绝覆盖已有验收记录');
  process.exit(2);
}
const statePath = join(repoRoot, '.codex-tmp', 'image-quality-acceptance', `${ACCEPTANCE_ID}-state.json`);
const disposableDatabase = {
  REAL_MYSQL_TEST_DATABASE_URL: Boolean(process.env.REAL_MYSQL_TEST_DATABASE_URL),
  MEDIA_REAL_MYSQL_URL: Boolean(process.env.MEDIA_REAL_MYSQL_URL),
};
const notRun = [];
const requireFromClient = createRequire(join(repoRoot, 'client', 'package.json'));
const requireFromServer = createRequire(join(repoRoot, 'server', 'package.json'));
const { chromium } = requireFromClient('playwright');
const sharp = requireFromServer('sharp');

const api = `http://127.0.0.1:${API_PORT}`;
const web = `http://127.0.0.1:${WEB_PORT}`;
const checks = [];
const documents = {};
const scenes = {};

function record(name, ok, detail) {
  checks.push({ name, ok, ...detail });
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

function identityOf(response) {
  return {
    acceptance: response.headers.get('x-haichuan-image-acceptance'),
    pid: response.headers.get('x-haichuan-image-acceptance-pid'),
    code: response.headers.get('x-haichuan-image-code'),
    dist: response.headers.get('x-haichuan-image-dist'),
  };
}

async function decodeUrl(url) {
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const decoded = bytes.length > 0 ? await sharp(bytes).metadata() : {};
  return {
    url,
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: bytes.length,
    width: decoded.width ?? null,
    height: decoded.height ?? null,
    format: decoded.format ?? null,
    etag: response.headers.get('etag'),
    identity: identityOf(response),
  };
}

function directUrl(currentSrc) {
  const parsed = new URL(currentSrc);
  return `${api}${parsed.pathname}${parsed.search}`;
}

function descriptorFor(srcset, currentSrc) {
  if (!srcset) return null;
  const current = new URL(currentSrc);
  for (const part of srcset.split(',')) {
    const match = part.trim().match(/^(\S+)\s+(\d+)w$/);
    if (!match) continue;
    const candidate = new URL(match[1], currentSrc);
    if (candidate.pathname === current.pathname && candidate.search === current.search) return Number(match[2]);
  }
  return null;
}

async function collect(page) {
  return page.evaluate(() => [...document.querySelectorAll('img')].flatMap((img) => {
    if (!img.currentSrc.includes('/uploads/')) return [];
    const picture = img.parentElement?.tagName === 'PICTURE' ? img.parentElement : null;
    return [{
      currentSrc: img.currentSrc,
      sizes: img.getAttribute('sizes'),
      srcset: img.getAttribute('srcset'),
      sourceSrcsets: picture ? [...picture.querySelectorAll('source')].map((source) => source.getAttribute('srcset')) : [],
      naturalWidthNotProof: img.naturalWidth,
      box: img.getBoundingClientRect().toJSON(),
    }];
  }));
}

async function waitForUploads(page) {
  await page.waitForFunction(() => [...document.images].some((img) =>
    img.complete && img.naturalWidth > 0 && img.currentSrc.includes('/uploads/')), undefined, { timeout: 25000 });
}

async function waitForDecodedTier(page, storageKey) {
  await page.waitForFunction((key) => [...document.images].some((img) =>
    img.complete
    && img.naturalWidth > 0
    && img.currentSrc.includes(key)
    && img.currentSrc.includes('width=3840')), storageKey, { timeout: 60000 });
}

const state = JSON.parse(readFileSync(statePath, 'utf8'));
const codeVersion = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const distHashes = {
  uploadService: createHash('sha256').update(readFileSync(join(repoRoot, 'server', 'dist', 'modules', 'upload', 'upload.service.js'))).digest('hex'),
  gateway: createHash('sha256').update(readFileSync(join(repoRoot, 'server', 'dist', 'modules', 'upload', 'public-uploads.gateway.js'))).digest('hex'),
  pageModules: createHash('sha256').update(readFileSync(join(repoRoot, 'server', 'dist', 'modules', 'page-modules', 'page-modules.service.js'))).digest('hex'),
};
const distFingerprint = createHash('sha256').update(JSON.stringify(distHashes)).digest('hex');
const apiCommand = commandLine(state.apiPid);
const viteCommand = commandLine(state.vitePid);

let health;
try {
  health = await (await fetch(`${api}/acceptance/health`)).json();
} catch (error) {
  record('isolated server reachable', false, { error: error.message });
  writeEvidence(2);
  process.exit(2);
}

record('runtime identity matches git and dist', (
  health.pid === state.apiPid
  && health.codeVersion === codeVersion
  && health.distFingerprint === distFingerprint
  && health.distHashes.uploadService === distHashes.uploadService
  && health.distHashes.gateway === distHashes.gateway
  && health.distHashes.pageModules === distHashes.pageModules
  && commandMatchesRun(apiCommand, { repoRoot, runToken: state.runToken, role: 'api' })
  && commandMatchesRun(viteCommand, { repoRoot, runToken: state.runToken, role: 'vite' })
  && listeningPids(API_PORT).includes(state.apiPid)
  && listeningPids(WEB_PORT).includes(state.vitePid)
), { healthPid: health.pid, codeVersion, distFingerprint, apiCommand, viteCommand });

for (const [name, url] of [
  ['defaultLocale', `${api}/api/page-modules/document/published?pageKey=home`],
  ['zhCN', `${api}/api/page-modules/document/published?pageKey=home&locale=zh-CN`],
]) {
  const { response, body } = await getJson(url);
  const facts = body?.data?.mediaFacts;
  const valid = response.status === 200
    && body?.message === 'success'
    && body?.data?.locale === 'zh-CN'
    && body?.data?.status === 'PUBLISHED'
    && facts && typeof facts === 'object'
    && Object.values(facts).every((fact) => fact.displayWidth > 0 && fact.displayHeight > 0 && typeof fact.revision === 'string');
  documents[name] = {
    status: response.status,
    identity: identityOf(response),
    locale: body?.data?.locale ?? null,
    documentStatus: body?.data?.status ?? null,
    factCount: facts ? Object.keys(facts).length : 0,
  };
  record(`${name} document has mediaFacts`, valid && documents[name].identity.acceptance === ACCEPTANCE_ID && documents[name].identity.code === codeVersion, documents[name]);
}

const facts = (await getJson(`${api}/api/page-modules/document/published?pageKey=home`)).body.data.mediaFacts;
const factEntries = Object.entries(facts).map(([url, fact]) => ({
  storageKey: url.slice('/uploads/'.length),
  ...fact,
}));
const wide = factEntries.find((fact) => fact.displayWidth >= 3840);
const phone = factEntries.find((fact) => fact.displayWidth === 941) ?? factEntries.find((fact) => fact.displayWidth < 1200);

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(web, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForUploads(desktopPage);
  if (wide?.storageKey) await waitForDecodedTier(desktopPage, wide.storageKey);
  scenes.desktop = await prove(desktopPage, wide);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(web, { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (let step = 0; step < 8; step += 1) {
    await mobilePage.mouse.wheel(0, 900);
    await mobilePage.waitForTimeout(350);
  }
  await mobilePage.waitForFunction(() => {
    const images = [...document.images].filter((img) => img.currentSrc.includes('/uploads/') || img.src.includes('/uploads/'));
    return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0 && img.currentSrc.includes('/uploads/'));
  }, undefined, { timeout: 30000 });
  const mobileImages = await collect(mobilePage);
  const mobileDecoded = [];
  for (const image of mobileImages) {
    const decoded = await decodeUrl(directUrl(image.currentSrc));
    const descriptor = descriptorFor([image.srcset, ...image.sourceSrcsets].filter(Boolean).join(', '), image.currentSrc);
    mobileDecoded.push({ ...decoded, descriptor, sizes: image.sizes, naturalWidthNotProof: image.naturalWidthNotProof });
  }
  scenes.mobile = mobileDecoded;
  await mobile.close();

  const cover = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 2 });
  const coverPage = await cover.newPage();
  await coverPage.goto(web, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForUploads(coverPage);
  if (wide?.storageKey) {
    await coverPage.waitForFunction((storageKey) => [...document.images].some((img) =>
      img.complete && img.naturalWidth > 0 && img.currentSrc.includes(storageKey)), wide.storageKey, { timeout: 25000 });
  }
  scenes.coverProbe = await coverPage.evaluate((storageKey) => {
    const img = [...document.images].find((node) => node.currentSrc.includes(storageKey));
    const parent = img?.parentElement;
    if (!img || !parent) return { found: false };
    const before = { sizes: img.getAttribute('sizes'), currentSrc: img.currentSrc };
    parent.style.width = '700px';
    parent.style.height = '1200px';
    parent.style.aspectRatio = 'auto';
    return { found: true, before, geometryProbe: true, savedTemplateLayout: false };
  }, wide?.storageKey ?? '');
  if (scenes.coverProbe.found) {
    await coverPage.waitForFunction((storageKey) => {
      const img = [...document.images].find((node) => node.currentSrc.includes(storageKey));
      return Boolean(img && img.currentSrc.includes('width=3840'));
    }, wide.storageKey, { timeout: 8000 }).catch(() => undefined);
    const after = await coverPage.evaluate((storageKey) => {
      const img = [...document.images].find((node) => node.currentSrc.includes(storageKey));
      return img ? {
        currentSrc: img.currentSrc,
        sizes: img.getAttribute('sizes'),
        srcset: img.getAttribute('srcset'),
        naturalWidthNotProof: img.naturalWidth,
      } : null;
    }, wide.storageKey);
    scenes.coverProbe.after = after;
    if (after?.currentSrc) scenes.coverProbe.decoded = await decodeUrl(directUrl(after.currentSrc));
  }
  await cover.close();
} finally {
  await browser.close();
}

record('desktop 1920 CSS at 2x selects decoded 3840', Boolean(
  scenes.desktop
  && scenes.desktop.decoded?.width === 3840
  && scenes.desktop.decoded?.format === 'webp'
  && scenes.desktop.decoded?.identity.acceptance === ACCEPTANCE_ID
  && scenes.desktop.decoded?.identity.pid === String(state.apiPid)
  && scenes.desktop.currentSrc.includes('width=3840')
), scenes.desktop ?? { missing: true });

const phoneMatch = scenes.mobile.find((image) => image.width === 941 && image.descriptor === 941);
record('941 descriptor matches decoded pixels and is not enlarged', Boolean(
  phoneMatch
  && phoneMatch.format === 'webp'
  && phoneMatch.width === 941
  && phoneMatch.descriptor === 941
  && phoneMatch.contentType?.includes('image/webp')
  && phoneMatch.identity.acceptance === ACCEPTANCE_ID
), { phoneMatch: phoneMatch ?? null, observed: scenes.mobile.map((image) => ({ width: image.width, descriptor: image.descriptor, contentType: image.contentType, bytes: image.bytes })) });

record('mobile currentSrc responses are derived webp, not the original png', scenes.mobile.length > 0 && scenes.mobile.every((image) =>
  image.format === 'webp' && image.contentType?.includes('image/webp') && image.identity.acceptance === ACCEPTANCE_ID
), { count: scenes.mobile.length });

const sampleKey = (phone ?? wide)?.storageKey;
const illegal = await fetch(`${api}/uploads/${sampleKey}?width=480&rv=999`);
const illegalText = await illegal.text();
record('illegal rv is rejected', illegal.status === 404 && illegalText.includes('素材不存在') && illegal.headers.get('x-haichuan-image-acceptance') === ACCEPTANCE_ID, {
  status: illegal.status,
  body: illegalText,
  bytes: Buffer.byteLength(illegalText),
  identity: identityOf(illegal),
});

const coverDecoded = scenes.coverProbe?.decoded;
record('cover geometry probe selects 3840 from drawn area', Boolean(
  scenes.coverProbe?.geometryProbe === true
  && scenes.coverProbe?.savedTemplateLayout === false
  && coverDecoded?.width === 3840
  && coverDecoded?.format === 'webp'
  && scenes.coverProbe.after?.sizes
  && Number.parseInt(scenes.coverProbe.after.sizes, 10) > 1400
), scenes.coverProbe ?? { missing: true });

const cacheKey = wide?.storageKey ?? sampleKey;
const first = await decodeUrl(`${api}/uploads/${cacheKey}?width=1680&rv=2`);
const healthAfter = await (await fetch(`${api}/acceptance/health`)).json();
const second = await decodeUrl(`${api}/uploads/${cacheKey}?width=1680&rv=2`);
const beforeDb = await (await fetch(`${api}/acceptance/db-authorization?storageKey=${encodeURIComponent(cacheKey)}`)).json();
const revoked = await fetch(`${api}/acceptance/stub-revocation`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ storageKey: cacheKey, revocationStatus: 'REVOKED' }),
});
const revokedBody = await revoked.json();
const afterRevoke = await fetch(`${api}/uploads/${cacheKey}?width=1680&rv=2`, {
  headers: first.etag ? { 'if-none-match': first.etag } : {},
});
const afterText = await afterRevoke.text();
const afterDb = await (await fetch(`${api}/acceptance/db-authorization?storageKey=${encodeURIComponent(cacheKey)}`)).json();
await fetch(`${api}/acceptance/stub-revocation`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ storageKey: cacheKey, revocationStatus: 'ACTIVE' }),
});
const healthEnd = await (await fetch(`${api}/acceptance/health`)).json();

record('cache hit still checks authorization and does not write revocation', Boolean(
  first.status === 200
  && second.status === 200
  && healthAfter.responsiveMemoryCacheEntries >= 1
  && revokedBody.persistedToDatabase === false
  && afterRevoke.status === 404
  && afterRevoke.headers.get('etag') !== first.etag
  && afterText.includes('素材当前不可公开访问')
  && beforeDb.revocationStatus === afterDb.revocationStatus
  && afterDb.revocationStatus === 'ACTIVE'
  && healthEnd.blockedWrites.length === 0
  && healthEnd.snapshotWriteAttempts.length === 0
), {
  first: { status: first.status, bytes: first.bytes, width: first.width, format: first.format },
  secondStatus: second.status,
  cacheEntries: healthAfter.responsiveMemoryCacheEntries,
  afterRevokeStatus: afterRevoke.status,
  afterRevokeEtag: afterRevoke.headers.get('etag'),
  imageEtag: first.etag,
  afterRevokeBody: afterText,
  databaseRevocationBefore: beforeDb.revocationStatus,
  databaseRevocationAfter: afterDb.revocationStatus,
  blockedWrites: healthEnd.blockedWrites,
  snapshotWriteAttempts: healthEnd.snapshotWriteAttempts,
  absorbedIntegrityUpdates: healthEnd.absorbedIntegrityUpdates,
});

const userApi = await fetch('http://127.0.0.1:3000/api/page-modules/document/published?pageKey=home');
record('user 3000 and 5173 were not replaced', (
  userApi.headers.get('x-haichuan-image-acceptance') == null
  && (state.userApiPid == null || listeningPids(3000).includes(state.userApiPid))
  && (state.userWebPid == null || listeningPids(5173).includes(state.userWebPid))
), {
  userApiStatus: userApi.status,
  userApiHasAcceptanceHeader: userApi.headers.get('x-haichuan-image-acceptance'),
  userApiPid: state.userApiPid,
  userApiPidsNow: listeningPids(3000),
  userWebPid: state.userWebPid,
  userWebPidsNow: listeningPids(5173),
});

if (!disposableDatabase.REAL_MYSQL_TEST_DATABASE_URL && !disposableDatabase.MEDIA_REAL_MYSQL_URL) {
  notRun.push({
    name: 'upload, library save, reopen, test publish, public reread',
    reason: 'No verified disposable database variable is set.',
    unblock: 'Set REAL_MYSQL_TEST_DATABASE_URL or MEDIA_REAL_MYSQL_URL to a database that is confirmed disposable, then rerun only that closed loop.',
  });
  notRun.push({
    name: 'by-url HTTP against a database',
    reason: 'The role, missing, archived, and failure checks run in page-media-by-url.direct.spec.ts against a temporary file and an in-memory staff query.',
    unblock: 'A disposable database is required before sending an authenticated by-url HTTP request.',
  });
}

const failed = checks.some((check) => !check.ok);
writeEvidence(failed ? 1 : 0);
process.exitCode = failed ? 1 : 0;

async function prove(page, fact) {
  if (!fact) return { missingFact: true };
  const images = await collect(page);
  const image = images.find((item) => item.currentSrc.includes(fact.storageKey));
  if (!image) return { missingImage: true, fact, imageCount: images.length };
  const decoded = await decodeUrl(directUrl(image.currentSrc));
  return {
    storageKey: fact.storageKey,
    currentSrc: image.currentSrc,
    sizes: image.sizes,
    descriptor: descriptorFor(image.srcset, image.currentSrc),
    naturalWidthNotProof: image.naturalWidthNotProof,
    decoded,
  };
}

function writeEvidence(exitCode) {
  writeFileSync(evidencePath, JSON.stringify({
    acceptanceId: ACCEPTANCE_ID,
    exitCode,
    generatedAt: new Date().toISOString(),
    commands: {
      start: 'node scripts/image-quality-acceptance/start-isolated-read.mjs',
      verify: 'node scripts/image-quality-acceptance/verify-isolated-read.mjs',
      stop: 'node scripts/image-quality-acceptance/stop-isolated-read.mjs',
    },
    ports: { api: API_PORT, web: WEB_PORT, untouchedUserApi: 3000, untouchedUserWeb: 5173 },
    codeVersion,
    distHashes,
    distFingerprint,
    state,
    checks,
    documents,
    scenes,
    disposableDatabase,
    notRun,
  }, null, 2));
  console.log(JSON.stringify({ evidencePath, exitCode, failed: checks.filter((check) => !check.ok).map((check) => check.name) }, null, 2));
}
