/**
 * 本机试导入入口。默认只预览；加上 --apply 才写入本机数据库。
 * 运行目录必须是 server/。正式大批量导入不要使用这个脚本。
 */
import { join } from "path";
import { PrismaClient, type Role } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { CategoriesService } from "../modules/categories/categories.service";
import { ProductAccessService } from "../modules/products/product-access.service";
import { ProductMediaService } from "../modules/products/product-media.service";
import { ProductsService } from "../modules/products/products.service";
import { MediaAuthorizationService } from "../modules/upload/media-authorization.service";
import { UploadService } from "../modules/upload/upload.service";
import {
  assertLocalCatalogDatabase,
  buildPilotProductDraft,
  extractSourceList,
  legacyCategorySlug,
  parseSourceCategory,
  parseSourceProduct,
  planPilotImages,
  readPilotArgs,
  sourceMarker,
  type PilotImageJob,
  type PilotProductDraft,
  type SourceCategory,
  type SourceProduct,
} from "./legacy-catalog-pilot";

const SOURCE_ORIGIN = "https://haichuanzhubao.com";
const LOCAL_PRODUCT_GUARD = 100;

type PilotReport = {
  created: number;
  reused: number;
  skipped: string[];
  failed: string[];
  imagesStored: number;
  imageFailures: string[];
};

