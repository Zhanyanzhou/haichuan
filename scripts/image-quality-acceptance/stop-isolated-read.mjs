/**
 * 只关闭本次图片质量验收启动的进程，并删除它自己创建的临时目录。
 *
 * node scripts/image-quality-acceptance/stop-isolated-read.mjs
 * node scripts/image-quality-acceptance/stop-isolated-read.mjs --state <状态文件>
 *
 * 状态、仓库、本轮身份或临时目录有任何一项对不上，直接报错退出。
 * 不按端口结束进程，也不按目录名片段清理。
 */
import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { ACCEPTANCE_ID, USER_API_PORT, USER_WEB_PORT } from './boundary.mjs';
import { commandLine, commandMatchesRun, listeningPids } from './process-guard.mjs';
import { assertAcceptanceState } from './temp-guard.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const stateFlag = process.argv.indexOf('--state');
const statePath = stateFlag >= 0
  ? resolve(process.argv[stateFlag + 1] || '')
  : join(repoRoot, '.codex-tmp', 'image-quality-acceptance', `${ACCEPTANCE_ID}-state.json`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

let rawState;
try {
  rawState = JSON.parse(readFileSync(statePath, 'utf8'));
} catch {
  fail('状态文件无法读取，已停止清理');
}

let state;
try {
  state = assertAcceptanceState(rawState, { repoRoot, acceptanceId: ACCEPTANCE_ID });
} catch (error) {
  fail(error instanceof Error ? error.message : '状态校验失败');
}

const protectedPids = new Set([state.userApiPid, state.userWebPid].filter((pid) => Number.isInteger(pid)));
const stopped = [];
const skipped = [];

for (const entry of [
  { pid: state.apiPid, role: 'api' },
  { pid: state.vitePid, role: 'vite' },
]) {
  if (!Number.isInteger(entry.pid)) continue;
  if (protectedPids.has(entry.pid)) {
    skipped.push({ pid: entry.pid, reason: 'pid matches a user service recorded at startup' });
    continue;
  }
  let command = '';
  try {
    command = commandLine(entry.pid);
  } catch {
    skipped.push({ pid: entry.pid, reason: 'process is already gone or its command line cannot be read' });
    continue;
  }
  if (!command) {
    skipped.push({ pid: entry.pid, reason: 'process is already gone' });
    continue;
  }
  if (!commandMatchesRun(command, { repoRoot, runToken: state.runToken, role: entry.role })) {
    skipped.push({ pid: entry.pid, reason: 'command line is not this acceptance run' });
    continue;
  }
  const result = spawnSync('taskkill', ['/PID', String(entry.pid), '/T', '/F'], { encoding: 'utf8' });
  stopped.push({ pid: entry.pid, exitCode: result.status });
}

rmSync(state.canonicalTempRoot, { recursive: true, force: true });

const userApiPids = listeningPids(USER_API_PORT);
const userWebPids = listeningPids(USER_WEB_PORT);
console.log(JSON.stringify({
  stopped,
  skipped,
  removedTempRoot: state.canonicalTempRoot,
  userApiPidBefore: state.userApiPid ?? null,
  userApiPidsNow: userApiPids,
  userWebPidBefore: state.userWebPid ?? null,
  userWebPidsNow: userWebPids,
}, null, 2));

const userApiSurvived = state.userApiPid == null || userApiPids.includes(state.userApiPid);
const userWebSurvived = state.userWebPid == null || userWebPids.includes(state.userWebPid);
if (!userApiSurvived || !userWebSurvived) {
  console.error('user service pid changed while stopping the acceptance run');
  process.exitCode = 1;
}
