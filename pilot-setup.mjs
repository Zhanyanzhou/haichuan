// 试导入准备：登录 + 建/复用 pilot-import 测试分类 + 输出其 categoryId
// 用法：先设置 ADMIN_USERNAME / ADMIN_PASSWORD 环境变量，再 node pilot-setup.mjs
// 依赖后端：POST /api/categories、GET /api/categories/tree
// 产出：控制台打印 categoryId，并写入 pilot-category-id.txt
import { writeFileSync } from 'node:fs';

const API = 'http://localhost:3000/api';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('缺少环境变量 ADMIN_USERNAME / ADMIN_PASSWORD');
  process.exit(1);
}

// 1. 登录
const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`登录失败: ${loginRes.status} —— 请确认后端在【开发库】运行且凭据正确`);
  process.exit(1);
}
const token = (await loginRes.json()).data.accessToken;
const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

// 2. 查 pilot-import 是否已存在（遍历分类树）
async function findPilot() {
  for (const path of ['/categories/tree', '/categories']) {
    try {
      const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) continue;
      const json = await r.json();
      const root = json.data || json;
      const flat = [];
      const walk = (nodes) => { for (const n of (nodes || [])) { flat.push(n); if (n.children) walk(n.children); } };
      walk(Array.isArray(root) ? root : [root]);
      const found = flat.find(n => n && n.slug === 'pilot-import');
      if (found) return found;
    } catch { /* try next path */ }
  }
  return null;
}

let pilot = await findPilot();

if (pilot) {
  console.log(`pilot-import 分类已存在，id = ${pilot.id}（复用）`);
} else {
  // 3. 不存在则创建
  const createRes = await fetch(`${API}/categories`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: '【试导入】', slug: 'pilot-import' }),
  });
  if (createRes.ok) {
    pilot = (await createRes.json()).data;
    console.log(`pilot-import 分类已创建，id = ${pilot.id}`);
  } else if (createRes.status === 409) {
    pilot = await findPilot();
    console.log(`pilot-import 已存在（409），id = ${pilot && pilot.id}`);
  } else {
    console.error(`建分类失败: ${createRes.status}`, await createRes.text());
    process.exit(1);
  }
}

if (!pilot || !pilot.id) {
  console.error('未能取得 pilot-import 分类 id，请检查后端 categories 接口');
  process.exit(1);
}

// 4. 写出 id 供记录（create-products 经 $env:CATEGORY_ID 读取）
writeFileSync('pilot-category-id.txt', String(pilot.id));
console.log(`\n下一步（同一 PowerShell 会话）：`);
console.log(`  $env:CATEGORY_ID='${pilot.id}'`);
console.log(`  node batch-upload.mjs ./to-upload-pilot`);
console.log(`  node create-products.mjs upload-products.csv`);
