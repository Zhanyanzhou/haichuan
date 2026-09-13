import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMediaPublicEligibility } from './media-public-eligibility';

const now = new Date('2026-09-13T12:00:00.000Z');

test('只有 READY/PUBLIC 且已批准、允许公开、处于有效期内的授权可公开', () => {
  assert.deepEqual(evaluateMediaPublicEligibility({
    assetStatus: 'READY',
    accessLevel: 'PUBLIC',
    authorization: {
      reviewStatus: 'APPROVED',
      revocationStatus: 'ACTIVE',
      publicWebUseAllowed: true,
      validFrom: '2026-09-01T00:00:00.000Z',
      validUntil: '2026-10-01T00:00:00.000Z',
    },
  }, now), { eligible: true, reasons: [] });
});

test('草稿、撤权、未允许公开和已到期分别形成稳定阻断原因', () => {
  const result = evaluateMediaPublicEligibility({
    assetStatus: 'READY',
    accessLevel: 'PUBLIC',
    authorization: {
      reviewStatus: 'DRAFT',
      revocationStatus: 'REVOKED',
      publicWebUseAllowed: false,
      validUntil: now,
    },
  }, now);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, [
    'AUTHORIZATION_NOT_APPROVED',
    'AUTHORIZATION_REVOKED',
    'PUBLIC_WEB_USE_NOT_ALLOWED',
    'AUTHORIZATION_EXPIRED',
  ]);
});

test('缺少授权不能因素材文件已就绪而公开', () => {
  assert.deepEqual(evaluateMediaPublicEligibility({
    assetStatus: 'READY',
    accessLevel: 'PUBLIC',
    authorization: null,
  }, now), { eligible: false, reasons: ['AUTHORIZATION_MISSING'] });
});
