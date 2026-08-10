/**
 * 商品图片保留/删除预览。
 *
 * 规则：只计算文件名中的中文字符，中文标题不少于 10 个字时保留。
 * 该脚本只读取迁移清单并输出预览，不会修改任何图片文件或数据库记录。
 */

const fs = require('fs/promises');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const migrationOutputDir = path.join(workspaceRoot, 'server', 'migration-output');
const manifestFile = path.join(migrationOutputDir, 'product-images-manifest.json');
const previewFile = path.join(migrationOutputDir, 'product-image-retention-preview.json');
const minimumTitleLength = 10;

function relativeToWorkspace(target) {
  const relativePath = path.relative(workspaceRoot, target);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`路径不在项目目录内：${target}`);
  }
  return relativePath;
}

function extractChineseTitle(filename) {
  const basename = path.basename(filename, path.extname(filename));
  return (basename.match(/[\u3400-\u9fff]/g) || []).join('');
}

async function main() {
  relativeToWorkspace(manifestFile);
  relativeToWorkspace(previewFile);

  try {
    await fs.access(previewFile);
    throw new Error(`预览清单已存在：${relativeToWorkspace(previewFile)}。为避免覆盖，请先人工确认后再处理。`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  const images = manifest.images.map((image) => {
    const chineseTitle = extractChineseTitle(image.sourcePath);
    const action = chineseTitle.length >= minimumTitleLength ? 'KEEP' : 'DELETE_CANDIDATE';

    return {
      sourcePath: image.sourcePath,
      currentPublicUrl: image.currentPublicUrl,
      chineseTitle,
      chineseTitleLength: chineseTitle.length,
      sizeBytes: image.sizeBytes,
      action,
    };
  });

  const keep = images.filter((image) => image.action === 'KEEP');
  const deleteCandidates = images.filter((image) => image.action === 'DELETE_CANDIDATE');
  const deleteCandidateBytes = deleteCandidates.reduce((sum, image) => sum + image.sizeBytes, 0);

  const preview = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDirectory: 'client/public/images/products',
    rule: '文件名仅统计中文字符；中文标题不少于 10 个字时保留。',
    minimumChineseTitleLength: minimumTitleLength,
    summary: {
      total: images.length,
      keep: keep.length,
      deleteCandidates: deleteCandidates.length,
      deleteCandidateBytes,
    },
    samples: {
      keep: keep.slice(0, 20),
      deleteCandidates: deleteCandidates.slice(0, 20),
    },
    images,
  };

  await fs.writeFile(previewFile, `${JSON.stringify(preview, null, 2)}\n`, 'utf8');

  console.log(`预览清单已生成：${relativeToWorkspace(previewFile)}`);
  console.log(`保留：${keep.length} 张`);
  console.log(`待删除：${deleteCandidates.length} 张`);
  console.log(`待释放：${deleteCandidateBytes} bytes`);
}

main().catch((error) => {
  console.error(`生成保留预览失败：${error.message}`);
  process.exitCode = 1;
});
