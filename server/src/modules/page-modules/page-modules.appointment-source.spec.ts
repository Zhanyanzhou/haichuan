import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function createService(settings: Record<string, unknown> = { contactPhone: "400-111-2222" }) {
  return new PageModulesService({
    siteSetting: {
      findUnique: async () => ({ key: "site", value: settings }),
    },
  } as unknown as PrismaService);
}

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "首屏主视觉",
        props: {
          id: "appointment-source-hero",
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
        type: "预约入口",
        props: {
          id: "appointment-source-gate",
          title: "预约鉴赏",
          subtitle: "一对一珠宝顾问服务",
          buttonText: "立即预约",
          targetType: "page",
          linkUrl: "/contact",
          ...overrides,
        },
      },
    ],
    root: { props: {} },
  };
}

test("预约模块只保存页面文案与行动配置时通过发布校验", async () => {
  const document = makeAppointment();
  const result = await createService().validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("预约模块携带 PageDocument 电话副本时阻断发布", async () => {
  const document = makeAppointment({ phone: "400-000-0000" });
  const result = await createService().validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, false);
  const issue = result.issues.find((item) => item.field === "phone");
  assert.equal(issue?.blockId, "appointment-source-gate");
  assert.equal(issue?.path, "content[1].props.phone");
  assert.match(issue?.message || "", /统一联系电话/);
});

test("保存草稿时清除根内容遗留预约电话副本并拒绝 zones 内容", async () => {
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
    id: "legacy-appointment",
    title: "预约鉴赏",
    buttonText: "立即预约",
    targetType: "page",
    linkUrl: "/contact",
    phone: "400-000-0000",
  };

  await service.savePageDocument(
    "about",
    {
      content: [{ type: "预约入口", props: legacyProps }],
      zones: {},
      root: { props: {} },
    },
    {},
  );

  const block = savedData.puckData.content[0];
  assert.equal(block.props.title, "预约鉴赏");
  assert.equal(Object.prototype.hasOwnProperty.call(block.props, "phone"), false);

  await assert.rejects(
    () => service.savePageDocument(
      "about",
      {
        content: [{ type: "预约入口", props: legacyProps }],
        zones: {
          secondary: [{
            type: "预约入口",
            props: { ...legacyProps, id: "legacy-zone-appointment" },
          }],
        },
        root: { props: {} },
      },
      {},
    ),
    /只能位于根内容 content/,
  );
});
