import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ProductMediaService } from "./product-media.service";

test("媒体可读性与实际读取共享同一安全路径规则", async () => {
  const originalRoot = process.env.PRODUCT_MEDIA_ROOT;
  process.env.PRODUCT_MEDIA_ROOT = process.cwd();
  try {
    const service = new ProductMediaService();
    const readable = { storageKey: "package.json" };

    assert.equal(service.isProductMediaReadable(readable), true);
    assert.ok((await service.readProductImage(readable)).buffer.length > 0);
    assert.equal(
      service.isProductMediaReadable({ storageKey: "missing-media.jpg" }),
      false,
    );
    assert.equal(
      service.isProductMediaReadable({ storageKey: "../package.json" }),
      false,
    );
    assert.equal(
      service.isProductMediaReadable({ url: "https://example.test/image.jpg" }),
      false,
    );
    assert.equal(
      service.isProductMediaReadable({ url: "data:image/png;base64,AA==" }),
      false,
    );
    assert.equal(
      service.isProductMediaReadable({
        url: "/products/catalog/6/media/1",
      }),
      false,
    );
  } finally {
    if (originalRoot === undefined) delete process.env.PRODUCT_MEDIA_ROOT;
    else process.env.PRODUCT_MEDIA_ROOT = originalRoot;
  }
});
