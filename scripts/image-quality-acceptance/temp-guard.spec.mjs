import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { commandMatchesRun } from './process-guard.mjs';
import { assertExactAcceptanceTempRoot } from './temp-guard.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const stopScript = fileURLToPath(new URL('./stop-isolated-read.mjs', import.meta.url));
const tempBase = realpathSync(tmpdir());
const token = '0123456789abcdef0123456789abcdef';

function runStop(statePath) {
  return spawnSync(process.execPath, [stopScript, '--state', statePath], {
    encoding: 'utf8',
  });
}

describe('acceptance temp guard', () => {
  it('rejects an outside path that only contains the old name fragment', () => {
    const outside = 'G:\\outside-acceptance\\haichuan-image-r4-unrelated';
    assert.equal(existsSync(outside), false);
    assert.throws(
      () => assertExactAcceptanceTempRoot({ tempRoot: outside, acceptanceId: 'r4', apiPid: 1 }),
      /临时目录/,
    );
    assert.equal(existsSync(outside), false);
    assert.equal(existsSync('G:\\outside-acceptance'), false);
  });

  it('rejects a same-named directory outside the system temp root', () => {
    const outside = 'G:\\outside-acceptance\\haichuan-image-r5-4242';
    assert.equal(existsSync(outside), false);
    assert.throws(
      () => assertExactAcceptanceTempRoot({ tempRoot: outside, acceptanceId: 'r5', apiPid: 4242 }),
      /临时目录/,
    );
    assert.equal(existsSync(outside), false);
  });

  it('rejects relative paths, parent traversal, and the temp root itself', () => {
    assert.throws(
      () => assertExactAcceptanceTempRoot({ tempRoot: 'haichuan-image-r5-1', acceptanceId: 'r5', apiPid: 1 }),
      /绝对路径/,
    );
    assert.throws(
      () => assertExactAcceptanceTempRoot({
        tempRoot: `${tempBase}\\..\\haichuan-image-r5-1`,
        acceptanceId: 'r5',
        apiPid: 1,
      }),
      /父目录跳转/,
    );
    assert.throws(
      () => assertExactAcceptanceTempRoot({ tempRoot: tempBase, acceptanceId: 'r5', apiPid: 1 }),
      /临时目录/,
    );
  });

  it('rejects a junction even when the name matches this run', () => {
    const target = join(tempBase, `haichuan-guard-target-${process.pid}`);
    const link = join(tempBase, `haichuan-image-r5-${process.pid}`);
    mkdirSync(target);
    let linked = false;
    try {
      symlinkSync(target, link, 'junction');
      linked = true;
      assert.throws(
        () => assertExactAcceptanceTempRoot({
          tempRoot: link,
          acceptanceId: 'r5',
          apiPid: process.pid,
        }),
        /符号链接或目录联接/,
      );
      assert.equal(existsSync(join(target, 'keep.txt')), false);
    } finally {
      if (linked) unlinkSync(link);
      rmdirSync(target);
    }
  });

  it('accepts only the empty directory this test created under the system temp root', () => {
    const createdPid = process.pid + 100000;
    const created = join(tempBase, `haichuan-image-r5-${createdPid}`);
    mkdirSync(created);
    const sentinel = join(tempBase, `haichuan-guard-sentinel-${process.pid}.txt`);
    writeFileSync(sentinel, 'keep');
    try {
      const canonical = assertExactAcceptanceTempRoot({
        tempRoot: created,
        acceptanceId: 'r5',
        apiPid: createdPid,
      });
      assert.equal(canonical.toLowerCase(), realpathSync(created).toLowerCase());
    } finally {
      rmdirSync(created);
      assert.equal(existsSync(sentinel), true);
      unlinkSync(sentinel);
    }
  });

  it('stop refuses a nested directory and does not delete the sentinel', () => {
    const probe = join(tempBase, `haichuan-stop-probe-${process.pid}`);
    const nested = join(probe, 'haichuan-image-r5-424242');
    const sentinel = join(probe, 'keep.txt');
    const statePath = join(probe, 'bad-state.json');
    mkdirSync(nested, { recursive: true });
    writeFileSync(sentinel, 'keep');
    writeFileSync(statePath, JSON.stringify({
      acceptanceId: 'r5',
      repoRoot,
      runToken: token,
      apiPid: 424242,
      vitePid: null,
      tempRoot: nested,
    }));
    try {
      const result = runStop(statePath);
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}\n${result.stderr}`, /临时目录/);
      assert.equal(existsSync(sentinel), true);
      assert.equal(existsSync(nested), true);
    } finally {
      unlinkSync(sentinel);
      unlinkSync(statePath);
      rmdirSync(nested);
      rmdirSync(probe);
    }
  });

  it('does not treat a generic script fragment as this run', () => {
    assert.equal(commandMatchesRun('node start-isolated-read.mjs', {
      repoRoot,
      runToken: token,
      role: 'api',
    }), false);
    assert.equal(commandMatchesRun(`node ${join(repoRoot, 'scripts', 'image-quality-acceptance', 'start-isolated-read.mjs')}`, {
      repoRoot,
      runToken: token,
      role: 'api',
    }), false);
    const exact = `node ${join(repoRoot, 'scripts', 'image-quality-acceptance', 'start-isolated-read.mjs')} --run-token ${token}`;
    assert.equal(commandMatchesRun(exact, { repoRoot, runToken: token, role: 'api' }), true);
    assert.equal(commandMatchesRun(exact, { repoRoot, runToken: token, role: 'vite' }), false);
  });
});
