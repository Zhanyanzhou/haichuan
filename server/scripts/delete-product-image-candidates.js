/**
 * 根据已确认的预览清单删除商品图片候选文件。
 *
 * 仅允许删除 client/public/images/products 内、大小与预览清单一致的 DELETE_CANDIDATE 文件。
 * 用法：node scripts/delete-product-image-candidates.js --execute
 */

const fs = require('fs/promises');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(workspaceRoot, 'client', 'public', 'images', 'products');
const previewFile = path.join(workspaceRoot, 'server', 'migration-output', 'product-image-retention-preview.json');
const resultFile = path.join(workspaceRoot, 'server', 'migration-output', 'product-image-deletion-result.json');

function resolveCandidate(sourcePath) {
  const resolved = path.resolve(workspaceRoot, sourcePath);
  const relativePath = path.relative(sourceDir, resolved);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`候选文件不在允许删除的目录内：${sourcePath}`);
  }
  return resolved;
}

async function main() {
  if (!process.argv.includes('--execute')) {
    throw new Error('删除操作需要显式传入 --execute。');
  }

  try {
    await fs.access(resultFile);
    throw new Error(`删除结果已存在：${path.relative(workspaceRoot, resultFile)}。为避免重复执行，操作已停止。`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const preview = JSON.parse(await fs.readFile(previewFile, 'utf8'));
  const candidates = preview.images.filter((image) => image.action === 'DELETE_CANDIDATE');
  const deleted = [];
  const skipped = [];

  for (const candidate of candidates) {
    const filePath = resolveCandidate(candidate.sourcePath);

    try {
      const stat = await fs.stat(filePath);
      if (stat.size !== candidate.sizeBytes) {
        skipped.push({ sourcePath: candidate.sourcePath, reason: '文件大小与预览清单不一致' });
        continue;
      }

      await fs.unlink(filePath);
      deleted.push(candidate.sourcePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        skipped.push({ sourcePath: candidate.sourcePath, reason: '文件不存在' });
      } else {
        skipped.push({ sourcePath: candidate.sourcePath, reason: error.message });
      }
    }

    if ((deleted.length + skipped.length) % 500 === 0 || deleted.length + skipped.length === candidates.length) {
      console.log(`已处理 ${deleted.length + skipped.length}/${candidates.length} 个候选文件`);
    }
  }

  const result = {
    version: 1,
    executedAt: new Date().toISOString(),
    sourceDirectory: 'client/public/images/products',
    rule: preview.rule,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    deleted,
    skipped,
  };

  await fs.writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`删除完成：${deleted.length} 个文件`);
  console.log(`跳过：${skipped.length} 个文件`);
  console.log(`结果清单：${path.relative(workspaceRoot, resultFile)}`);
}

main().catch((error) => {
  console.error(`删除失败：${error.message}`);
  process.exitCode = 1;
});
