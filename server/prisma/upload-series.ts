const fs = require("fs");
const path = require("path");
const srcBase = "G:/AI整理文件/input/原始3D和历史资料/整理文件合集/ATP吊坠文件合集/ATP犀牛文件/按吊坠扣分类/系列";

// 统计各ATP码和图片数
const codeMap = new Map();
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) { walk(path.join(dir, e.name)); continue; }
    const match = e.name.match(/^(ATP\d+)/);
    if (!match) continue;
    const view = e.name.includes("正面") ? "FRONT" : e.name.includes("背面") ? "BACK" : e.name.includes("侧面") ? "SIDE" : null;
    if (!view) continue;
    const code = match[1];
    if (!codeMap.has(code)) codeMap.set(code, { front: 0, back: 0, side: 0, firstFile: "" });
    const entry = codeMap.get(code);
    entry[view === "FRONT" ? "front" : view === "BACK" ? "back" : "side"]++;
    if (!entry.firstFile) entry.firstFile = path.join(dir, e.name);
  }
}
walk(srcBase);

console.log(`款式数: ${codeMap.size}`);
console.log(`总图片: ${Array.from(codeMap.values()).reduce((s, v) => s + v.front + v.back + v.side, 0)}`);
// 显示前10个
let i = 0;
for (const [code, v] of codeMap) {
  if (i++ >= 10) break;
  console.log(`  ${code}: 正${v.front} 背${v.back} 侧${v.side} | ${path.basename(v.firstFile)}`);
}