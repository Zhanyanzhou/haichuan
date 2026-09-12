import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSitePublicationReadiness } from "./site-publication-readiness";

const readySettings = {
  siteName: "海川珠宝",
  brandPresentationMode: "text-only",
  brandReviewReference: "BRAND-TEST-001",
  contactPhone: "400-123-4567",
  contactEmail: "service@example.invalid",
  contactAddress: "已核验公开地址",
  businessHours: "已核验公开时间",
  legalEntityReviewReference: "LEGAL-TEST-001",
  privacyPolicyReviewReference: "PRIVACY-TEST-001",
  seoReviewReference: "SEO-TEST-001",
  seoTitle: "海川珠宝",
  seoDescription: "正式站点描述",
  canonicalBaseUrl: "https://example.invalid",
  defaultLocale: "zh-CN",
  publishedLocales: ["zh-CN"],
};

test("站点准备度在品牌、联系、法律、SEO 与中文发布配置完整时通过", () => {
  const result = evaluateSitePublicationReadiness(readySettings, {
    persisted: true,
  });

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.status, "READY");
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(Object.values(result.areas).every((area) => area.ready));
});

test("正式上线预检仍要求完整审核和运营资料", () => {
  const result = evaluateSitePublicationReadiness({
    siteName: "海川珠宝",
    canonicalBaseUrl: "http://example.invalid",
    defaultLocale: "zh-CN",
    publishedLocales: ["zh-CN"],
  }, { persisted: false, requireLaunchDetails: true });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.ready, false);
  const codes = result.blockers.map((blocker) => blocker.code);
  assert.ok(codes.includes("SITE_SETTINGS_NOT_PERSISTED"));
  assert.ok(codes.includes("BRAND_REVIEW_MISSING"));
  assert.ok(codes.includes("BRAND_PRESENTATION_MODE_INVALID"));
  assert.ok(codes.includes("SITE_CONTACT_PHONE_MISSING"));
  assert.ok(codes.includes("LEGAL_ENTITY_REVIEW_MISSING"));
  assert.ok(codes.includes("PRIVACY_POLICY_REVIEW_MISSING"));
  assert.ok(codes.includes("SEO_REVIEW_MISSING"));
  assert.ok(codes.includes("CANONICAL_BASE_URL_INVALID"));
  assert.equal(result.areas.contact.ready, false);
  assert.equal(result.areas.legal.ready, false);
  assert.equal(result.areas.seo.ready, false);
});

test("正式上线品牌预检要求签认，并要求正式 Logo 或显式纯文字模式", () => {
  const missingEvidence = evaluateSitePublicationReadiness({
    ...readySettings,
    brandReviewReference: "",
    brandPresentationMode: "logo",
    logo: "/favicon.svg",
  }, { persisted: true, requireLaunchDetails: true });
  assert.deepEqual(missingEvidence.areas.brand.blockerCodes, [
    "BRAND_REVIEW_MISSING",
    "BRAND_LOGO_MISSING",
  ]);

  const textOnly = evaluateSitePublicationReadiness({
    ...readySettings,
    logo: "",
    brandPresentationMode: "text-only",
  }, { persisted: true });
  assert.equal(textOnly.areas.brand.ready, true);
});

const essentialSettings = {
  siteName: "海川珠宝",
  canonicalBaseUrl: "https://example.invalid",
  defaultLocale: "zh-CN",
  publishedLocales: ["zh-CN"],
};

test("日常页面发布只需必要资料，审核编号、联系扩展、默认 SEO 与品牌模式可留空", () => {
  for (const brandPresentationMode of [undefined, "", "text-only"]) {
    const result = evaluateSitePublicationReadiness({
      ...essentialSettings,
      brandPresentationMode,
      brandReviewReference: "",
      legalEntityReviewReference: "",
      privacyPolicyReviewReference: "",
      seoReviewReference: "",
      contactPhone: "",
      contactEmail: "",
      contactAddress: "",
      businessHours: "",
      seoTitle: "",
      seoDescription: "",
    }, { persisted: true });
    assert.equal(result.ready, true);
    assert.deepEqual(result.blockers, []);
  }
});

