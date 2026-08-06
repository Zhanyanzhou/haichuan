// 批量创建商品 + 关联图片
import { readFileSync } from 'fs';

const API = 'http://localhost:3000/api';
const csvFile = process.argv[2] || 'upload-products.csv';

// 登录
const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'haichuan', password: 'haichuan' }),
});
const token = (await loginRes.json()).data.accessToken;
const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

// 读取 CSV
const csv = readFileSync(csvFile, 'utf8');
const lines = csv.trim().split('\n').slice(1); // 跳过 header

console.log(`找到 ${lines.length} 个款号\n`);

for (const line of lines) {
  const parts = line.split(',');
  const code = parts[0];
  const coverUrl = parts[2].replace(/"/g, '');
  const allImagesStr = parts.slice(3).join(',').replace(/"/g, '');

  // 解析 AllImages: URL|类型;URL|类型;...
  const imageEntries = allImagesStr.split(';').filter(Boolean).map(entry => {
    const [url, type] = entry.split('|');
    return { url: url.trim(), type: (type || 'DETAIL').trim() };
  });

  process.stdout.write(`${code} (${imageEntries.length}图) ... `);

  try {
    // 1. 创建商品
    const createBody = JSON.stringify({
      name: code,
      code: code,
      categoryId: 1,  // 吊坠
      materialType: 'GOLD_999',
      status: 'PUBLISHED',
      salesMode: 'SELECTION',
      sortOrder: 0,
    });
    const createRes = await fetch(`${API}/products`, { method: 'POST', headers: auth, body: createBody });
    const product = (await createRes.json()).data;
    const productId = product.id;

    // 2. 关联图片（正面优先，再其他）
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

console.log('\n完成！刷新选款中心即可看到。');
