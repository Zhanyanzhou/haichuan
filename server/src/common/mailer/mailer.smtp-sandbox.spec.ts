import assert from 'node:assert/strict';
import test from 'node:test';
import { MailerService } from './mailer.service';
import {
  createLoopbackSmtpConfig,
  startLoopbackSmtpSandbox,
} from './smtp-loopback-sandbox.test-support';

test('MailerService 可通过回环 SMTP 沙箱完成真实协议投递', async () => {
  const sandbox = await startLoopbackSmtpSandbox();
  try {
    const service = new MailerService(createLoopbackSmtpConfig(sandbox.port));

    assert.equal(service.isConfigured(), true);
    assert.deepEqual(
      await service.send(
        {
          to: 'recipient@example.test',
          subject: 'Local SMTP sandbox proof',
          html: '<p>loopback-only delivery</p>',
        },
        { idempotencyKey: 'mail:sandbox:1' },
      ),
      { delivered: true },
    );

    assert.ok(sandbox.capture.commands.some((line) => /^EHLO\s/i.test(line)));
    assert.ok(sandbox.capture.commands.some((line) => /^AUTH\s/i.test(line)));
    assert.ok(
      sandbox.capture.commands.some(
        (line) => line.toLowerCase() === 'mail from:<sender@example.test>',
      ),
    );
    assert.ok(
      sandbox.capture.commands.some(
        (line) => line.toLowerCase() === 'rcpt to:<recipient@example.test>',
      ),
    );
    assert.match(sandbox.capture.message, /^Subject: Local SMTP sandbox proof$/m);
    assert.match(sandbox.capture.message, /Content-Type: text\/html/i);
    assert.match(sandbox.capture.message, /loopback-only delivery/i);
  } finally {
    await sandbox.close();
  }
});

test('SMTP 明确拒收归类为确定失败而非结果待确认', async () => {
  const sandbox = await startLoopbackSmtpSandbox({ rejectRecipient: true });
  try {
    const service = new MailerService(createLoopbackSmtpConfig(sandbox.port));

    assert.deepEqual(
      await service.send(
        {
          to: 'rejected@example.test',
          subject: 'Rejected SMTP sandbox proof',
          html: '<p>must not be accepted</p>',
        },
        { idempotencyKey: 'mail:sandbox:rejected' },
      ),
      { delivered: false, reason: 'send_failed' },
    );
    assert.ok(
      sandbox.capture.commands.some(
        (line) => line.toLowerCase() === 'rcpt to:<rejected@example.test>',
      ),
    );
    assert.equal(
      sandbox.capture.commands.some((line) => /^DATA(?:\s|$)/i.test(line)),
      false,
    );
    assert.equal(sandbox.capture.message, '');
  } finally {
    await sandbox.close();
  }
});

test('DATA 已发送但确认回包丢失时结果待确认且不盲目重试', async () => {
  const sandbox = await startLoopbackSmtpSandbox({ dropAfterData: true });
  try {
    const service = new MailerService(createLoopbackSmtpConfig(sandbox.port));

    assert.deepEqual(
      await service.send(
        {
          to: 'unknown-result@example.test',
          subject: 'Unknown SMTP sandbox proof',
          html: '<p>ack-loss-proof</p>',
        },
        { idempotencyKey: 'mail:sandbox:unknown-result' },
      ),
      { delivered: false, reason: 'result_unknown' },
    );
    assert.match(sandbox.capture.message, /ack-loss-proof/i);
    assert.equal(
      sandbox.capture.commands.filter((line) => /^EHLO\s/i.test(line)).length,
      1,
    );
  } finally {
    await sandbox.close();
  }
});