test("日常发布仍校验必填资料、显式 Logo 和已填写字段的有效性", () => {
  for (const [patch, code] of [
    [{ siteName: " " }, "SITE_NAME_MISSING"],
    [{ canonicalBaseUrl: "" }, "CANONICAL_BASE_URL_MISSING"],
    [{ contactEmail: "invalid-email" }, "SITE_CONTACT_EMAIL_INVALID"],
    [{ contactEmail: {} }, "SITE_CONTACT_EMAIL_INVALID"],
    [{ contactPhone: 42 }, "SITE_CONTACT_PHONE_INVALID"],
    [{ seoTitle: [] }, "SITE_SEO_TITLE_INVALID"],
    [{ brandPresentationMode: "logo", logo: "" }, "BRAND_LOGO_MISSING"],
    [{ brandPresentationMode: "unsupported" }, "BRAND_PRESENTATION_MODE_INVALID"],
    [{ brandPresentationMode: 42 }, "BRAND_PRESENTATION_MODE_INVALID"],
  ] as const) {
    const result = evaluateSitePublicationReadiness({ ...essentialSettings, ...patch }, { persisted: true });
    assert.equal(result.ready, false);
    assert.deepEqual(result.blockers.map((blocker) => blocker.code), [code]);
  }
  assert.ok(evaluateSitePublicationReadiness(essentialSettings, { persisted: false })
    .blockers.some((blocker) => blocker.code === "SITE_SETTINGS_NOT_PERSISTED"));
});

test("占位 Logo 不能用 query、hash、编码或同站绝对地址绕过，真实 Logo 不被误拒", () => {
  for (const logo of [
    "/favicon.svg?v=1",
    "/images/brand-logo.svg#approved",
    "/%66avicon.svg?cache=20260906",
    "/images/../favicon.svg#brand",
    "https://example.invalid/favicon.svg?v=1",
  ]) {
    const result = evaluateSitePublicationReadiness({
      ...readySettings,
      brandPresentationMode: "logo",
      logo,
    }, { persisted: true });
    assert.ok(
      result.areas.brand.blockerCodes.includes("BRAND_LOGO_MISSING"),
      `${logo} 应识别为占位 Logo`,
    );
  }

  for (const logo of [
    "/uploads/approved-brand-logo.svg?v=1#mark",
    "https://cdn.example.invalid/favicon.svg?v=1",
  ]) {
    const result = evaluateSitePublicationReadiness({
      ...readySettings,
      brandPresentationMode: "logo",
      logo,
    }, { persisted: true });
    assert.equal(result.areas.brand.ready, true, `${logo} 应保留为真实 Logo`);
  }
});

test("未配置非上线必要的门店扩展、支付与物流字段不会冻结全站准备度", () => {
  const result = evaluateSitePublicationReadiness(readySettings, {
    persisted: true,
  });

  assert.equal(result.ready, true);
  assert.equal(result.blockers.some((blocker) => /store|payment|logistics/i.test(
    `${blocker.code}:${blocker.field}`,
  )), false);
});

test("英文尚无独立发布 revision 与哈希时不能配置为已发布语言", () => {
  const result = evaluateSitePublicationReadiness({
    ...readySettings,
    publishedLocales: ["zh-CN", "en"],
  }, { persisted: true });

  assert.equal(result.ready, false);
  assert.deepEqual(result.areas.language.blockerCodes, [
    "UNAVAILABLE_LOCALE_CONFIGURED",
  ]);
  assert.match(
    result.blockers.find((blocker) => blocker.code === "UNAVAILABLE_LOCALE_CONFIGURED")?.message || "",
    /独立发布 revision 与内容哈希/,
  );
});

test("canonical 基础地址拒绝路径、查询参数与凭据", () => {
  for (const canonicalBaseUrl of [
    "https://example.invalid/store",
    "https://example.invalid/?preview=1",
    "https://user:pass@example.invalid",
  ]) {
    const result = evaluateSitePublicationReadiness({
      ...readySettings,
      canonicalBaseUrl,
    }, { persisted: true });
    assert.ok(result.areas.seo.blockerCodes.includes("CANONICAL_BASE_URL_INVALID"));
  }
});

test("已发布语言拒绝重复项且中文主站必须存在", () => {
  const duplicated = evaluateSitePublicationReadiness({
    ...readySettings,
    publishedLocales: ["zh-CN", "zh-CN"],
  }, { persisted: true });
  assert.ok(duplicated.areas.language.blockerCodes.includes(
    "PUBLISHED_LOCALES_DUPLICATED",
  ));

  const missingPrimary = evaluateSitePublicationReadiness({
    ...readySettings,
    publishedLocales: ["en"],
  }, { persisted: true });
  assert.ok(missingPrimary.areas.language.blockerCodes.includes(
    "PRIMARY_LOCALE_NOT_PUBLISHED",
  ));
});
