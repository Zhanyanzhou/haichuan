import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ServiceUnavailableException, ValidationPipe } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

function withStaffAuthorization<T extends Record<string, unknown>>(domain: T) {
  const transaction = {
    ...domain,
    $queryRaw: async () => [{ id: 9 }],
  };
  return {
    ...transaction,
    $transaction: async (run: (tx: typeof transaction) => Promise<unknown>) => run(transaction),
  };
}

test("读取缺失的 SiteSettings 返回安全默认值且不写数据库", async () => {
  let upsertCalls = 0;
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: {
      findUnique: async () => null,
      upsert: async () => {
        upsertCalls += 1;
        throw new Error("GET 不应写入 SiteSetting");
      },
    },
  }) as any);

  const settings = await service.getSettings(9);

  assert.equal(settings.siteName, "海川珠宝");
  assert.equal(settings.siteDescription, "珠宝作品与顾问服务");
  assert.equal(settings.seoTitle, "海川珠宝官方网站");
  assert.equal(settings.seoDescription, "浏览珠宝作品，了解定制与顾问服务。");
  assert.equal(settings.contactPhone, "");
  assert.equal(settings.contactWechat, "");
  assert.equal(settings.contactWechatQrCode, "");
  assert.equal(upsertCalls, 0);
});

test("首次显式更新只执行一次 create 并合并安全默认值", async () => {
  const calls: any[] = [];
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: {
      findUnique: async () => null,
      create: async (args: any) => {
        calls.push(args);
        return { value: args.data.value };
      },
    },
  }) as any);

  const settings = await service.updateSettings({ contactPhone: "400-123-4567" }, 9);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.key, "site");
  assert.equal(calls[0].data.updatedBy, 9);
  assert.equal(calls[0].data.value.siteName, "海川珠宝");
  assert.equal(settings.contactPhone, "400-123-4567");
});

test("并发更新冲突后重新读取最新设置并保留其他管理员已写入的签认", async () => {
  const updates: any[] = [];
  let reads = 0;
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: {
      findUnique: async () => {
        reads += 1;
        return reads === 1
          ? { value: { siteName: "海川珠宝" }, version: 4 }
          : {
              value: {
                siteName: "海川珠宝",
                legalEntityReviewReference: "LEGAL-CONCURRENT-005",
              },
              version: 5,
            };
      },
      updateMany: async (args: any) => {
        updates.push(args);
        return { count: updates.length === 1 ? 0 : 1 };
      },
    },
  }) as any);

  const settings = await service.updateSettings({ contactPhone: "400-123-4567" }, 9);

  assert.equal(reads, 2);
  assert.equal(updates[0].where.version, 4);
  assert.equal(updates[1].where.version, 5);
  assert.equal(
    updates[1].data.value.legalEntityReviewReference,
    "LEGAL-CONCURRENT-005",
  );
  assert.equal(settings.contactPhone, "400-123-4567");
  assert.equal(settings.legalEntityReviewReference, "LEGAL-CONCURRENT-005");
});

test("发布准备度绕过默认回退并只认持久化设置", async () => {
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: {
      findUnique: async () => null,
    },
  }) as any);

  const result = await service.getPublicationReadiness(9);

  assert.equal(result.ready, false);
  assert.equal(result.persisted, false);
  assert.equal(result.settingsVersion, null);
  assert.ok(result.blockers.some(
    (blocker) => blocker.code === "SITE_SETTINGS_NOT_PERSISTED",
  ));
});

test("公开设置未持久化或正式资料不完整时失败关闭", async () => {
  const service = new SettingsService({
    siteSetting: { findUnique: async () => null },
  } as any);

  await assert.rejects(
    () => service.getPublishedSettings(),
    ServiceUnavailableException,
  );
});

