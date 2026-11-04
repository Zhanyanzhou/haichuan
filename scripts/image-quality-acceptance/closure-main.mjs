/**
 * 完整 Nest 的启动门禁。只核对数据库名和公开目录是否落在本次隔离范围内，
 * 不打印连接串。核对失败时直接退出，不加载 AppModule。
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(2);
}

const expectedName = process.env.HAICHUAN_EXPECT_DATABASE_NAME || '';
const nestMain = process.env.HAICHUAN_NEST_MAIN || '';
const expectedPublicRoot = process.env.HAICHUAN_EXPECT_PUBLIC_ROOT || '';
const expectedCwd = process.env.HAICHUAN_EXPECT_CWD || '';
if (!/^haichuan_image_r5$/.test(expectedName)) fail('隔离数据库名称未确认');
const nestMainNormalized = nestMain.replaceAll('/', '\\');
if (!isAbsolute(nestMain) || !nestMainNormalized.endsWith('\\server\\dist\\main.js')) {
  fail('Nest 入口未确认');
}

let database;
try {
  database = new URL(process.env.DATABASE_URL || '');
} catch {
  fail('隔离数据库地址无效');
}
if (database.protocol !== 'mysql:') fail('隔离数据库协议不符');
if (database.hostname !== '127.0.0.1' && database.hostname !== 'localhost') fail('隔离数据库不在本机');
if (database.pathname !== `/${expectedName}`) fail('隔离数据库名称不符');
if (database.search || database.hash) fail('隔离数据库地址包含额外参数');

let cwdReal;
let expectedCwdReal;
let publicReal;
let expectedPublicReal;
try {
  cwdReal = realpathSync(process.cwd());
  expectedCwdReal = realpathSync(expectedCwd);
  publicReal = realpathSync(process.env.PUBLIC_MEDIA_ROOT || '');
  expectedPublicReal = realpathSync(expectedPublicRoot);
} catch {
  fail('隔离目录无法确认');
}
if (cwdReal !== expectedCwdReal) fail('工作目录不是本次隔离目录');
if (publicReal !== expectedPublicReal) fail('公开素材目录不是本次隔离目录');
const privateRoot = resolve(cwdReal, 'private-media');
const fromPrivate = relative(privateRoot, publicReal);
if (fromPrivate === '' || (!fromPrivate.startsWith(`..${sep}`) && fromPrivate !== '..' && !isAbsolute(fromPrivate))) {
  fail('公开素材目录与私有目录重叠');
}

await import(pathToFileURL(nestMain).href);
