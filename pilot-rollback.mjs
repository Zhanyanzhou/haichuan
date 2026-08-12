// 试导入回滚：软删除 pilot-imported-ids.json 中的商品
// 用法: node pilot-rollback.mjs [ids文件，默认 pilot-imported-ids.json]
// 需环境变量 ADMIN_USERNAME / ADMIN_PASSWORD
// 依赖后端 DELETE /api/products/:id（products.service.delete 软删除：status=OFFLINE + deletedAt）
import { readFileSync } from 'fs';

const API = 'http://localhost:3000/api';
const idsFile = process.argv[2] || 'pilot-imported-ids.json';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('缺少环境变量 ADMIN_USERNAME / ADMIN_PASSWORD');
  process.exit(1);
}

let ids;
try {
  ids = JSON.parse(readFileSync(idsFile, 'utf8'));
} catch (e) {
  console.error(`无法读取 ${idsFile}: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(ids) || ids.length === 0) {
  console.error('ids 清单为空，无需回滚');
  process.exit(0);
}

console.log(`准备软删除 ${ids.length} 个商品...`);

// 登录
const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`登录失败: ${loginRes.status}`);
  process.exit(1);
}
const token = (await loginRes.json()).data.accessToken;
const auth = { Authorization: `Bearer ${token}` };

// 逐个软删除（DELETE 接口软删除：status=OFFLINE + deletedAt）
let ok = 0, fail = 0;
for (const id of ids) {
  try {
    const res = await fetch(`${API}/products/${id}`, { method: 'DELETE', headers: auth });
    if (res.ok) { console.log(`DELETE ${id} → OK`); ok++; }
    else { console.log(`DELETE ${id} → ${res.status}`); fail++; }
  } catch (e) {
    console.log(`DELETE ${id} → FAIL: ${e.message}`);
    fail++;
  }
}
console.log(`\n完成：成功 ${ok}，失败 ${fail}。（软删除：商品 status=OFFLINE + deletedAt，列表默认过滤）`);