test("公开设置只在全部机器准备度通过时返回持久化值", async () => {
  const value = {
    siteName: "海川珠宝",
    brandPresentationMode: "text-only",
    brandReviewReference: "BRAND-TEST-001",
    logo: "/uploads/previous-approved-logo.svg",
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
  const service = new SettingsService({
    siteSetting: { findUnique: async () => ({ value }) },
  } as any);

  const result = await service.getPublishedSettings();

  assert.equal(result.contactPhone, value.contactPhone);
  assert.equal(result.brandPresentationMode, "text-only");
  assert.equal(result.logo, "");
  assert.equal(result.legalEntityReviewReference, value.legalEntityReviewReference);
});

test("公开设置响应公开品牌模式但不泄漏品牌签认编号", async () => {
  const controller = new SettingsController({
    getPublishedSettings: async () => ({
      siteName: "海川珠宝",
      brandPresentationMode: "text-only",
      brandReviewReference: "BRAND-INTERNAL-001",
      logo: "",
    }),
  } as any);

  const result = await controller.getPublicSettings("zh-CN");

  assert.equal(result.brandPresentationMode, "text-only");
  assert.equal(result.logo, "");
  assert.equal("brandReviewReference" in result, false);
});

test("必要资料通过后公开设置可读取，未选择品牌模式安全使用网站名称", async () => {
  const value = {
    siteName: "海川珠宝",
    canonicalBaseUrl: "https://example.invalid",
    defaultLocale: "zh-CN",
    publishedLocales: ["zh-CN"],
    logo: "/uploads/legacy-logo.svg",
  };
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: { findUnique: async () => ({ value }) },
  }) as any);
  assert.equal((await service.getPublicationReadiness(9)).ready, true);
  const result = await service.getPublishedSettings();
  assert.equal(result.siteName, value.siteName);
  assert.equal(result.brandPresentationMode, "text-only");
  assert.equal(result.logo, "");
  assert.equal(value.logo, "/uploads/legacy-logo.svg");
  assert.equal("brandPresentationMode" in value, false);
});

test("联系邮箱可清空保存，非空无效邮箱仍被写接口校验拒绝", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata = { type: "body" as const, metatype: UpdateSettingsDto };
  for (const contactEmail of ["", "   ", "service@example.invalid"]) {
    const dto = await pipe.transform({ contactEmail }, metadata);
    let saved: Record<string, unknown> | undefined;
    const service = new SettingsService(withStaffAuthorization({
      siteSetting: {
        findUnique: async () => ({ value: { contactEmail: "previous@example.invalid" }, version: 1 }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          saved = args.data;
          return { count: 1 };
        },
      },
    }) as any);
    const result = await service.updateSettings(dto, 9);
    assert.ok(saved);
    assert.equal(result.contactEmail, contactEmail.trim());
  }
  for (const contactEmail of ["invalid", 42, {}, "x".repeat(101) + "@example.invalid"]) {
    await assert.rejects(() => pipe.transform({ contactEmail }, metadata), BadRequestException);
  }
});

test("公开公司微信号沿用设置保存与读取，支持清空且不暴露内部字段", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata = { type: "body" as const, metatype: UpdateSettingsDto };
  let value: Record<string, unknown> = {
    siteName: "测试站点",
    canonicalBaseUrl: "https://example.invalid",
    defaultLocale: "zh-CN",
    publishedLocales: ["zh-CN"],
    brandReviewReference: "INTERNAL-TEST-REVIEW",
  };
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: {
      findUnique: async () => ({ value, version: 1 }),
      updateMany: async (args: { data: { value: Record<string, unknown> } }) => {
        value = args.data.value;
        return { count: 1 };
      },
    },
  }) as any);
  const controller = new SettingsController(service);
  for (const contactWechat of ["  test_company_wechat  ", ""]) {
    const dto = await pipe.transform({ contactWechat }, metadata);
    await service.updateSettings(dto, 9);
    assert.equal(value.contactWechat, contactWechat.trim());
    assert.equal((await service.getSettings(9)).contactWechat, contactWechat.trim());
    const published = await controller.getPublicSettings("zh-CN");
    assert.equal(published.contactWechat, contactWechat.trim());
    assert.equal("brandReviewReference" in published, false);
  }
  for (const contactWechat of [42, {}, "x".repeat(101)]) {
    await assert.rejects(() => pipe.transform({ contactWechat }, metadata), BadRequestException);
  }
});

