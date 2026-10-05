import assert from "node:assert/strict";
import test from "node:test";
import { ProductsController } from "./products.controller";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("裁图生成后商品原子挂载失败会回收未挂载派生资产并保留原始错误", async () => {
  const originalError = new Error("synthetic atomic attach failure");
  const principal = {
    id: 7,
    role: "ADMIN",
    sessionFamilyId: "00000000-0000-4000-8000-000000000007",
  } as const;
  const cropActors: unknown[] = [];
  const cleanupCalls: Array<{ mediaAssetId: number; uploadedBy: number }> = [];
  const controller = new ProductsController(
    {
      findById: async () => ({
        id: 6,
        images: [{
          id: 12,
          storageKey: "product-assets/source.png",
          mediaAssetId: 81,
        }],
      }),
      addListingImage: async () => {
        throw originalError;
      },
    } as never,
    {
      cropPrivateImage: async (
        _storageKey: string,
        _crop: unknown,
        _outputSize: number,
        _format: string,
        actor: unknown,
      ) => {
        cropActors.push(actor);
        return {
          mediaAssetId: 91,
          storageKey: "product-assets/derived/2026/09/24/listing.webp",
          width: 1200,
          height: 1200,
          mimeType: "image/webp",
          fileSize: 1024,
        };
      },
      archiveUnattachedProductDerivative: async (
        mediaAssetId: number,
        uploadedBy: number,
      ) => {
        cleanupCalls.push({ mediaAssetId, uploadedBy });
        return true;
      },
    } as never,
    {
      readProductImage: async () => ({ buffer: ONE_PIXEL_PNG }),
    } as never,
  );

  await assert.rejects(
    () => controller.cropListingImage(
      { user: principal } as never,
      "6",
      "12",
      { x: 0, y: 0, width: 1, height: 1 },
    ),
    (error: unknown) => error === originalError,
  );
  assert.deepEqual(cropActors, [principal]);
  assert.deepEqual(cleanupCalls, [{ mediaAssetId: 91, uploadedBy: 7 }]);
});
