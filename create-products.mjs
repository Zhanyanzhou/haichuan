// 批量创建商品 + 关联图片
import { readFileSync, writeFileSync } from 'fs';

// 批次记录：本次创建的 productId，写入 pilot-imported-ids.json，用于回滚（pilot-rollback.mjs）
const importedIds = [];

const API = 'http://localhost:3000/api';
const csvFile = process.argv[2] || 'upload-products.csv';

// 管理员账号从环境变量读取，避免在源码中保存真实凭证。
// 提供方式：shell 设置 ADMIN_USERNAME / ADMIN_PASSWORD，或 Node 20.6+ 用 `node --env-file=.env create-products.mjs`。
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('缺少环境变量 ADMIN_USERNAME / ADMIN_PASSWORD');
  process.exit(1);
}

// 登录
const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
const token = (await loginRes.json()).data.accessToken;
const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

// 读取 CSV
const csv = readFileSync(csvFile, 'utf8');
const lines = csv.trim().split('\n').slice(1); // 跳过 header

console.log(`找到 ${lines.length} 个款号\n`);

for (const line of lines) {
  const parts = line.match(/([^,]+),"([^"]+)",(\d+),"([^"]+)","(.+)"/);
  if (!parts) continue;
  const code = parts[1];
  const productName = parts[2];
  const coverUrl = parts[4];
  const allImagesStr = parts[5];

  // 解析 AllImages: URL|类型;URL|类型;...
  const imageEntries = allImagesStr.split(';').filter(Boolean).map(entry => {
    const [url, type] = entry.split('|');
    return { url: url.trim(), type: (type || 'DETAIL').trim() };
  });

  process.stdout.write(`${productName} [${code}] (${imageEntries.length}图) ... `);

  try {
    // 1. 创建商品（同款号自动加后缀避免冲突）
    let uniqueCode = code;
    let productData = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const createBody = JSON.stringify({
        name: productName,
        code: uniqueCode,
        categoryId: Number(process.env.CATEGORY_ID) || 1,
        materialType: 'GOLD_999',
        status: 'DRAFT',
        salesMode: 'SELECTION',
        sortOrder: 0,
      });
      const createRes = await fetch(`${API}/products`, { method: 'POST', headers: auth, body: createBody });
      if (createRes.status === 409) {
        uniqueCode = `${code}-${attempt + 1}`;
        continue;
      }
      const json = await createRes.json();
      productData = json.data;
      break;
    }
    if (!productData) { console.log('FAIL (dup code exhausted)'); continue; }
    const productId = productData.id;
    importedIds.push(productId);

    // 2. 关联图片（正面优先）
    const frontImages = imageEntries.filter(e => e.type === 'FRONT');
    const otherImages = imageEntries.filter(e => e.type !== 'FRONT');
    const sorted = [...frontImages, ...otherImages];

    let added = 0;
    for (let i = 0; i < sorted.length; i++) {
      const img = sorted[i];
      try {
        await fetch(`${API}/products/${productId}/images`, {
          method: 'POST', headers: auth,
          body: JSON.stringify({ url: img.url, type: img.type, sortOrder: i }),
        });
        added++;
      } catch { /* skip failed image */ }
    }
    console.log(`OK (id=${productId}, ${added}图)`);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
  }
}

writeFileSync('pilot-imported-ids.json', JSON.stringify(importedIds, null, 2));
console.log(`\n完成！本次创建 ${importedIds.length} 个商品，productId 已写入 pilot-imported-ids.json（可用 pilot-rollback.mjs 回滚）。`);