test("微信加好友二维码只允许受控图片，保存读回与清空沿用原设置链路", async () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadata = { type: "body" as const, metatype: UpdateSettingsDto };
  let value: Record<string, unknown> = {
    siteName: "测试站点", canonicalBaseUrl: "https://example.invalid",
    defaultLocale: "zh-CN", publishedLocales: ["zh-CN"],
  };
  const service = new SettingsService(withStaffAuthorization({
    siteSetting: {
      findUnique: async () => ({ value, version: 1 }),
      updateMany: async (args: { data: { value: Record<string, unknown> } }) => {
        value = args.data.value;
        return { count: 1 };
      },
    },
  }) as any);
  const controller = new SettingsController(service);
  for (const contactWechatQrCode of [" /uploads/page-assets/test-qr.png ", "/api/upload/public-media/42", ""]) {
    const dto = await pipe.transform({ contactWechatQrCode }, metadata);
    await service.updateSettings(dto, 9);
    assert.equal(value.contactWechatQrCode, contactWechatQrCode.trim());
    assert.equal((await service.getSettings(9)).contactWechatQrCode, contactWechatQrCode.trim());
    assert.equal((await controller.getPublicSettings("zh-CN")).contactWechatQrCode, contactWechatQrCode.trim());
  }
  for (const contactWechatQrCode of [
    "javascript:alert(1)", "data:image/png;base64,abc", "https://example.invalid/qr.png",
    "//example.invalid/qr.png", "/uploads/page-assets/../secret.png",
    "/uploads/page-assets/%2e%2e/secret.png", "/uploads/page-assets/test.svg",
    "/uploads/legacy.png", "/api/upload/media/42/preview", "/api/upload/public-media/0", 42,
  ]) {
    await assert.rejects(() => pipe.transform({ contactWechatQrCode }, metadata), BadRequestException);
  }
  value.contactWechatQrCode = "javascript:alert(1)";
  assert.equal((await controller.getPublicSettings("zh-CN")).contactWechatQrCode, "");
});

test("联系页公开读取不依赖全站准备度，并丢弃占位、无效邮箱和不安全二维码", async () => {
  const value = {
    siteName: "海川珠宝",
    brandReviewReference: "INTERNAL-REVIEW",
    seoTitle: "不应出现",
    logo: "/uploads/previous-approved-logo.svg",
    contactPhone: "  13800000000  ",
    contactWechat: "请填写微信号",
    contactWechatQrCode: "javascript:alert(1)",
    contactEmail: "not-an-email",
    contactAddress: "已保存的接待地址",
    businessHours: "工作日 10:00-18:00",
    storeName: "不应作为联系字段返回",
  };
  const service = new SettingsService({
    siteSetting: { findUnique: async () => ({ value }) },
  } as any);
  const controller = new SettingsController(service);

  await assert.rejects(() => service.getPublishedSettings(), ServiceUnavailableException);
  const contact = await controller.getPublicContact();

  assert.deepEqual(contact, {
    contactPhone: "13800000000",
    contactWechat: "",
    contactWechatQrCode: "",
    contactEmail: "",
    contactAddress: "已保存的接待地址",
    businessHours: "工作日 10:00-18:00",
  });
  assert.equal("siteName" in contact, false);
  assert.equal("brandReviewReference" in contact, false);
  assert.equal("seoTitle" in contact, false);
  assert.equal("logo" in contact, false);
  assert.equal("storeName" in contact, false);
});

test("没有已保存店铺资料时联系页公开读取返回空字段", async () => {
  const service = new SettingsService({
    siteSetting: { findUnique: async () => null },
  } as any);

  assert.deepEqual(await service.getPublicContactSettings(), {
    contactPhone: "",
    contactWechat: "",
    contactWechatQrCode: "",
    contactEmail: "",
    contactAddress: "",
    businessHours: "",
  });
});
