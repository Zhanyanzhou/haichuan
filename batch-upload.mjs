// 海川珠宝 - 批量图片上传 + 按款号分组
// 用法: node batch-upload.mjs [文件夹路径]
// 默认: ./to-upload

import { readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { extname, basename, join } from 'path';
import { execSync } from 'child_process';

const API = 'http://localhost:3000/api';
const folder = process.argv[2] || './to-upload';

// 1. 登录
console.log('登陆中...');
const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'haichuan', password: 'haichuan' }),
});
const loginData = await loginRes.json();
const token = loginData.data.accessToken;
console.log('登陆成功');

// 2. 扫描文件夹
if (!existsSync(folder)) {
  console.error(`文件夹不存在: ${folder}`);
  process.exit(1);
}

const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const allFiles = readdirSync(folder).filter(f => exts.includes(extname(f).toLowerCase()));

if (allFiles.length === 0) {
  console.log('文件夹中没有图片');
  process.exit(0);
}

// 提取款号：连续的字母+数字
function getProductCode(filename) {
  const match = filename.match(/[A-Za-z]+\d+/);
  return match ? match[0].toUpperCase() : 'UNKNOWN';
}

// 提取变体名：去掉款号、正/侧/背面/主图后缀、扩展名
function getVariantKey(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt.replace(/(正面|侧面|背面|主图|细节|顶部|佩戴|模特|上手)$/, '');
  return cleaned;
}

// 去掉款号前缀得到展示名称
function getDisplayName(variantKey, productCode) {
  let name = variantKey;
  if (name.toUpperCase().startsWith(productCode)) {
    name = name.substring(productCode.length);
  }
  return name || productCode;
}

// 按变体分组（相同款号+描述 = 同一商品，不同正/侧/背面 = 同一商品的图片）
const groups = {};
for (const f of allFiles) {
  const code = getProductCode(f);
  const variantKey = getVariantKey(f);
  const key = code + '::' + variantKey;
  if (!groups[key]) groups[key] = { code, variantKey, files: [] };
  groups[key].files.push(f);
}

const keys = Object.keys(groups).sort();
console.log(`找到 ${allFiles.length} 张图片，${keys.length} 个变体\n`);

// 判断图片类型
function getImageType(filename) {
  if (filename.includes('正面')) return 'FRONT';
  if (filename.includes('侧面')) return 'SIDE';
  if (filename.includes('佩戴') || filename.includes('模特') || filename.includes('上手')) return 'WEARING';
  if (filename.includes('顶部')) return 'TOP';
  return 'DETAIL';
}

// 3. 逐款上传
const allResults = [];

for (const key of keys) {
  const { code, variantKey, files: images } = groups[key];
  const displayName = getDisplayName(variantKey, code);
  console.log(`--- ${displayName} [${code}] (${images.length}张) ---`);

  const productUrls = [];
  for (const img of images) {
    process.stdout.write(`  上传 ${img} ... `);
    const imgType = getImageType(img);

    try {
      // 使用 curl 上传
      const cmd = `curl.exe -s -w "%{http_code}" -X POST "${API}/upload/image" -H "Authorization: Bearer ${token}" -F "file=@${join(folder, img)}" -o curl_resp.txt`;
      const httpCode = execSync(cmd, { encoding: 'utf8', cwd: folder }).trim();

      if (httpCode === '201' || httpCode === '200') {
        const resp = JSON.parse(readFileSync(join(folder, 'curl_resp.txt'), 'utf8'));
        const url = resp.data.url;
        console.log(`OK -> ${url}`);
        productUrls.push({ file: img, url, type: imgType });
      } else {
        console.log(`FAIL (${httpCode})`);
      }
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }
  }

  try { unlinkSync(join(folder, 'curl_resp.txt')); } catch {}

  if (productUrls.length > 0) {
    const cover = productUrls.find(p => p.type === 'FRONT') || productUrls[0];
    const allImages = productUrls.map(p => `${p.url}|${p.type}`).join(';');
    allResults.push({
      ProductCode: code,
      ProductName: displayName,
      ImageCount: productUrls.length,
      CoverImage: cover.url,
      AllImages: allImages,
    });
  }
  console.log();
}

// 4. 输出
console.log('========== 上传完成 ==========');
console.table(allResults.map(r => ({ 名称: r.ProductName, 货号: r.ProductCode, 图片: r.ImageCount })));

// 保存 CSV
const csvHeader = 'ProductCode,ProductName,ImageCount,CoverImage,AllImages\n';
const csvRows = allResults.map(r =>
  `${r.ProductCode},"${r.ProductName}",${r.ImageCount},"${r.CoverImage}","${r.AllImages}"`
).join('\n');
writeFileSync('upload-products.csv', csvHeader + csvRows, 'utf8');
console.log('完整映射已保存到 upload-products.csv');
console.log('AllImages 格式: URL|类型;URL|类型 (FRONT/SIDE/DETAIL/WEARING/TOP)');
