import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// 防复发守卫（2026-08-19 落地）：client/public 是前端构建上下文的一部分,
// 大体积素材堆会拖慢每次镜像重建并把死重打进 nginx 镜像(当日实测 2.2GB/95% 孤儿)。
// 素材正确入口:商品图走后端媒体管道(/uploads),设计素材走 design-library/。
// 清理留档:.image-archive/orphan-manifest-*.tsv(可回填)。
const ROOT = path.resolve("client/public");
const WARN_BYTES = 200 * 1024 * 1024; // 200MB 警告
const FAIL_BYTES = 500 * 1024 * 1024; // 500MB 失败

const dirSize = (dir) => {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
};

const total = dirSize(ROOT);
const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`client/public 总体积: ${mb(total)}MB`);

if (total >= FAIL_BYTES || total >= WARN_BYTES) {
  const rows = readdirSync(ROOT, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, size: entry.isDirectory() ? dirSize(path.join(ROOT, entry.name)) : statSync(path.join(ROOT, entry.name)).size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((r) => `  ${r.name}  ${mb(r.size)}MB`);
  console.log("体积构成 Top5:\n" + rows.join("\n"));
  console.log("提示:商品图应走媒体管道(/uploads),设计素材应放 design-library/,未引用素材移入 .image-archive/");
}

if (total >= FAIL_BYTES) {
  console.error(`public-assets 守卫失败: ${mb(total)}MB ≥ ${mb(FAIL_BYTES)}MB 红线`);
  process.exit(1);
}
if (total >= WARN_BYTES) console.warn(`public-assets 警告: ${mb(total)}MB ≥ ${mb(WARN_BYTES)}MB,接近红线`);
