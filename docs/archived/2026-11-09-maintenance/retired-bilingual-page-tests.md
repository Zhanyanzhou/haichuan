# 退役双语页面验收原文

> 归档日期：2026-11-09。原文件：`client/tests/page-builder-real-closure.spec.ts`。
> 以下三项在归档前已经是无条件 `test.skip("[历史合同] …")`，不属于当前可执行验收，也不授予恢复英文公开入口的权限。保留当前语言退役检查与共享辅助函数。
> 原文件 SHA-256：`9c1240278ef86f3c6f476765bad225d6d1f61efaf63790c624a79e232d880b24`。恢复时须先核对当前产品决定与测试接口，不能直接恢复这些历史要求。

[当前测试](../../../client/tests/page-builder-real-closure.spec.ts) · [当前决定](../../DECISIONS.md)

## [历史合同] 真实双语页面中文发布与英文隔离

```ts
test.skip("[历史合同] 真实双语页面中文发布与英文隔离", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAndPrepareIsolatedQaSite(page);

    const runToken = Date.now().toString(36);
    const editorCredentials = {
      username: `locale_editor_${runToken}`,
      password: `Qa!E26_${runToken.slice(-6)}`,
    };
    const editorUser = await browserWrite<{ id: number }>(page, "/users", {
      username: editorCredentials.username,
      password: editorCredentials.password,
      realName: "双语页面合成 QA 编辑者",
      role: "EDITOR",
    }, "POST");
    expect(editorUser.id).toBeGreaterThan(0);

    const editorSession = await newAuthenticatedApiSession(editorCredentials);

    const pageKey = "about";
    const makeDocument = (title: string) => ({
      content: [{
        type: "首屏主视觉",
        props: {
          id: `synthetic-locale-${runToken}`,
          title,
          subtitle: "SYNTHETIC QA CONTENT — NOT FORMAL BRAND COPY",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "Synthetic QA jewelry image",
          actionText: "",
          targetType: "none",
          linkUrl: "",
        },
      }],
      zones: {},
      root: { props: {} },
    });
    const metadata = {
      seoTitle: "SYNTHETIC QA — Haichuan Jewelry",
      seoDescription: "Synthetic bilingual publication lifecycle verification only.",
      contentOwner: "SYNTHETIC QA",
      mediaRights: [],
    };
    const zhTitle = `合成 QA 中文 ${runToken}`;
    const enV1Title = `SYNTHETIC QA EN V1 ${runToken}`;

    const zhDraft = await apiWrite<{
      updatedAt: string;
      contentHash: string;
      locale: string;
    }>(editorSession, "/page-modules/document", {
      pageKey,
      locale: "zh-CN",
      puckData: makeDocument(zhTitle),
      metadata,
      editorVersion: "0.22.4",
    });
    expect(zhDraft.locale).toBe("zh-CN");

    const enInitial = await apiWrite<{
      updatedAt: string;
      contentHash: string;
      reviewStatus: string;
      locale: string;
    }>(editorSession, "/page-modules/document", {
      pageKey,
      locale: "en",
      puckData: makeDocument(`${enV1Title} DRAFT`),
      metadata,
      editorVersion: "0.22.4",
    });
    expect(enInitial).toMatchObject({ locale: "en", reviewStatus: "DRAFT" });
    expect(enInitial.contentHash).toMatch(/^[a-f0-9]{64}$/);

    expect(await responseData<unknown>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ))).toBeNull();
    expect(await responseData<unknown>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ))).toBeNull();

    const omittedLocalePublishDenied = await browserWriteResult(page, "/page-modules/document/publish", {
      pageKey,
      expectedUpdatedAt: zhDraft.updatedAt,
      expectedContentHash: zhDraft.contentHash,
    });
    expect(omittedLocalePublishDenied.status).toBe(400);

    const zhSubmitted = await apiWrite<PageDocumentSnapshot & { contentHash: string }>(
      editorSession,
      "/page-modules/document/review/submit",
      {
        pageKey,
        locale: "zh-CN",
        expectedUpdatedAt: zhDraft.updatedAt,
        expectedContentHash: zhDraft.contentHash,
      },
      "POST",
    );
    const zhApproved = await browserWrite<PageDocumentSnapshot & { contentHash: string }>(
      page,
      "/page-modules/document/review",
      {
        pageKey,
        locale: "zh-CN",
        action: "APPROVE",
        expectedUpdatedAt: zhSubmitted.updatedAt,
        expectedContentHash: zhSubmitted.contentHash,
      },
    );
    expect(await responseData<unknown>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ))).toBeNull();
    const zhPublished = await browserWrite<PageDocumentSnapshot & {
      contentHash: string;
      publishedRevisionId: number;
    }>(page, "/page-modules/document/publish", {
      pageKey,
      locale: "zh-CN",
      expectedUpdatedAt: zhApproved.updatedAt,
      expectedContentHash: zhApproved.contentHash,
    });
    expect(zhPublished.puckData.content[0]?.props?.title).toBe(zhTitle);
    expect((await responseData<PageDocumentSnapshot>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ))).puckData.content[0]?.props?.title).toBe(zhTitle);
    expect(await responseData<unknown>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ))).toBeNull();
    const unpublishedEnglishResponse = await page.goto(`${browserBaseUrl}/en/about`, { waitUntil: "commit" });
    expect(unpublishedEnglishResponse?.status()).toBe(404);
    await expect(page.getByText("Page not available")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(zhTitle);

    if (!realQaHandoffPath) throw new Error("phase1 缺少 PAGE_BUILDER_QA_HANDOFF_PATH");
    const handoff = JSON.parse(readFileSync(realQaHandoffPath, "utf8")) as RestartPhaseHandoff;
    handoff.bilingualDraftState = {
      pageKey,
      zh: {
        contentHash: zhPublished.contentHash,
        title: zhTitle,
        updatedAt: zhPublished.updatedAt,
        publishedRevisionId: zhPublished.publishedRevisionId,
      },
      en: {
        contentHash: enInitial.contentHash,
        title: enV1Title,
        updatedAt: enInitial.updatedAt,
      },
    };
    writeFileSync(realQaHandoffPath, JSON.stringify(handoff, null, 2), "utf8");

    const evidence = {
      qaRunId: process.env.PAGE_BUILDER_QA_RUN_ID,
      testTitle: testInfo.titlePath.join(" > "),
      project: testInfo.project.name,
      browserChannel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
      databaseBootstrap: process.env.PAGE_BUILDER_QA_DATABASE_BOOTSTRAP,
      appliedMigrations: Number(process.env.PAGE_BUILDER_QA_APPLIED_MIGRATIONS),
      pageKey,
      locales: ["zh-CN", "en"],
      assertions: {
        chinesePublicationVisibleAnonymously: true,
        englishNeverFallsBackToChinese: true,
        omittedLocalePublishDenied: true,
        browserErrors: [],
        browserRequestFailures: [],
      },
    };
    const evidencePath = testInfo.outputPath("bilingual-zh-publication-evidence.json");
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    await testInfo.attach("bilingual-zh-publication-evidence", {
      contentType: "application/json",
      path: evidencePath,
    });

    await editorSession.context.dispose();
  });
```

