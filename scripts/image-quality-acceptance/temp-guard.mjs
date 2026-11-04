/**
 * 停止验收进程前的临时目录校验。
 * 只接受本轮启动创建的那个目录：系统临时目录下、名称含本轮身份和进程号、
 * 不是符号链接或目录联接。失败时抛错，调用方不得再杀进程或递归删除。
 */
import { lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';

function samePath(left, right) {
  if (process.platform === 'win32') return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

export function expectedAcceptanceTempName(acceptanceId, apiPid) {
  return `haichuan-image-${acceptanceId}-${apiPid}`;
}

export function assertExactAcceptanceTempRoot({ tempRoot, acceptanceId, apiPid }) {
  if (typeof acceptanceId !== 'string' || !/^r[0-9]+$/.test(acceptanceId)) {
    throw new Error('验收身份无效');
  }
  if (!Number.isInteger(apiPid) || apiPid <= 0) {
    throw new Error('进程身份无效');
  }
  if (typeof tempRoot !== 'string' || tempRoot.trim() === '') {
    throw new Error('临时目录缺失');
  }
  if (!isAbsolute(tempRoot)) throw new Error('临时目录必须是绝对路径');
  if (tempRoot.split(/[\\/]/).includes('..')) throw new Error('临时目录包含父目录跳转');

  const expectedName = expectedAcceptanceTempName(acceptanceId, apiPid);
  const resolved = resolve(tempRoot);
  if (basename(resolved) !== expectedName) throw new Error('临时目录名称与本轮身份不一致');

  let tempBase;
  try {
    tempBase = realpathSync(tmpdir());
  } catch {
    throw new Error('无法确认系统临时目录');
  }
  if (samePath(resolved, tempBase)) throw new Error('拒绝操作系统临时目录本身');

  let parentReal;
  try {
    parentReal = realpathSync(dirname(resolved));
  } catch {
    throw new Error('临时目录父级无法确认');
  }
  if (!samePath(parentReal, tempBase)) throw new Error('临时目录不在系统临时目录内');

  let listed;
  try {
    listed = lstatSync(resolved);
  } catch {
    throw new Error('临时目录不存在');
  }
  if (listed.isSymbolicLink()) throw new Error('临时目录不能是符号链接或目录联接');

  let targetReal;
  try {
    targetReal = realpathSync(resolved);
  } catch {
    throw new Error('临时目录无法规范化');
  }
  const expectedReal = realpathSync(resolve(tempBase, expectedName));
  if (!samePath(targetReal, expectedReal)) throw new Error('规范化路径与本轮目录不一致');
  if (samePath(targetReal, tempBase)) throw new Error('拒绝操作系统临时目录本身');
  const suffix = targetReal.slice(tempBase.length);
  if (!suffix.startsWith(sep) && !suffix.startsWith('\\') && !suffix.startsWith('/')) {
    throw new Error('临时目录越出系统临时目录');
  }
  return targetReal;
}

export function assertAcceptanceState(state, { repoRoot, acceptanceId }) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('状态文件结构无效');
  }
  if (state.acceptanceId !== acceptanceId) throw new Error('状态文件不是本轮验收');
  if (typeof state.repoRoot !== 'string' || state.repoRoot.trim() === '') {
    throw new Error('状态文件缺少仓库身份');
  }
  let stateRepo;
  let currentRepo;
  try {
    stateRepo = realpathSync(state.repoRoot);
    currentRepo = realpathSync(repoRoot);
  } catch {
    throw new Error('仓库路径无法确认');
  }
  if (stateRepo !== currentRepo) throw new Error('状态文件不属于当前仓库');
  if (typeof state.runToken !== 'string' || !/^[a-f0-9]{32}$/.test(state.runToken)) {
    throw new Error('本轮启动身份无效');
  }
  if (!Number.isInteger(state.apiPid) || state.apiPid <= 0) throw new Error('进程身份无效');
  if (!(state.vitePid == null || (Number.isInteger(state.vitePid) && state.vitePid > 0))) {
    throw new Error('前端进程身份无效');
  }
  const canonicalTempRoot = assertExactAcceptanceTempRoot({
    tempRoot: state.tempRoot,
    acceptanceId,
    apiPid: state.apiPid,
  });
  return { ...state, canonicalTempRoot };
}