async function main() {
  const args = readPilotArgs(process.argv.slice(2));
  ensureDatabaseUrl();
  const target = assertLocalCatalogDatabase(process.env.DATABASE_URL ?? "");
  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    const existingProducts = await prisma.product.count({ where: { deletedAt: null } });
    const existingCategories = await prisma.category.count();
    if (existingProducts > LOCAL_PRODUCT_GUARD) {
      throw new Error(`本机商品已有 ${existingProducts} 件，超过试导入保护线，已停止`);
    }
    const actor = await findActor(prisma);
    const selected = await loadPilotProducts(args.categoryId, args.limit);
    console.log(`本机数据库 ${target.database}，导入前商品 ${existingProducts} 件、分类 ${existingCategories} 个。`);
    console.log(`来源分类：${selected.label}。本轮计划 ${selected.products.length} 件。`);
    for (const product of selected.products) {
      const draft = buildPilotProductDraft(product, selected.label);
      console.log(`- ${draft.code} ${draft.name}：${draft.issues.join("；")}`);
    }
    if (!args.apply) {
      console.log("这是预览，没有写入。确认后用 --apply 导入这一小批。");
      return;
    }

    const report = await applyPilot(prisma, actor, selected.products, selected.chains);
    const verification = await verifyPilot(prisma, report.productIds);
    console.log(
      `写入完成：新建 ${report.created} 件，沿用 ${report.reused} 件，跳过 ${report.skipped.length} 件，失败 ${report.failed.length} 件。`,
    );
    console.log(`图片保存 ${report.imagesStored} 张，失败 ${report.imageFailures.length} 张。`);
    console.log(`公开可售核对：${verification.publicEligible} 件。成交价大于 0：${verification.priced} 件。可售库存大于 0：${verification.stocked} 件。`);
    console.log(`新建未启用分类 ${verification.inactiveCategories} 个。这些分类不会出现在前台启用分类里。`);
    if (verification.unconfirmedDefaults > 0) {
      console.log(`${verification.unconfirmedDefaults} 件草稿带有系统默认的发货或保价设置，来源里没有这些事实。`);
    }
    for (const line of [...report.skipped, ...report.failed, ...report.imageFailures]) {
      console.log(`问题：${line}`);
    }
    if (report.failed.length > 0 || verification.publicEligible > 0 || verification.priced > 0 || verification.stocked > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function applyPilot(
  prisma: PrismaClient,
  actor: { id: number; role: Role },
  products: SourceProduct[],
  chains: Map<number, SourceCategory[]>,
): Promise<PilotReport & { productIds: number[] }> {
  const db = prisma as unknown as PrismaService;
  const categories = new CategoriesService(db);
  const productsService = new ProductsService(db, new ProductMediaService(), new ProductAccessService(db));
  const upload = new UploadService(db, new MediaAuthorizationService(db));
  const categoryIds = new Map<number, number>();
  const report: PilotReport & { productIds: number[] } = {
    created: 0,
    reused: 0,
    skipped: [],
    failed: [],
    imagesStored: 0,
    imageFailures: [],
    productIds: [],
  };

  for (const product of products) {
    const chain = chains.get(product.categoryId) ?? [];
    const draft = buildPilotProductDraft(product, chain.map((item) => item.name).join(" / "));
    try {
      const categoryId = await ensureCategoryChain(prisma, categories, actor, chain, categoryIds);
      const saved = await ensureProduct(prisma, productsService, actor, draft, categoryId);
      report.productIds.push(saved.id);
      if (saved.created) report.created += 1;
      else report.reused += 1;
      const images = await ensureImages(prisma, productsService, upload, actor, saved.id, product);
      report.imagesStored += images.stored;
      report.imageFailures.push(...images.failures);
    } catch (error) {
      report.failed.push(`${draft.code}：${errorText(error)}`);
    }
  }
  return report;
}

async function ensureCategoryChain(
  prisma: PrismaClient,
  categories: CategoriesService,
  actor: { id: number },
  chain: SourceCategory[],
  cache: Map<number, number>,
): Promise<number> {
  if (chain.length === 0 || chain.length > 3 || chain.some((item) => item.level > 3)) {
    throw new Error("来源分类超过本站三级，这一件先跳过");
  }
  let parentId: number | null = null;
  for (const category of chain) {
    const cached = cache.get(category.id);
    if (cached) {
      parentId = cached;
      continue;
    }
    const slug = legacyCategorySlug(category.id);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      if (existing.deletedAt || (existing.parentId ?? null) !== parentId) {
        throw new Error(`分类 ${category.name} 和现有分类对不上，没有改写`);
      }
      cache.set(category.id, existing.id);
      parentId = existing.id;
      continue;
    }
    const created = await categories.create(
      {
        name: category.name.slice(0, 100),
        slug,
        parentId,
        sortOrder: 0,
        isActive: false,
      },
      actor,
    );
    cache.set(category.id, created.id);
    parentId = created.id;
  }
  if (!parentId) throw new Error("分类没有建立");
  return parentId;
}

async function ensureProduct(
  prisma: PrismaClient,
  products: ProductsService,
  actor: { id: number; role: Role },
  draft: PilotProductDraft,
  categoryId: number,
): Promise<{ id: number; created: boolean }> {
  const marker = draft.shortDescription;
  const byCode = await prisma.product.findUnique({
    where: { code: draft.code },
    select: { id: true, shortDescription: true, deletedAt: true },
  });
  if (byCode && !byCode.deletedAt) {
    if (byCode.shortDescription !== marker) {
      throw new Error("货号已被其他商品使用，没有改写");
    }
    return { id: byCode.id, created: false };
  }
  const byMarker = await prisma.product.findFirst({
    where: { shortDescription: marker, deletedAt: null },
    select: { id: true, code: true },
  });
  if (byMarker) {
    if (byMarker.code !== draft.code) throw new Error("同一来源编号已经对应另一个货号");
    return { id: byMarker.id, created: false };
  }
  const created = await products.create(
    {
      name: draft.name,
      code: draft.code,
      categoryId,
      shortDescription: draft.shortDescription,
      description: draft.description,
      materialType: draft.materialType,
      craftTechnique: draft.craftTechnique,
      isCustom: draft.isCustom,
      includesCertificate: draft.includesCertificate,
      status: draft.status,
      visibility: draft.visibility,
      salesMode: draft.salesMode,
      publishMode: draft.publishMode,
    },
    actor,
  );
  return { id: created.id, created: true };
}

async function ensureImages(
  prisma: PrismaClient,
  products: ProductsService,
  upload: UploadService,
  actor: { id: number; role: Role },
  productId: number,
  source: SourceProduct,
): Promise<{ stored: number; failures: string[] }> {
  const existingCount = await prisma.productImage.count({ where: { productId } });
  if (existingCount > 0) {
    const current = await prisma.product.findUnique({
      where: { id: productId },
      select: { primaryImageId: true },
    });
    if (!current?.primaryImageId) {
      const first = await prisma.productImage.findFirst({
        where: { productId, isVideo: false },
        orderBy: { sortOrder: "asc" },
      });
      if (first) await products.setPrimaryImage(productId, first.id, actor);
    }
    return { stored: 0, failures: [] };
  }
  const plan = planPilotImages(source);
  const failures = plan.issues.map((issue) => `${sourceMarker(source.id)} ${issue}`);
  let stored = 0;
  let primaryId: number | null = null;
  for (const job of plan.jobs) {
    try {
      const imageId = await storeImage(products, upload, actor, productId, source.id, job, stored);
      stored += 1;
      if (!primaryId) primaryId = imageId;
    } catch (error) {
      failures.push(`${sourceMarker(source.id)} 图片未保存：${errorText(error)}`);
    }
  }
  if (primaryId) {
    try {
      await products.setPrimaryImage(productId, primaryId, actor);
    } catch (error) {
      failures.push(`${sourceMarker(source.id)} 主图未设置：${errorText(error)}`);
    }
  }
  return { stored, failures };
}

async function storeImage(
  products: ProductsService,
  upload: UploadService,
  actor: { id: number; role: Role },
  productId: number,
  legacyId: number,
  job: PilotImageJob,
  index: number,
): Promise<number> {
  const response = await fetch(job.sourceUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`图片下载失败 ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const sniffed = sniffImage(buffer);
  if (!sniffed) throw new Error("图片内容不是允许的格式");
  const stored = await upload.uploadPrivateImage(
    {
      buffer,
      originalname: `legacy-${legacyId}-${index}${sniffed.extension}`,
      mimetype: sniffed.mimeType,
      size: buffer.length,
    } as Express.Multer.File,
    actor,
  );
  const image = await products.addImage(
    productId,
    {
      mediaAssetId: stored.mediaAssetId,
      storageKey: stored.storageKey,
      type: job.type,
      sortOrder: job.sortOrder,
      width: stored.width,
      height: stored.height,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
    },
    actor,
  );
  return image.id;
}

async function verifyPilot(prisma: PrismaClient, productIds: number[]) {
  if (productIds.length === 0) {
    return { publicEligible: 0, priced: 0, stocked: 0, inactiveCategories: 0, unconfirmedDefaults: 0 };
  }
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      status: true,
      visibility: true,
      publicationQualityStatus: true,
      price: true,
      dispatchTime: true,
      requiresInsuredShipping: true,
      skus: { select: { price: true, stock: true, inventories: { select: { quantity: true } } } },
    },
  });
  const publicEligible = rows.filter((row) =>
    row.status === "PUBLISHED"
    && row.publicationQualityStatus === "READY"
    && row.visibility === "PUBLIC"
  ).length;
  const priced = rows.filter((row) =>
    Number(row.price) > 0 || row.skus.some((sku) => Number(sku.price) > 0)
  ).length;
  const stocked = rows.filter((row) =>
    row.skus.some((sku) => sku.stock > 0 || sku.inventories.some((inventory) => inventory.quantity > 0))
  ).length;
  const unconfirmedDefaults = rows.filter((row) => row.requiresInsuredShipping || row.dispatchTime === "WITHIN_48_HOURS").length;
  const inactiveCategories = await prisma.category.count({
    where: { slug: { startsWith: "legacy-cat-" }, isActive: false },
  });
  return { publicEligible, priced, stocked, inactiveCategories, unconfirmedDefaults };
}

async function loadPilotProducts(categoryId: number, limit: number): Promise<{
  label: string;
  products: SourceProduct[];
  chains: Map<number, SourceCategory[]>;
}> {
  const category = parseSourceCategory(await sourceGet(`/api/categories/${categoryId}`));
  let list = extractSourceList(await sourceGet(`/api/categories/${categoryId}/products?page=1&limit=${limit}`));
  let label = category.name;
  if (list.length === 0) {
    list = extractSourceList(await sourceGet(`/api/products/public?page=1&limit=${limit}`));
    label = `${category.name} 下没有公开商品，改用公开目录前 ${limit} 件`;
  }
  const products: SourceProduct[] = [];
  for (const item of list.slice(0, limit)) {
    const preview = asRecord(item);
    const id = Number(preview?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    products.push(parseSourceProduct(await sourceGet(`/api/products/${id}`)));
  }
  const chains = new Map<number, SourceCategory[]>();
  const cache = new Map<number, SourceCategory>();
  for (const product of products) {
    if (!chains.has(product.categoryId)) {
      chains.set(product.categoryId, await loadCategoryChain(product.categoryId, cache));
    }
  }
  return { label, products, chains };
}

async function loadCategoryChain(categoryId: number, cache: Map<number, SourceCategory>): Promise<SourceCategory[]> {
  const chain: SourceCategory[] = [];
  let current: number | null = categoryId;
  const seen = new Set<number>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const cached = cache.get(current);
    const category: SourceCategory = cached ?? parseSourceCategory(await sourceGet(`/api/categories/${current}`));
    cache.set(category.id, category);
    chain.unshift(category);
    current = category.parentId;
  }
  return chain;
}

async function findActor(prisma: PrismaClient): Promise<{ id: number; role: Role }> {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN", "EDITOR"] } },
    select: { id: true, role: true },
    orderBy: { id: "asc" },
  });
  const actorRank = (role: Role) => role === "SUPER_ADMIN" ? 0 : role === "ADMIN" ? 1 : role === "EDITOR" ? 2 : 3;
  users.sort((left, right) => actorRank(left.role) - actorRank(right.role) || left.id - right.id);
  const actor = users[0];
  if (!actor) throw new Error("本机没有启用的管理员，商品写入门禁无法通过");
  return { id: actor.id, role: actor.role };
}

async function sourceGet(path: string): Promise<unknown> {
  const response = await fetch(`${SOURCE_ORIGIN}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`来源接口返回 ${response.status}`);
  const body = await response.json() as { code?: number; message?: string; data?: unknown };
  if (body.code !== 200) throw new Error(body.message || "来源接口没有返回成功");
  return body.data;
}

function sniffImage(buffer: Buffer): { mimeType: string; extension: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { mimeType: "image/gif", extension: ".gif" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mimeType: "image/webp", extension: ".webp" };
  }
  return null;
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const dotenv = require("dotenv") as { config: (options: { path: string }) => void };
  dotenv.config({ path: join(__dirname, "..", "..", ".env") });
  if (!process.env.DATABASE_URL) throw new Error("没有读到本机数据库地址，已停止导入");
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "getResponse" in error && typeof error.getResponse === "function") {
    const response = error.getResponse();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? message.join("；") : String(message);
    }
  }
  return error instanceof Error ? error.message : "未知错误";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(errorText(error));
    process.exitCode = 1;
  });
}