## [历史合同] 真实双语页面英文 V1 审核发布与快照隔离

```ts
test.skip("[历史合同] 真实双语页面英文 V1 审核发布与快照隔离", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAndPrepareIsolatedQaSite(page);
    if (!realQaHandoffPath) throw new Error("phase1 缺少 PAGE_BUILDER_QA_HANDOFF_PATH");
    const handoff = JSON.parse(readFileSync(realQaHandoffPath, "utf8")) as RestartPhaseHandoff;
    const draftState = handoff.bilingualDraftState;
    if (!draftState || draftState.pageKey !== "about") throw new Error("phase1 缺少双语草稿交接事实");

    const runToken = Date.now().toString(36);
    const editorCredentials = {
      username: `locale_editor_v1_${runToken}`,
      password: `Qa!E26_${runToken.slice(-6)}`,
    };
    const editorUser = await browserWrite<{ id: number }>(page, "/users", {
      username: editorCredentials.username,
      password: editorCredentials.password,
      realName: "双语页面合成 QA V1 编辑者",
      role: "EDITOR",
    }, "POST");
    expect(editorUser.id).toBeGreaterThan(0);
    const editorSession = await newAuthenticatedApiSession(editorCredentials);

    const pageKey = draftState.pageKey;
    const zhTitle = draftState.zh.title;
    const enV1Title = draftState.en.title;
    const zhPublished = draftState.zh;
    const enInitial = draftState.en;
    const makeDocument = (title: string) => ({
      content: [{
        type: "首屏主视觉",
        props: {
          id: `synthetic-locale-${runToken}`,
          title,
          subtitle: "SYNTHETIC QA CONTENT — NOT FORMAL BRAND COPY",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "Synthetic QA jewelry image",
          actionText: "",
          targetType: "none",
          linkUrl: "",
        },
      }],
      zones: {},
      root: { props: {} },
    });
    const metadata = {
      seoTitle: "SYNTHETIC QA — Haichuan Jewelry",
      seoDescription: "Synthetic bilingual publication lifecycle verification only.",
      contentOwner: "SYNTHETIC QA",
      mediaRights: [],
    };

    const submitted = await apiWrite<{
      updatedAt: string;
      contentHash: string;
      reviewStatus: string;
    }>(editorSession, "/page-modules/document/review/submit", {
      pageKey,
      locale: "en",
      expectedUpdatedAt: enInitial.updatedAt,
      expectedContentHash: enInitial.contentHash,
    }, "POST");
    expect(submitted.reviewStatus).toBe("IN_REVIEW");

    const editorReviewDenied = await apiWriteResult(editorSession, "/page-modules/document/review", {
      pageKey,
      locale: "en",
      action: "APPROVE",
      expectedUpdatedAt: submitted.updatedAt,
      expectedContentHash: submitted.contentHash,
    });
    expect(editorReviewDenied.status).toBe(403);
    const editorPublishDenied = await apiWriteResult(editorSession, "/page-modules/document/publish", {
      pageKey,
      locale: "en",
      expectedUpdatedAt: submitted.updatedAt,
      expectedContentHash: submitted.contentHash,
    });
    expect(editorPublishDenied.status).toBe(403);

    const changesRequested = await browserWrite<{
      updatedAt: string;
      contentHash: string;
      reviewStatus: string;
      reviewNote: string;
    }>(page, "/page-modules/document/review", {
      pageKey,
      locale: "en",
      action: "REQUEST_CHANGES",
      expectedUpdatedAt: submitted.updatedAt,
      expectedContentHash: submitted.contentHash,
      reviewNote: "Synthetic QA: replace draft marker before approval.",
    });
    expect(changesRequested).toMatchObject({
      reviewStatus: "CHANGES_REQUESTED",
      reviewNote: "Synthetic QA: replace draft marker before approval.",
    });

    const enV1Draft = await apiWrite<{
      updatedAt: string;
      contentHash: string;
      reviewStatus: string;
    }>(editorSession, "/page-modules/document", {
      pageKey,
      locale: "en",
      puckData: makeDocument(enV1Title),
      metadata,
      editorVersion: "0.22.4",
      expectedUpdatedAt: changesRequested.updatedAt,
    });
    expect(enV1Draft.reviewStatus).toBe("DRAFT");
    const enV1Submitted = await apiWrite<PageDocumentSnapshot & {
      contentHash: string;
      reviewStatus: string;
    }>(editorSession, "/page-modules/document/review/submit", {
      pageKey,
      locale: "en",
      expectedUpdatedAt: enV1Draft.updatedAt,
      expectedContentHash: enV1Draft.contentHash,
    }, "POST");
    const enV1Approved = await browserWrite<PageDocumentSnapshot & {
      contentHash: string;
      reviewStatus: string;
    }>(page, "/page-modules/document/review", {
      pageKey,
      locale: "en",
      action: "APPROVE",
      expectedUpdatedAt: enV1Submitted.updatedAt,
      expectedContentHash: enV1Submitted.contentHash,
    });
    expect(enV1Approved.reviewStatus).toBe("APPROVED");
    expect(await responseData<unknown>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ))).toBeNull();
    const enV1ApprovedAfterIdempotentSave = await browserWrite<PageDocumentSnapshot & {
      contentHash: string;
      reviewStatus: string;
    }>(page, "/page-modules/document", {
      pageKey,
      locale: "en",
      puckData: makeDocument(enV1Title),
      metadata,
      editorVersion: "0.22.4",
      expectedUpdatedAt: enV1Approved.updatedAt,
    });
    expect(enV1ApprovedAfterIdempotentSave).toMatchObject({
      contentHash: enV1Approved.contentHash,
      reviewStatus: "APPROVED",
    });
    await page.goto("/admin/editor/about");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await page.getByLabel("内容语言", { exact: true }).selectOption("en");
    await expect(page.getByTestId("page-review-status")).toHaveText("已批准");
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled();
    const enV1PublishResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    await publishButton.click();
    const enV1PublishedResponse = await enV1PublishResponse;
    expect(enV1PublishedResponse.ok()).toBe(true);
    const enV1Published = unwrap<PageDocumentSnapshot & {
      contentHash: string;
      reviewStatus: string;
      publishedRevisionId: number;
    }>(await enV1PublishedResponse.json());
    expect(enV1Published.reviewStatus).toBe("PUBLISHED");

    const publicV1 = await responseData<PageDocumentSnapshot>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ));
    expect(publicV1.puckData.content[0]?.props?.title).toBe(enV1Title);
    const publicZhAfterEnglishPublish = await responseData<PageDocumentSnapshot & {
      contentHash: string;
      locale: string;
    }>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publicZhAfterEnglishPublish).toMatchObject({
      contentHash: zhPublished.contentHash,
      locale: "zh-CN",
    });
    expect(publicZhAfterEnglishPublish.puckData.content[0]?.props?.title).toBe(zhTitle);

    // PageDocument 发布只改变数据库中的发布事实；当前客户端镜像的精确英文
    // 路由表仍来自启动前的不可变快照，必须继续失败关闭，直到生成并部署新制品。
    const databasePublishedStillInactive = await request.get(`${browserBaseUrl}/en/about`);
    expect(databasePublishedStillInactive.status()).toBe(404);
    expect(await databasePublishedStillInactive.text()).toContain("Page not available");
    const uppercaseEnglishResponse = await request.get(`${browserBaseUrl}/EN/about`);
    expect(uppercaseEnglishResponse.status()).toBe(404);
    const unsupportedEnglishResponse = await request.get(`${browserBaseUrl}/en/catalog`);
    expect(unsupportedEnglishResponse.status()).toBe(404);
    const unsupportedEnglishBody = await unsupportedEnglishResponse.text();
    expect(unsupportedEnglishBody).toContain("Page not available");
    expect(unsupportedEnglishBody).not.toContain("页面尚未发布");

    handoff.bilingualPublicationV1 = {
      pageKey,
      zh: {
        contentHash: zhPublished.contentHash,
        title: zhTitle,
        updatedAt: zhPublished.updatedAt,
        publishedRevisionId: zhPublished.publishedRevisionId,
      },
      en: {
        contentHash: enV1Published.contentHash,
        title: enV1Title,
        updatedAt: enV1Published.updatedAt,
        publishedRevisionId: enV1Published.publishedRevisionId,
      },
    };
    writeFileSync(realQaHandoffPath, JSON.stringify(handoff, null, 2), "utf8");

    const evidence = {
      qaRunId: process.env.PAGE_BUILDER_QA_RUN_ID,
      testTitle: testInfo.titlePath.join(" > "),
      project: testInfo.project.name,
      browserChannel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
      databaseBootstrap: process.env.PAGE_BUILDER_QA_DATABASE_BOOTSTRAP,
      appliedMigrations: Number(process.env.PAGE_BUILDER_QA_APPLIED_MIGRATIONS),
      pageKey,
      locales: ["zh-CN", "en"],
      assertions: {
        englishNeverFallsBackToChinese: true,
        editorReviewAndPublishDenied: true,
        runtimePublishRemainsInactiveUntilSnapshotPromotion: true,
        unsupportedEnglishRouteReturns404: true,
        browserErrors: [],
        browserRequestFailures: [],
      },
    };
    const evidencePath = testInfo.outputPath("bilingual-publication-v1-evidence.json");
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    await testInfo.attach("bilingual-publication-v1-evidence", {
      contentType: "application/json",
      path: evidencePath,
    });

    await editorSession.context.dispose();
  });
```

