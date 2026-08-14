// 一键试导入：pilot-setup（建/复用 pilot-import 分类）→ batch-upload（传图）→ create-products（建商品，DRAFT）
// 用法（项目根目录）：
//   1) 确保后端在【开发库】运行（cd server && npm run build && npm run start:prod）
//   2) $env:ADMIN_USERNAME='admin'; $env:ADMIN_PASSWORD='你的密码'
//   3) node pilot-run-all.mjs
// 出错可重跑（pilot-setup 幂等，已建分类复用）。回滚：node pilot-rollback.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const run = (name, cmd, envExtra = {}) => {
  console.log(`\n========== ${name} ==========`);
  try {
    execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...envExtra } });
  } catch (e) {
    console.error(`\n✗ 步骤失败：${name}（exit ${e.status ?? '?'}）`);
    console.error('处理后重跑本脚本（pilot-setup 幂等）。回滚已创建内容：node pilot-rollback.mjs');
    process.exit(1);
  }
};

// 步骤 ① 建测试分类（输出 pilot-category-id.txt）
run('① 建测试分类 pilot-setup', 'node pilot-setup.mjs');

// 读取 categoryId 注入 CATEGORY_ID（create-products 从此 env 读）
let categoryId;
try {
  categoryId = readFileSync('pilot-category-id.txt', 'utf8').trim();
} catch {
  console.error('未找到 pilot-category-id.txt，pilot-setup 可能失败');
  process.exit(1);
}
console.log(`\nCATEGORY_ID = ${categoryId}（注入后续步骤）`);

// 步骤 ② 上传选样图片（输出 upload-products.csv）
// 注意：可能触发 429 限流；batch-upload 不因部分图失败而退出，结束后看输出决定是否 retry-upload
run('② 上传选样图片 batch-upload', 'node batch-upload.mjs ./to-upload-pilot');

// 步骤 ③ 创建商品（DRAFT，挂 pilot 分类，输出 pilot-imported-ids.json）
run('③ 创建商品 create-products', 'node create-products.mjs upload-products.csv', { CATEGORY_ID: categoryId });

console.log('\n========== 试导入完成 ==========');
console.log('商品为 DRAFT，挂在 pilot-import 分类下（不进正式分类树）。');
console.log('观察要点：ATP1079 应拆 2 个（多实物）；ATP3023 应合 1 个；背面图 warn 暂存 DETAIL。');
console.log('验证后回滚：node pilot-rollback.mjs');
