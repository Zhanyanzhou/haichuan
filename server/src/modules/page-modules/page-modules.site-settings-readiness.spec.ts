import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesService } from "./page-modules.service";
import { makeFormalPageMetadata } from "./page-modules.spec-fixtures";

function createService(settings: Record<string, unknown> | null) {
  return new PageModulesService({
    siteSetting: {
      findUnique: async () => settings ? { key: "site", value: settings } : null,
    },
  } as unknown as PrismaService);
}

function hero(id: string) {
  return {
    type: "首屏主视觉",
    props: {
      id,
      title: "海川珠宝",
      desktopImage: "/images/hero-desktop.jpg",
      mobileImage: "/images/hero-mobile.jpg",
      altText: "海川珠宝品牌空间",
      actionText: "",
      targetType: "none",
      linkUrl: "",
    },
  };
}

function storeDocument(props: Record<string, unknown> = {}) {
  return {
    content: [
      hero("readiness-about-hero"),
      {
        type: "门店信息",
        props: { id: "readiness-store", ...props },
      },
    ],
    root: { props: {} },
  };
}

function contactDocument() {
  return {
    content: [
      hero("readiness-contact-hero"),
      {
        type: "业务功能区",
        props: {
          id: "readiness-contact-region",
          pageKey: "contact",
          locked: true,
        },
      },
    ],
    root: { props: {} },
  };
}

function appointmentDocument(props: Record<string, unknown> = {}) {
  return {
    content: [
      hero("readiness-appointment-hero"),
      {
        type: "预约入口",
        props: {
          id: "readiness-appointment",
          title: "预约鉴赏",
          buttonText: "立即预约",
          targetType: "page",
          linkUrl: "/contact",
          ...props,
        },
      },
    ],
    root: { props: {} },
  };
}

test("门店资料缺失但有图片时允许发布并说明公开端仅展示图片", async () => {
  const document = storeDocument({ image: "/images/store.jpg" });
  const result = await createService(null).validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  const issue = result.issues.find(
    (item) => item.code === "page-validation-site-settings-readiness",
  );
  assert.equal(issue?.severity, "warning");
  assert.equal(issue?.blockId, "readiness-store");
  assert.match(issue?.message || "", /仅显示门店图片/);
});

test("门店资料与图片均缺失时允许发布并说明模块不会显示", async () => {
  const document = storeDocument();
  const result = await createService({}).validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  const issue = result.issues.find(
    (item) => item.code === "page-validation-site-settings-readiness",
  );
  assert.equal(issue?.path, "content[1].props.image");
  assert.match(issue?.message || "", /公开端不会显示/);
});

test("已隐藏的门店模块不产生正式资料就绪提示", async () => {
  const document = storeDocument({ isVisible: false });
  const result = await createService({}).validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.equal(
    result.issues.some((item) => item.code === "page-validation-site-settings-readiness"),
    false,
  );
});

test("联系页无统一联系资料时允许发布并绑定业务功能区提示", async () => {
  const document = contactDocument();
  const result = await createService(null).validatePageDocument(
    "contact",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  const issue = result.issues.find(
    (item) => item.code === "page-validation-site-settings-readiness",
  );
  assert.equal(issue?.severity, "warning");
  assert.equal(issue?.blockId, "readiness-contact-region");
  assert.equal(issue?.path, "siteSettings.contact");
  assert.match(issue?.message || "", /仍可提交咨询/);
});

test("预约模块无统一联系电话时允许发布并说明只隐藏次级电话", async () => {
  const document = appointmentDocument();
  const result = await createService({}).validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  const issue = result.issues.find(
    (item) => item.path === "siteSettings.contactPhone",
  );
  assert.equal(issue?.severity, "warning");
  assert.equal(issue?.blockId, "readiness-appointment");
  assert.match(issue?.message || "", /主预约入口仍可使用/);
});

test("已隐藏的预约模块不产生联系电话就绪提示", async () => {
  const document = appointmentDocument({ isVisible: false });
  const result = await createService({}).validatePageDocument(
    "about",
    document,
    makeFormalPageMetadata(document),
  );

  assert.equal(result.valid, true);
  assert.equal(
    result.issues.some((item) => item.path === "siteSettings.contactPhone"),
    false,
  );
});

test("统一资料已有可公开字段时不产生就绪提示", async () => {
  const storeDocumentValue = storeDocument();
  const contactDocumentValue = contactDocument();
  const appointmentDocumentValue = appointmentDocument();
  const store = await createService({ contactAddress: "上海市静安区" })
    .validatePageDocument("about", storeDocumentValue, makeFormalPageMetadata(storeDocumentValue));
  const contact = await createService({ contactEmail: "service@example.com" })
    .validatePageDocument("contact", contactDocumentValue, makeFormalPageMetadata(contactDocumentValue));
  const appointment = await createService({ contactPhone: "400-111-2222" })
    .validatePageDocument("about", appointmentDocumentValue, makeFormalPageMetadata(appointmentDocumentValue));

  for (const result of [store, contact, appointment]) {
    assert.equal(result.valid, true);
    assert.equal(
      result.issues.some((item) => item.code === "page-validation-site-settings-readiness"),
      false,
    );
  }
});
