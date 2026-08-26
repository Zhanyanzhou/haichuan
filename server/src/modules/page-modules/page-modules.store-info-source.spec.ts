import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function createService(settings: Record<string, unknown> = { storeName: "海川珠宝空间" }) {
  return new PageModulesService({
    siteSetting: {
      findUnique: async () => ({ key: "site", value: settings }),
    },
  } as unknown as PrismaService);
}

function makeStoreInfo(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "store-info-source-hero",
          title: "品牌空间",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "珠宝品牌空间",
          actionText: "",
          targetType: "none",
          linkUrl: "",
        },
      },
      {
        type: "门店信息",
        props: {
          id: "store-info-source-gate",
          image: "/images/store.jpg",
          ...overrides,
        },
      },
    ],
    root: { props: {} },
  };
}

test("门店模块只保存媒体与展示配置时通过发布校验", async () => {
  const service = createService();
  const document = makeStoreInfo();
  const result = await service.validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("门店模块携带 PageDocument 业务事实副本时逐字段阻断发布", async () => {
  const service = createService();
  const document = makeStoreInfo({
    useSiteSettings: false,
    storeName: "旧门店",
    address: "旧地址",
    hours: "旧营业时间",
    phone: "400-000-0000",
    mapUrl: "https://legacy.invalid/store",
    storeMapUrl: "https://duplicate.invalid/store",
  });
  const result = await service.validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  for (const field of [
    "useSiteSettings",
    "storeName",
    "address",
    "hours",
    "phone",
    "mapUrl",
    "storeMapUrl",
  ]) {
    const issue = result.issues.find((item) => item.field === field);
    assert.equal(issue?.blockId, "store-info-source-gate");
    assert.equal(issue?.path, `content[1].props.${field}`);
  }
});

test("保存草稿时清除根内容遗留门店事实副本并拒绝 zones 内容", async () => {
  let savedData: any;
  const prisma = {
    pageDocument: {
      findUnique: async () => null,
      create: async ({ data }: { data: any }) => {
        savedData = data;
        return data;
      },
    },
  } as unknown as PrismaService;
  const service = new PageModulesService(prisma);
  const legacyProps = {
    id: "legacy-store",
    image: "/images/store.jpg",
    storeName: "旧门店",
    address: "旧地址",
    hours: "",
    phone: "",
    mapUrl: "",
    storeMapUrl: "",
    useSiteSettings: true,
  };

  await service.savePageDocument(
    "about",
    {
      content: [{ type: "门店信息", props: legacyProps }],
      zones: {},
      root: { props: {} },
    },
    {},
  );

  const block = savedData.puckData.content[0];
  assert.equal(block.props.image, "/images/store.jpg");
  for (const field of [
    "useSiteSettings",
    "storeName",
    "address",
    "hours",
    "phone",
    "mapUrl",
    "storeMapUrl",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(block.props, field), false);
  }

  await assert.rejects(
    () => service.savePageDocument(
      "about",
      {
        content: [{ type: "门店信息", props: legacyProps }],
        zones: {
          secondary: [{
            type: "门店信息",
            props: { ...legacyProps, id: "legacy-zone-store" },
          }],
        },
        root: { props: {} },
      },
      {},
    ),
    /只能位于根内容 content/,
  );
});
