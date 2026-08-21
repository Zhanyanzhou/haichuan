import assert from "node:assert/strict";

const apiBase = process.argv[2] || "http://localhost:3000/api";
const pageSize = 100;

function unwrap(payload) {
  return payload?.data ?? payload;
}

async function fetchJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `请求失败：${response.status} ${url}`);
  return unwrap(await response.json());
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

const products = [];
for (let page = 1; ; page += 1) {
  const data = await fetchJson(
    `${apiBase}/products/public?page=${page}&pageSize=${pageSize}`,
  );
  const list = Array.isArray(data?.list) ? data.list : [];
  products.push(...list);
  if (!list.length || products.length >= Number(data?.total || 0)) break;
}

const media = products.flatMap((product) => {
  const images = [product.listingImage, product.primaryImage, ...(product.images || [])]
    .filter((image) => image?.id && image?.mediaUrl)
    .map((image) => ({ productId: product.id, imageId: image.id, mediaUrl: image.mediaUrl }));
  return [...new Map(images.map((image) => [image.mediaUrl, image])).values()];
});

const failures = (await mapWithConcurrency(media, 6, async (image) => {
  const response = await fetch(`${apiBase}${image.mediaUrl}`);
  return response.ok ? null : { productId: image.productId, imageId: image.imageId, status: response.status };
})).filter(Boolean);

console.log(`公开商品媒体巡检：${products.length} 件商品，${media.length} 个媒体端点。`);
if (failures.length) {
  console.error(`发现 ${failures.length} 个不可读取媒体：`);
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
} else {
  console.log("未发现公开媒体 4xx/5xx。 ");
}