## [历史合同] 真实双语页面 V2 并发、发布回滚与历史保持

```ts
test.skip("[历史合同] 真实双语页面 V2 并发、发布回滚与历史保持", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    await loginAndPrepareIsolatedQaSite(page);
    if (!realQaHandoffPath) throw new Error("phase1 缺少 PAGE_BUILDER_QA_HANDOFF_PATH");
    const handoff = JSON.parse(readFileSync(realQaHandoffPath, "utf8")) as RestartPhaseHandoff;
    const v1 = handoff.bilingualPublicationV1;
    if (!v1 || v1.pageKey !== "about") throw new Error("phase1 缺少双语 V1 交接事实");

    const runToken = Date.now().toString(36);
    const editorCredentials = {
      username: `locale_editor_v2_${runToken}`,
      password: `Qa!E26_${runToken.slice(-6)}`,
    };
    const editorUser = await browserWrite<{ id: number }>(page, "/users", {
      username: editorCredentials.username,
      password: editorCredentials.password,
      realName: "双语页面合成 QA V2 编辑者",
      role: "EDITOR",
    }, "POST");
    expect(editorUser.id).toBeGreaterThan(0);
    const editorSession = await newAuthenticatedApiSession(editorCredentials);

    const pageKey = v1.pageKey;
    const enV1Title = v1.en.title;
    const enV2Title = `SYNTHETIC QA EN V2 ${runToken}`;
    const makeDocument = (title: string) => ({
      content: [{
        type: "首屏主视觉",
        props: {
          id: `synthetic-locale-${runToken}`,
          title,
          subtitle: "SYNTHETIC QA CONTENT — NOT FORMAL BRAND COPY",
          desktopImage: "/images/hero-desktop.jpg",
          mobileImage: "/images/hero-mobile.jpg",
          altText: "Synthetic QA jewelry image",
          actionText: "",
          targetType: "none",
          linkUrl: "",
        },
      }],
      zones: {},
      root: { props: {} },
    });
    const metadata = {
      seoTitle: "SYNTHETIC QA — Haichuan Jewelry",
      seoDescription: "Synthetic bilingual publication lifecycle verification only.",
      contentOwner: "SYNTHETIC QA",
      mediaRights: [],
    };
    const enV1Published = v1.en;

    const enV2Draft = await apiWrite<{
      updatedAt: string;
      contentHash: string;
      reviewStatus: string;
    }>(editorSession, "/page-modules/document", {
      pageKey,
      locale: "en",
      puckData: makeDocument(enV2Title),
      metadata,
      editorVersion: "0.22.4",
      expectedUpdatedAt: enV1Published.updatedAt,
    });
    expect(enV2Draft.reviewStatus).toBe("DRAFT");
    const staleSave = await apiWriteResult(editorSession, "/page-modules/document", {
      pageKey,
      locale: "en",
      puckData: makeDocument(`${enV2Title} STALE`),
      metadata,
      editorVersion: "0.22.4",
      expectedUpdatedAt: enV1Published.updatedAt,
    });
    expect(staleSave.status).toBe(409);
    const draftAfterConflict = await responseData<PageDocumentSnapshot & {
      contentHash: string;
      reviewStatus: string;
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}&locale=en`,
    ));
    expect(draftAfterConflict.puckData.content[0]?.props?.title).toBe(enV2Title);
    expect(draftAfterConflict).toMatchObject({
      contentHash: enV2Draft.contentHash,
      reviewStatus: "DRAFT",
    });
    const publicStillV1 = await responseData<PageDocumentSnapshot>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ));
    expect(publicStillV1.puckData.content[0]?.props?.title).toBe(enV1Title);

    const enV2Submitted = await apiWrite<PageDocumentSnapshot & { contentHash: string }>(
      editorSession,
      "/page-modules/document/review/submit",
      {
        pageKey,
        locale: "en",
        expectedUpdatedAt: enV2Draft.updatedAt,
        expectedContentHash: enV2Draft.contentHash,
      },
      "POST",
    );
    const enV2Approved = await browserWrite<PageDocumentSnapshot & { contentHash: string }>(
      page,
      "/page-modules/document/review",
      {
        pageKey,
        locale: "en",
        action: "APPROVE",
        expectedUpdatedAt: enV2Submitted.updatedAt,
        expectedContentHash: enV2Submitted.contentHash,
      },
    );
    const publicAfterV2Approval = await responseData<PageDocumentSnapshot>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ));
    expect(publicAfterV2Approval.puckData.content[0]?.props?.title).toBe(enV1Title);
    const enV2Published = await browserWrite<PageDocumentSnapshot & { contentHash: string; publishedRevisionId: number }>(
      page,
      "/page-modules/document/publish",
      {
        pageKey,
        locale: "en",
        expectedUpdatedAt: enV2Approved.updatedAt,
        expectedContentHash: enV2Approved.contentHash,
      },
    );
    const publicV2 = await responseData<PageDocumentSnapshot & { contentHash: string }>(
      await request.get(
        `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
      ),
    );
    expect(publicV2).toMatchObject({ contentHash: enV2Published.contentHash });
    expect(publicV2.puckData.content[0]?.props?.title).toBe(enV2Title);
    const history = await responseData<{ items: PageDocumentRevisionSummary[] }>(
      await page.request.get(`${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&locale=en&limit=20`),
    );
    expect(history.items).toHaveLength(2);
    expect(history.items.filter((item) => item.isPublished)).toEqual([
      expect.objectContaining({ id: enV2Published.publishedRevisionId }),
    ]);
    const v1Revision = history.items.find((item) => item.id === enV1Published.publishedRevisionId);
    expect(v1Revision).toBeTruthy();
    const zhHistory = await responseData<{ items: PageDocumentRevisionSummary[] }>(
      await page.request.get(`${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&locale=zh-CN&limit=20`),
    );
    expect(zhHistory.items).toHaveLength(1);
    expect(zhHistory.items[0]?.id).toBe(v1.zh.publishedRevisionId);

    const rolledBack = await browserWrite<PageDocumentSnapshot & { reviewStatus: string }>(
      page,
      `/page-modules/document/revisions/${v1Revision!.id}/rollback-publication`,
      {
        pageKey,
        locale: "en",
        expectedPublishedRevisionId: enV2Published.publishedRevisionId,
      },
    );
    expect(rolledBack.reviewStatus).toBe("APPROVED");
    const publicAfterRollback = await responseData<PageDocumentSnapshot & { contentHash: string; updatedAt: string }>(await request.get(
      `${browserBaseUrl}/api/page-modules/document/published?pageKey=${pageKey}&locale=en`,
    ));
    expect(publicAfterRollback.puckData.content[0]?.props?.title).toBe(enV1Title);
    const historyAfterRollback = await responseData<{ items: PageDocumentRevisionSummary[] }>(
      await page.request.get(`${apiBaseUrl}/page-modules/document/revisions?pageKey=${pageKey}&locale=en&limit=20`),
    );
    expect(historyAfterRollback.items).toHaveLength(3);
    expect(historyAfterRollback.items.filter((item) => item.isPublished)).toEqual([
      expect.objectContaining({ id: rolledBack.publishedRevisionId }),
    ]);
    expect(historyAfterRollback.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      enV1Published.publishedRevisionId,
      enV2Published.publishedRevisionId,
      rolledBack.publishedRevisionId,
    ]));
    const draftAfterRollback = await responseData<PageDocumentSnapshot>(
      await editorSession.context.get(`/api/page-modules/document/admin?pageKey=${pageKey}&locale=en`, {
        headers: { Cookie: editorSession.cookieHeader },
      }),
    );
    expect(draftAfterRollback.puckData.content[0]?.props?.title).toBe(enV2Title);
    handoff.bilingualPublication = {
      pageKey,
      zh: {
        contentHash: v1.zh.contentHash,
        title: v1.zh.title,
        lastModified: v1.zh.updatedAt.slice(0, 10),
      },
      en: {
        contentHash: publicAfterRollback.contentHash,
        title: enV1Title,
        lastModified: publicAfterRollback.updatedAt.slice(0, 10),
      },
    };
    writeFileSync(realQaHandoffPath, JSON.stringify(handoff, null, 2), "utf8");

    const evidence = {
      qaRunId: process.env.PAGE_BUILDER_QA_RUN_ID,
      testTitle: testInfo.titlePath.join(" > "),
      project: testInfo.project.name,
      browserChannel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
      databaseBootstrap: process.env.PAGE_BUILDER_QA_DATABASE_BOOTSTRAP,
      appliedMigrations: Number(process.env.PAGE_BUILDER_QA_APPLIED_MIGRATIONS),
      pageKey,
      locales: ["zh-CN", "en"],
      assertions: {
        v1HandoffVerified: true,
        englishV2PublicPointerVerified: true,
        optimisticConflictRereadVerified: true,
        rollbackPreservesDraft: true,
        browserErrors: [],
        browserRequestFailures: [],
      },
    };
    const evidencePath = testInfo.outputPath("bilingual-publication-evidence.json");
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    await testInfo.attach("bilingual-publication-evidence", {
      contentType: "application/json",
      path: evidencePath,
    });

    await editorSession.context.dispose();
  });
```
