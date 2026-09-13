import { expect, test } from '@playwright/test';

const realEnabled = process.env.MEDIA_VIDEO_REAL_TEST === '1';
const adminUsername = process.env.MEDIA_VIDEO_REAL_USERNAME || '';
const adminPassword = process.env.MEDIA_VIDEO_REAL_PASSWORD || '';

test.describe('页面视频素材真实播放闭环', () => {
  test.skip(!realEnabled, '需要显式启用本任务一次性真实环境');

  test('Chrome 生成的有效 WebM 经真实上传后可播放，归档立即失效且可恢复', async ({ page }) => {
    assertSyntheticCredential(adminUsername, 'MEDIA_VIDEO_REAL_USERNAME');
    assertSyntheticCredential(adminPassword, 'MEDIA_VIDEO_REAL_PASSWORD');

    await page.goto('/admin/login');
    await page.getByPlaceholder('输入用户名').fill(adminUsername);
    await page.getByPlaceholder('输入密码').fill(adminPassword);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/admin(?:\/|$)/);

    const generated = await page.evaluate(async () => {
      const mimeType = ['video/webm;codecs=vp8', 'video/webm']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      if (!mimeType) throw new Error('当前 Chrome 不支持 WebM MediaRecorder');
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D 不可用');
      const stream = canvas.captureStream(12);
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 80_000 });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('MediaRecorder 编码失败'));
      });
      recorder.start(100);
      for (let frame = 0; frame < 18; frame += 1) {
        context.fillStyle = frame % 2 ? '#303030' : '#d8d8d8';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#b59a63';
        context.fillRect(frame * 3 % canvas.width, 12, 8, 24);
        await new Promise((resolve) => setTimeout(resolve, 85));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      return Array.from(bytes);
    });
    expect(generated.length).toBeGreaterThan(100);

    await page.goto('/admin/media');
    const uploadResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith('/api/upload/video') && response.request().method() === 'POST');
    await page.locator('input[type="file"][accept="video/*"]').setInputFiles({
      name: 'chrome-generated-valid.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from(generated),
    });
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(201);
    const uploadEnvelope = await uploadResponse.json() as { data?: { id?: number; url?: string; mimeType?: string } };
    const assetId = Number(uploadEnvelope.data?.id);
    const assetUrl = String(uploadEnvelope.data?.url || '');
    expect(assetId).toBeGreaterThan(0);
    expect(assetUrl).toMatch(/^\/uploads\/page-assets\/[a-f0-9]{64}\.webm$/);
    expect(uploadEnvelope.data?.mimeType).toBe('video/webm');
    await expect(page.getByText('chrome-generated-valid.webm')).toBeVisible();

    await page.getByRole('button', { name: '预览 chrome-generated-valid.webm' }).click();
    const preview = page.getByRole('dialog').locator('video');
    await preview.evaluate((element) => new Promise<void>((resolve, reject) => {
      const video = element as HTMLVideoElement;
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return resolve();
      const timeout = window.setTimeout(() => reject(new Error('等待 canplay 超时')), 10_000);
      video.addEventListener('canplay', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      video.addEventListener('error', () => {
        window.clearTimeout(timeout);
        reject(new Error(`视频解码失败 code=${video.error?.code || 0}`));
      }, { once: true });
      video.load();
    }));
    const mediaState = await preview.evaluate((element) => {
      const video = element as HTMLVideoElement;
      return { readyState: video.readyState, duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight };
    });
    expect(mediaState.readyState).toBeGreaterThanOrEqual(3);
    expect(mediaState.duration).toBeGreaterThan(0);
    expect(mediaState.videoWidth).toBe(64);
    expect(mediaState.videoHeight).toBe(48);

    const publicResponse = await page.request.get(assetUrl);
    expect(publicResponse.status()).toBe(200);
    expect(publicResponse.headers()['content-type']).toContain('video/webm');
    await page.getByRole('button', { name: 'Close' }).click();

    const archiveResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/upload/media/${assetId}`) && response.request().method() === 'DELETE');
    await page.locator('button').filter({ hasText: /^归档$/ }).click();
    await page.getByRole('button', { name: '归档素材' }).click();
    expect((await archiveResponsePromise).status()).toBe(200);
    expect((await page.request.get(assetUrl)).status()).toBe(404);

    await page.locator('.ant-select').filter({ has: page.locator('input[aria-label="素材状态"]') }).click();
    await page.getByText('已归档', { exact: true }).last().click();
    await expect(page.getByText('已归档，公开地址不可访问')).toBeVisible();
    await expect(page.getByRole('button', { name: '恢复素材' })).toBeVisible();

    const restoreResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/upload/media/${assetId}/restore`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: '恢复素材' }).click();
    expect((await restoreResponsePromise).status()).toBe(201);
    expect((await page.request.get(assetUrl)).status()).toBe(200);
  });
});

function assertSyntheticCredential(value: string, key: string) {
  if (!/^[A-Za-z0-9!@#._-]{8,64}$/.test(value)) {
    throw new Error(`${key} 必须是本任务一次性合成凭据`);
  }
}
