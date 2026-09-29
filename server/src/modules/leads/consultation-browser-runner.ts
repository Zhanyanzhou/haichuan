import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { runOwnedChild, terminateOwnedChildTree } = require('../../../scripts/run-real-mysql-tests.cjs');

/** 仅由一次性数据库验收调用：复用真实前端配置，但从空 env 目录启动 Vite。 */
export async function runConsultationBrowserJourney(input: {
  apiOrigin: string;
  productCode: string;
  selectionProductCode: string;
  customerPhone: string;
  password: string;
  staffUsername: string;
}) {
  assert.equal(process.env.CONSULTATION_REAL_MYSQL_TEST, '1');
  assert.equal(process.env.REAL_MYSQL_TEST_ISOLATED, '1');
  const apiUrl = new URL(input.apiOrigin);
  assert.equal(apiUrl.protocol, 'http:');
  assert.equal(apiUrl.hostname, '127.0.0.1');
  assert.equal(apiUrl.origin, input.apiOrigin);
  const clientRoot = resolve(__dirname, '../../../../client');
  const outputRoot = resolve(clientRoot, '../.codex-tmp');
  await mkdir(outputRoot, { recursive: true });
  const runRoot = await mkdtemp(resolve(outputRoot, 'consultation-browser-'));
  const envDir = resolve(runRoot, 'env');
  await mkdir(envDir);
  const viteEntry = pathToFileURL(resolve(clientRoot, 'node_modules/vite/dist/node/index.js')).href;
  const script = [
    `const { createServer } = await import(${JSON.stringify(viteEntry)});`,
    `const server = await createServer({`,
    ` root: ${JSON.stringify(clientRoot)}, envDir: ${JSON.stringify(envDir)},`,
    ` configFile: ${JSON.stringify(resolve(clientRoot, 'vite.config.ts'))},`,
    ` mode: 'development', server: { host: '127.0.0.1', port: 0, strictPort: false },`,
    `});`,
    `await server.listen();`,
    `console.log('CONSULTATION_VITE_PORT:' + server.httpServer.address().port);`,
  ].join('\n');
  const platformKeys = new Set([
    'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ',
  ]);
  const platformEnvironment = Object.fromEntries(Object.entries(process.env)
    .filter(([key, value]) => platformKeys.has(key.toUpperCase()) && value !== undefined));
  const frontEnvironment = {
    ...platformEnvironment,
    CI: 'true',
    VITE_API_BASE_URL: '/api',
    VITE_DEV_API_PROXY: input.apiOrigin,
    VITE_ANALYTICS_ENABLED: 'false',
    VITE_USE_MOCK: 'false',
  };
  let vite: ChildProcess | undefined;
  let viteOutput = '';
  const previousCorsOrigin = process.env.CORS_ORIGIN;
  try {
    vite = spawn(process.execPath, [
      '--require', resolve(__dirname, '../../../scripts/exit-with-parent.cjs'),
      '--input-type=module', '--eval', script,
    ], {
      // 项目 Vite 配置使用 process.cwd() 加载 env，不能将 cwd 指向 client。
      cwd: envDir,
      env: { ...frontEnvironment, HAICHUAN_EXIT_WITH_PARENT_OWNER: '1' },
      windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const frontOrigin = await new Promise<string>((resolveReady, reject) => {
      const child = vite!;
      let output = '';
      const timeout = setTimeout(() => reject(new Error('CONSULTATION_VITE_START_TIMEOUT')), 45_000);
      child.stdout?.on('data', (chunk) => {
        viteOutput = (viteOutput + String(chunk)).slice(-64 * 1024);
        output = (output + String(chunk)).slice(-4096);
        const port = /CONSULTATION_VITE_PORT:(\d+)/.exec(output)?.[1];
        if (port) {
          clearTimeout(timeout);
          resolveReady(`http://127.0.0.1:${port}`);
        }
      });
      child.stderr?.on('data', (chunk) => {
        viteOutput = (viteOutput + String(chunk)).slice(-64 * 1024);
      });
      child.once('error', () => {
        clearTimeout(timeout);
        reject(new Error('CONSULTATION_VITE_SPAWN_FAILED'));
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`CONSULTATION_VITE_EXIT:${code}`));
      });
    });
    process.env.CORS_ORIGIN = frontOrigin;
    const safeOutput: string[] = [];
    const capture = (chunk: string) => safeOutput.push(String(chunk)
      .replaceAll(input.password, '[REDACTED]')
      .replaceAll(input.customerPhone, '[SYNTHETIC_CUSTOMER]')
      .replaceAll(input.staffUsername, '[SYNTHETIC_STAFF]'));
    let browserRun: { status: number | null; stdout: string };
    try {
      browserRun = await runOwnedChild([
        resolve(clientRoot, 'node_modules/@playwright/test/cli.js'),
        'test', 'consultation-real-closure.spec.ts', '--project=customer-chromium',
        '--reporter=line', '--workers=1', '--retries=0',
        `--output=${resolve(runRoot, 'test-results')}`,
      ], {
        cwd: clientRoot,
        timeoutMs: 240_000,
        exitWithParent: true,
        // Linux 只终止 CLI，让 Playwright worker 收到 IPC disconnect 后关闭浏览器。
        // Windows 仍使用已验证的自有进程树终止。
        terminate: process.platform === 'win32' ? terminateOwnedChildTree
          : (child: ChildProcess) => child.kill('SIGKILL'),
        env: {
          ...frontEnvironment,
          PLAYWRIGHT_BASE_URL: frontOrigin,
          PLAYWRIGHT_APP_MODE: 'development',
          CONSULTATION_REAL_E2E: '1',
          CONSULTATION_REAL_PRODUCT_CODE: input.productCode,
          CONSULTATION_REAL_SELECTION_PRODUCT_CODE: input.selectionProductCode,
          CONSULTATION_REAL_CUSTOMER_PHONE: input.customerPhone,
          CONSULTATION_REAL_PASSWORD: input.password,
          CONSULTATION_REAL_STAFF_USERNAME: input.staffUsername,
        },
        writeStdout: capture, writeStderr: capture,
      });
    } finally {
      await writeFile(resolve(runRoot, 'browser-result.log'), safeOutput.join(''), { flag: 'wx' });
    }
    assert.equal(browserRun.status, 0, 'CONSULTATION_BROWSER_JOURNEY_FAILED');
    assert.match(browserRun.stdout, /2 passed/, '桌面与手机必须全部执行通过');
    assert.doesNotMatch(browserRun.stdout, /\d+ skipped/);
    console.log(`CONSULTATION_BROWSER_PASS: desktop + mobile; artifacts=${runRoot}`);
  } finally {
    if (previousCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousCorsOrigin;
    try {
      if (vite) {
        const child = vite;
        if (child.exitCode === null && child.signalCode === null) {
          assert.equal(terminateOwnedChildTree(child), true, 'CONSULTATION_VITE_CLEANUP_FAILED');
          // Linux 组终止异步生效：等待 close 落地（有界），超时则直接走下面的强制清理。
          await new Promise<void>((settled) => {
            const guard = setTimeout(settled, 5_000);
            child.once('close', () => { clearTimeout(guard); settled(); });
          });
        }
        // 无论 EOF 是否到达都强制关闭父侧句柄：幸存的孙进程（如 esbuild）持有管道
        // 写端时，stdout/stderr 永远等不到 EOF，打开的流与 IPC 通道会把 node --test
        // 子进程的事件循环吊住，表现为测试通过后进程挂起（CI Linux 实测 300s 超时）。
        child.stdout?.destroy();
        child.stderr?.destroy();
        try { child.disconnect(); } catch { /* 通道已关闭时 disconnect 抛错，清理路径忽略 */ }
      }
    } finally {
      await writeFile(resolve(runRoot, 'vite-startup.log'), viteOutput, { flag: 'wx' });
      console.log(`CONSULTATION_BROWSER_ARTIFACTS: ${runRoot}`);
      // 挂起诊断：unref 定时器本身不持有事件循环，正常退出时永不触发；仅当循环在
      // 清理后仍被未知句柄吊住时，20 秒后打印活跃句柄类型清单，供 CI 日志定位根因。
      const hangGuard = setTimeout(() => {
        const active = ((process as unknown as { _getActiveHandles?: () => unknown[] })
          ._getActiveHandles?.() ?? [])
          .filter((handle) => handle !== hangGuard)
          .map((handle) => (handle as object)?.constructor?.name ?? String(typeof handle));
        console.error(`CONSULTATION_HANG_DIAGNOSTIC active_handles=[${active.join(',')}]`);
      }, 20_000);
      hangGuard.unref();
    }
  }
}
