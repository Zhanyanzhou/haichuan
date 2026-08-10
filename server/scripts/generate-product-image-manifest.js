/**
 * 商品图片迁移清单生成器。
 *
 * 只读取 client/public/images/products 中的原图，并生成可供后续上传到对象存储的清单。
 * 不会移动、改名、删除、压缩图片，也不会连接数据库。
 *
 * 用法：
 *   node scripts/generate-product-image-manifest.js
 *   node scripts/generate-product-image-manifest.js --hash
 */

const { createHash } = require('crypto');
const { createReadStream } = require('fs');
const fs = require('fs/promises');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(workspaceRoot, 'client', 'public', 'images', 'products');
const outputDir = path.join(workspaceRoot, 'server', 'migration-output');
const outputFile = path.join(outputDir, 'product-images-manifest.json');
const shouldHash = process.argv.includes('--hash');

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function relativeToWorkspace(target) {
  const relativePath = path.relative(workspaceRoot, target);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`路径不在项目目录内：${target}`);
  }
  return relativePath;
}

async function collectImageFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectImageFiles(fullPath));
      continue;
    }

    if (entry.isFile() && contentTypes.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  relativeToWorkspace(sourceDir);
  relativeToWorkspace(outputFile);

  try {
    await fs.access(sourceDir);
  } catch {
    throw new Error(`未找到原图目录：${relativeToWorkspace(sourceDir)}`);
  }

  try {
    await fs.access(outputFile);
    throw new Error(`迁移清单已存在：${relativeToWorkspace(outputFile)}。为避免覆盖，请先人工确认后再处理。`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const imageFiles = (await collectImageFiles(sourceDir)).sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const images = [];
  let totalBytes = 0;

  for (let index = 0; index < imageFiles.length; index += 1) {
    const filePath = imageFiles[index];
    const stat = await fs.stat(filePath);
    const relativePath = path.relative(sourceDir, filePath).split(path.sep).join('/');
    const extension = path.extname(filePath).toLowerCase();
    const digest = shouldHash ? await sha256(filePath) : null;
    totalBytes += stat.size;

    images.push({
      sourcePath: `client/public/images/products/${relativePath}`,
      currentPublicUrl: `/images/products/${relativePath}`,
      contentType: contentTypes.get(extension),
      extension,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: digest,
      suggestedObjectKey: digest
        ? `products/original/sha256/${digest.slice(0, 2)}/${digest}${extension}`
        : `products/original/pending-hash/${relativePath}`,
    });

    if ((index + 1) % 500 === 0 || index + 1 === imageFiles.length) {
      console.log(`已扫描 ${index + 1}/${imageFiles.length} 张图片`);
    }
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    hashIncluded: shouldHash,
    sourceDirectory: 'client/public/images/products',
    imageCount: images.length,
    totalBytes,
    images,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`清单已生成：${relativeToWorkspace(outputFile)}`);
  console.log(`图片数量：${images.length}`);
  console.log(`图片总大小：${totalBytes} bytes`);
  console.log(`SHA-256：${shouldHash ? '已计算' : '未计算，可在完整校验阶段使用 --hash'}`);
}

main().catch((error) => {
  console.error(`生成迁移清单失败：${error.message}`);
  process.exitCode = 1;
});
