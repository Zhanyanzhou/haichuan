import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';

test('素材自审迁移只允许显式确认的同人批准，并保持草稿、审核中和拒绝态约束', async () => {
  const sql = await readFile(resolve(
    'prisma/migrations/20260916174500_allow_audited_media_self_review/migration.sql',
  ), 'utf8');
  const compact = sql.replace(/\s+/g, ' ');

  assert.match(compact, /ADD COLUMN `self_review_acknowledged` BOOLEAN NOT NULL DEFAULT false/);
  assert.match(compact, /`reviewed_by` <> `submitted_by` OR `self_review_acknowledged` = true/);
  assert.match(compact, /`review_status` <> 'DRAFT'.*`self_review_acknowledged` = false/);
  assert.match(compact, /`review_status` <> 'IN_REVIEW'.*`self_review_acknowledged` = false/);
  assert.match(compact, /`review_status` <> 'REJECTED'.*`self_review_acknowledged` = false/);
});
