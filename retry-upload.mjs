// 重试上传 (处理429限流)
import { readdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const API = 'http://localhost:3000/api';
const folder = process.argv[2];
const codes = (process.argv[3] || '').split(',');

const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'haichuan', password: 'haichuan' }),
});
const token = (await loginRes.json()).data.accessToken;
console.log('登陆成功\n');

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

for (const code of codes) {
  const imgs = readdirSync(folder).filter(f => f.startsWith(code) && /\.(png|jpg|jpeg|webp|gif)$/i.test(f));
  console.log(`--- ${code} (${imgs.length}张) ---`);
  for (const img of imgs) {
    process.stdout.write(`  ${img} ... `);
    try {
      const cmd = `curl.exe -s -w "%{http_code}" -X POST "${API}/upload/image" -H "Authorization: Bearer ${token}" -F "file=@${join(folder, img)}" -o curl_r.txt`;
      const httpCode = execSync(cmd, { encoding: 'utf8' }).trim();
      if (httpCode === '201' || httpCode === '200') {
        const resp = JSON.parse(readFileSync('curl_r.txt', 'utf8'));
        console.log(`OK -> ${resp.data.url}`);
      } else {
        console.log(`FAIL ${httpCode}`);
      }
    } catch (e) { console.log('FAIL'); }
    await delay(3000); // 3秒间隔，避免限流
  }
  try { unlinkSync('curl_r.txt'); } catch {}
}
console.log('\nDONE');
