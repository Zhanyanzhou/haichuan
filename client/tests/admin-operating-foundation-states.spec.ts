import { expect, test, type Page, type Route } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const wrapped = (data: unknown) =>
  JSON.stringify({ code: 200, data, message: "ok" });

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "operating-foundation-admin",
    realName: "经营底座测试管理员",
    role: "SUPER_ADMIN",
  });
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body:
      status >= 400
        ? JSON.stringify({ code: status, data: null, message: "test failure" })
        : wrapped(data),
  });
}

test.describe("后台经营底座第一批状态", () => {
  test("通知故障台安全重投在丢响应后保留原凭据且不自动再次入队", async ({ page }) => {
    await authenticateAdmin(page);
    let retryCalls = 0;
    let safeFailurePending = true;
    const retryIdempotencyKeys: string[] = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/notification-operations/failures") && request.method() === "GET") {
        await fulfillJson(route, {
          list: [
            ...(safeFailurePending ? [{
              id: 81,
              notificationId: 41,
              notificationType: "ORDER_CREATED",
              notificationStatus: "AVAILABLE",
              deliveryStatus: "FAILED",
              attempts: 5,
              lastErrorCode: "SMTP_SEND_FAILED",
              retryable: true,
              updatedAt: "2026-09-12T01:05:00.000Z",
            }] : []),
            {
              id: 82,
              notificationId: 42,
              notificationType: "PAYMENT_CONFIRMED",
              notificationStatus: "AVAILABLE",
              deliveryStatus: "FAILED",
              attempts: 1,
              lastErrorCode: "DELIVERY_RESULT_UNKNOWN",
              retryable: false,
              updatedAt: "2026-09-12T01:06:00.000Z",
            },
          ],
          total: safeFailurePending ? 2 : 1,
          page: 1,
          pageSize: 20,
        });
        return;
      }
      if (
        path.endsWith("/api/notification-operations/failures/81/retry")
        && request.method() === "POST"
      ) {
        retryCalls += 1;
        retryIdempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
        safeFailurePending = false;
        if (retryCalls === 1) {
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, { eventId: 81, notificationId: 41, status: "PENDING" });
        return;
      }
      if (path.endsWith("/api/settings/logs")) {
        await fulfillJson(route, { list: [], total: 0, page: 1, pageSize: 30 });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/audit-logs");
    await expect(page.getByRole("heading", { name: "通知投递故障" })).toBeVisible();
    await expect(page.getByText("ORDER_CREATED · #41")).toBeVisible();
    await expect(page.getByText("PAYMENT_CONFIRMED · #42")).toBeVisible();
    await expect(page.getByText("需人工核对")).toBeVisible();
    await expect(page.getByText(/@|1380000|customer@example/)).toHaveCount(0);

    await page.getByRole("button", { name: "重投通知事件 81" }).click();
    await page.getByRole("button", { name: "重新投递", exact: true }).click();

    await expect(page.getByText("通知重投结果待确认", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用原凭据恢复通知事件 81" })).toBeVisible();
    await expect.poll(() => retryCalls).toBe(1);
    await page.waitForTimeout(200);
    expect(retryCalls).toBe(1);

    await page.getByRole("button", { name: "使用原凭据恢复通知事件 81" }).click();
    await page.getByRole("button", { name: "确认恢复", exact: true }).click();

    await expect(page.getByText("已确认重新进入投递队列，最终结果将写入操作日志")).toBeVisible();
    await expect.poll(() => retryCalls).toBe(2);
    expect(retryIdempotencyKeys[0]).toBeTruthy();
    expect(retryIdempotencyKeys[1]).toBe(retryIdempotencyKeys[0]);
    await expect(page.getByText("ORDER_CREATED · #41")).toHaveCount(0);
    await expect(page.getByText("PAYMENT_CONFIRMED · #42")).toBeVisible();
  });

  test("库存审计把调整前后数量显示为可读变化并使用准确字段名", async ({ page }) => {
    await authenticateAdmin(page);

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/notification-operations/failures")) {
        await fulfillJson(route, { list: [], total: 0, page: 1, pageSize: 20 });
        return;
      }
      if (path.endsWith("/api/settings/logs")) {
        await fulfillJson(route, {
          list: [{
            id: 91,
            userId: 1,
            action: "stock_update",
            module: "inventory",
            targetId: 12,
            detail: JSON.stringify({
              type: "adjust",
              quantity: 11,
              before: 8,
              after: 11,
              remark: null,
            }),
            ip: "127.0.0.1",
            createdAt: "2026-09-20T08:00:00.000Z",
            user: {
              username: "operating-foundation-admin",
              realName: "经营底座测试管理员",
            },
          }],
          total: 1,
          page: 1,
          pageSize: 30,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/audit-logs");
    await expect(page.getByText("库存已更新", { exact: true })).toBeVisible();
    await expect(page.getByText("库存 8 → 11")).toBeVisible();
    await page.getByRole("button", { name: "查看详情" }).click();
    const drawer = page.getByRole("dialog", { name: "库存已更新" });
    await expect(drawer.getByText("调整方式")).toBeVisible();
    await expect(drawer.getByText("直接调整")).toBeVisible();
    await expect(drawer.getByText("操作数量")).toBeVisible();
    await expect(drawer.getByText("调整前库存")).toBeVisible();
    await expect(drawer.getByText("调整后库存")).toBeVisible();
    await expect(drawer.getByText("备注")).toBeVisible();
  });

  test("线索留存批次审计显示可核对计数、政策证据与候选摘要", async ({ page }) => {
    await authenticateAdmin(page);
    const candidateSetSha256 = "c".repeat(64);

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/notification-operations/failures")) {
        await fulfillJson(route, { list: [], total: 0, page: 1, pageSize: 20 });
        return;
      }
      if (path.endsWith("/api/settings/logs")) {
        await fulfillJson(route, {
          list: [{
            id: 92,
            userId: 1,
            action: "LEAD_RETENTION_DISPOSITION_EXECUTED",
            module: "leads",
            targetId: null,
            detail: JSON.stringify({
              schemaVersion: 1,
              asOf: "2026-09-24T08:00:00.000Z",
              requested: 20,
              anonymized: 19,
              skipped: 1,
              eligibleRemaining: 3,
              complete: false,
              candidateSetSha256,
              policyApprovalReferenceSha256: "a".repeat(64),
              policyVersion: "lead-retention-v1",
              policyFingerprintSha256: "b".repeat(64),
            }),
            createdAt: "2026-09-24T08:00:01.000Z",
            user: {
              username: "operating-foundation-admin",
              realName: "经营底座测试管理员",
            },
          }],
          total: 1,
          page: 1,
          pageSize: 30,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/audit-logs");
    const row = page.getByRole("row").filter({ hasText: "线索留存处置已执行" });
    await expect(row.getByText("线索运营", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "查看详情" }).click();
    const drawer = page.getByRole("dialog", { name: "线索留存处置已执行" });
    await expect(drawer.getByText("本批候选数")).toBeVisible();
    await expect(drawer.getByText("已匿名化数")).toBeVisible();
    await expect(drawer.getByText("剩余到期候选数")).toBeVisible();
    await expect(drawer.getByText("候选集合摘要")).toBeVisible();
    await expect(drawer.getByText(candidateSetSha256)).toBeVisible();
    await expect(drawer.getByText("留存政策版本")).toBeVisible();
    await expect(drawer.getByText("lead-retention-v1")).toBeVisible();
  });

  test("合作申请加载失败可重试，审核写请求保持可恢复且移动端不产生页面级横向滚动", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      document.cookie = "hc_csrf=partner-review-csrf; Path=/";
    });
    let mode: "fail" | "success" = "fail";
    const reviewBodies: unknown[] = [];
    const agreementHash = "a".repeat(64);
    const applicationRecord = {
      id: 7,
      customerId: 17,
      applicantName: "合作申请测试客户",
      applicantPhone: "13800001234",
      companyName: "测试珠宝工作室",
      channelType: "线下工作室",
      status: "PENDING",
      isLatest: true,
      isCurrent: true,
      currentPartnerStatus: "PENDING",
      allowedReviewActions: ["APPROVED", "NEEDS_SUPPLEMENT", "REJECTED"],
      agreementAcceptedAt: "2026-08-27T07:59:00.000Z",
      agreementVersion: "partner-agreement-v1",
      agreementHash,
      submittedAt: "2026-08-27T08:00:00.000Z",
      createdAt: "2026-08-27T08:00:00.000Z",
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/flags")) {
        await fulfillJson(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: true,
        });
        return;
      }
      if (path.endsWith("/api/partner-applications") && request.method() === "GET") {
        if (mode === "fail") {
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, {
          list: [applicationRecord],
          total: 1,
        });
        return;
      }
      if (
        path.endsWith("/api/partner-applications/7")
        && request.method() === "GET"
      ) {
        await fulfillJson(route, applicationRecord);
        return;
      }
      if (
        path.endsWith("/api/partner-applications/7/review")
        && request.method() === "PUT"
      ) {
        reviewBodies.push(request.postDataJSON());
        await fulfillJson(route, { id: 7, status: "APPROVED" });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/partner-applications");
    await expect(
      page.getByText("合作申请列表加载失败，请稍后重新加载。"),
    ).toBeVisible();

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("合作申请测试客户")).toBeVisible();
    await expect(page.getByText("138****1234")).toBeVisible();

    await page.locator(".ant-table-content").evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.getByRole("button", { name: /详\s*情/ }).click();
    const detailDrawer = page.getByRole("dialog", { name: "申请详情" });
    await expect(detailDrawer.getByText("partner-agreement-v1")).toBeVisible();
    await expect(detailDrawer.getByText(agreementHash)).toBeVisible();
    await detailDrawer.locator(".ant-drawer-close").click();

    await page.getByRole("button", { name: /审\s*核/ }).click();
    await page.getByRole("button", { name: "提交审核" }).click();
    await expect(page.getByText("审核已提交")).toBeVisible();
    await expect.poll(() => reviewBodies.length).toBe(1);
    expect(reviewBodies[0]).toEqual({ action: "APPROVED" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("管理员暂停前二次确认，并可从并发冲突重新加载后恢复合作资格", async ({ page }) => {
    await authenticateAdmin(page);
    await page.addInitScript(() => {
      document.cookie = "hc_csrf=partner-admin-transition-csrf; Path=/";
    });
    let currentStatus: "APPROVED" | "SUSPENDED" = "APPROVED";
    let conflictPending = true;
    let reloadFailurePending = false;
    const reviewBodies: unknown[] = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/flags")) {
        await fulfillJson(route, { partnerApplicationsWriteEnabled: true });
        return;
      }
      if (path.endsWith("/api/partner-applications") && request.method() === "GET") {
        if (reloadFailurePending) {
          reloadFailurePending = false;
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, {
          list: [{
            id: 27,
            customerId: 127,
            applicantName: "并发状态测试客户",
            applicantPhone: "13800001227",
            companyName: "合作资格测试商户",
            status: currentStatus,
            isLatest: true,
            isCurrent: true,
            currentPartnerStatus: currentStatus,
            allowedReviewActions: currentStatus === "APPROVED" ? ["SUSPENDED"] : ["APPROVED"],
            submittedAt: "2026-09-01T08:00:00.000Z",
            createdAt: "2026-09-01T08:00:00.000Z",
          }],
          total: 1,
        });
        return;
      }
      if (
        path.endsWith("/api/partner-applications/27/review")
        && request.method() === "PUT"
      ) {
        const body = request.postDataJSON();
        reviewBodies.push(body);
        if (conflictPending) {
          conflictPending = false;
          currentStatus = "SUSPENDED";
          reloadFailurePending = true;
          await fulfillJson(route, null, 409);
          return;
        }
        currentStatus = "APPROVED";
        await fulfillJson(route, { id: 27, status: currentStatus });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/partner-applications");
    await page.getByRole("button", { name: /暂\s*停/ }).click();
    await page.getByRole("textbox", { name: "审核说明" }).fill("暂停复核说明");
    await page.getByRole("button", { name: "提交审核" }).click();
    await expect(page.getByRole("button", { name: "确认暂停" })).toBeVisible();
    await page.getByRole("button", { name: "确认暂停" }).click();

    await expect(page.getByText("数据已被其他操作更新，请重新加载后再试。")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新加载当前状态" })).toBeVisible();
    await page.getByRole("button", { name: "重新加载当前状态" }).click();
    const retainedDialog = page.getByRole("dialog", { name: "审核申请 #27" });
    await expect(retainedDialog).toBeVisible();
    await expect(page.getByText("当前状态重新加载失败，审核内容已保留，请稍后重试。")).toBeVisible();
    await expect(retainedDialog.getByText("暂停合作资格", { exact: true })).toBeVisible();
    await expect(retainedDialog.getByRole("textbox", { name: "审核说明" })).toHaveValue("暂停复核说明");
    await page.getByRole("button", { name: "重新加载当前状态" }).click();
    await expect(page.getByRole("button", { name: /恢\s*复/ })).toBeVisible();

    await page.getByRole("button", { name: /恢\s*复/ }).click();
    await page.getByRole("button", { name: "提交审核" }).click();
    await expect(page.getByRole("button", { name: "确认恢复" })).toBeVisible();
    await page.getByRole("button", { name: "确认恢复" }).click();
    await expect(page.getByText("合作资格已恢复")).toBeVisible();

    expect(reviewBodies).toEqual([
      { action: "SUSPENDED", reviewNote: "暂停复核说明" },
      { action: "APPROVED" },
    ]);
  });

  test("客服只能看到当前状态允许的普通审核动作，不展示暂停或恢复入口", async ({ page }) => {
    await installAdminSession(page, {
      username: "partner-customer-service",
      realName: "合作申请客服",
      role: "CUSTOMER_SERVICE",
    });

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/flags")) {
        await fulfillJson(route, { partnerApplicationsWriteEnabled: true });
        return;
      }
      if (path.endsWith("/api/partner-applications") && request.method() === "GET") {
        await fulfillJson(route, {
          list: [
            {
              id: 31,
              customerId: 131,
              applicantName: "待审核客户",
              applicantPhone: "13800001331",
              status: "PENDING",
              isLatest: true,
              isCurrent: true,
              currentPartnerStatus: "PENDING",
              allowedReviewActions: ["APPROVED", "NEEDS_SUPPLEMENT", "REJECTED"],
              submittedAt: "2026-09-02T08:00:00.000Z",
              createdAt: "2026-09-02T08:00:00.000Z",
            },
            {
              id: 32,
              customerId: 132,
              applicantName: "已通过客户",
              applicantPhone: "13800001332",
              status: "APPROVED",
              isLatest: true,
              isCurrent: true,
              currentPartnerStatus: "APPROVED",
              allowedReviewActions: [],
              submittedAt: "2026-09-02T08:00:00.000Z",
              createdAt: "2026-09-02T08:00:00.000Z",
            },
            {
              id: 33,
              customerId: 133,
              applicantName: "已暂停客户",
              applicantPhone: "13800001333",
              status: "SUSPENDED",
              isLatest: true,
              isCurrent: true,
              currentPartnerStatus: "SUSPENDED",
              allowedReviewActions: [],
              submittedAt: "2026-09-02T08:00:00.000Z",
              createdAt: "2026-09-02T08:00:00.000Z",
            },
          ],
          total: 3,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/partner-applications");
    await expect(page.getByRole("button", { name: /审\s*核/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /暂\s*停/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /恢\s*复/ })).toHaveCount(0);

    await page.getByRole("button", { name: /审\s*核/ }).click();
    const reviewDialog = page.getByRole("dialog", { name: "审核申请 #31" });
    const actionSelect = reviewDialog.getByRole("combobox");
    await reviewDialog.locator(".ant-select-selector").click({ position: { x: 5, y: 5 } });
    await expect(actionSelect).toHaveAttribute("aria-expanded", "true");
    const actionDropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
    await expect(actionDropdown.getByText("通过（授予合作权限）", { exact: true })).toBeVisible();
    await expect(actionDropdown.getByText("要求补充资料", { exact: true })).toBeVisible();
    await expect(actionDropdown.getByText("驳回", { exact: true })).toBeVisible();
    await expect(actionDropdown.getByText("暂停合作资格", { exact: true })).toHaveCount(0);
  });

  test("旧补充申请被新 PENDING 版本替代后只读，客服只能审核最新记录", async ({ page }) => {
    await installAdminSession(page, {
      username: "partner-history-customer-service",
      realName: "合作申请历史测试客服",
      role: "CUSTOMER_SERVICE",
    });

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/flags")) {
        await fulfillJson(route, { partnerApplicationsWriteEnabled: true });
        return;
      }
      if (path.endsWith("/api/partner-applications") && request.method() === "GET") {
        await fulfillJson(route, {
          list: [
            {
              id: 42,
              customerId: 142,
              applicantName: "同一合作客户",
              applicantPhone: "13800001442",
              companyName: "最新重提版本",
              status: "PENDING",
              isLatest: true,
              isCurrent: true,
              currentPartnerStatus: "PENDING",
              allowedReviewActions: ["APPROVED", "NEEDS_SUPPLEMENT", "REJECTED"],
              submittedAt: "2026-09-21T08:00:00.000Z",
              createdAt: "2026-09-21T08:00:00.000Z",
            },
            {
              id: 41,
              customerId: 142,
              applicantName: "同一合作客户",
              applicantPhone: "13800001442",
              companyName: "旧补充版本",
              status: "NEEDS_SUPPLEMENT",
              isLatest: false,
              isCurrent: false,
              currentPartnerStatus: "PENDING",
              allowedReviewActions: [],
              submittedAt: "2026-09-20T08:00:00.000Z",
              createdAt: "2026-09-20T08:00:00.000Z",
            },
          ],
          total: 2,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/partner-applications");
    const oldRow = page.getByRole("row").filter({ hasText: "旧补充版本" });
    const latestRow = page.getByRole("row").filter({ hasText: "最新重提版本" });

    await expect(oldRow.getByText("历史只读 · 已被后续申请替代", { exact: true })).toBeVisible();
    await expect(oldRow.getByRole("button", { name: /审\s*核/ })).toHaveCount(0);
    await expect(latestRow.getByRole("button", { name: /审\s*核/ })).toHaveCount(1);
    await latestRow.getByRole("button", { name: /审\s*核/ }).click();
    await expect(page.getByRole("dialog", { name: "审核申请 #42" })).toBeVisible();
  });

  test("Inventory 失败不显示零值，重试后标清全量与当前页并按当前页导出", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    let mode: "fail" | "success" = "fail";
    let releaseInventory!: () => void;
    const inventoryGate = new Promise<void>((resolve) => {
      releaseInventory = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/api/auth/profile")) return route.fallback();
      if (url.pathname.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (url.pathname.endsWith("/api/inventory")) {
        if (mode === "fail") {
          await inventoryGate;
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, {
          list: [
            {
              id: 11,
              quantity: 8,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
              warehouse: { name: "深圳展厅" },
            },
            {
              id: 12,
              quantity: 0,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-12", product: { name: "测试项链" } },
              warehouse: { name: "深圳展厅" },
            },
          ],
          total: 41,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("正在加载库存数据…")).toBeVisible();
    releaseInventory();

    await expect(page.getByText("库存数据加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("库存记录总数（全量）")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导出当前页" })).toBeDisabled();

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("库存记录总数（全量）")).toBeVisible();
    await expect(
      page.getByText("全量总数来自服务端；提示标签与筛选只作用于当前页已加载记录，不能代表全仓库存状态。"),
    ).toBeVisible();
    await expect(page.getByText("本页正常")).toBeVisible();
    await expect(page.getByText("本页缺货")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出当前页" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("库存报表");
    await expect(page.getByText("已导出当前页 2 条库存记录")).toBeVisible();
  });

  test("Inventory 明确展示空数据", async ({ page }) => {
    await authenticateAdmin(page);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      await fulfillJson(
        route,
        path.endsWith("/api/inventory")
          ? { list: [], total: 0 }
          : path.endsWith("/api/warehouses")
            ? []
            : {},
      );
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("暂无库存记录")).toBeVisible();
    await expect(page.getByText("库存记录总数（全量）")).toHaveCount(0);
  });

  test("Inventory 设为目标库存发送 adjust 契约，并反馈非法输入与接口失败", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    let quantity = 8;
    let updateMode: "success" | "conflict" = "success";
    let updateCalls = 0;
    let lastUpdateBody: unknown;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "PUT") {
        updateCalls += 1;
        lastUpdateBody = request.postDataJSON();
        if (updateMode === "conflict") {
          quantity = 6;
          await fulfillJson(route, null, 409);
          return;
        }
        quantity = Number((lastUpdateBody as { quantity?: number }).quantity);
        await fulfillJson(route, { id: 11, quantity });
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "GET") {
        await fulfillJson(route, { id: 11, quantity });
        return;
      }
      if (path.endsWith("/api/inventory")) {
        await fulfillJson(route, {
          list: [
            {
              id: 11,
              quantity,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
              warehouse: { name: "深圳展厅" },
            },
          ],
          total: 1,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("测试戒指")).toBeVisible();

    const inventoryRow = page.getByRole("row").filter({ hasText: "测试戒指" });
    await inventoryRow.getByRole("button").click();
    const targetQuantity = page.getByRole("spinbutton", { name: "目标库存" });
    await targetQuantity.fill("5");
    await page.getByRole("button", { name: "保存库存调整" }).click();

    await expect(page.getByText("库存已调整")).toBeVisible();
    expect(lastUpdateBody).toEqual({
      type: "adjust",
      quantity: 5,
      expectedQuantity: 8,
    });
    expect(updateCalls).toBe(1);

    await inventoryRow.getByRole("button").click();
    await targetQuantity.clear();
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("目标库存必须是非负整数").last()).toBeVisible();
    expect(updateCalls).toBe(1);

    await targetQuantity.fill("-1");
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("目标库存必须是非负整数").last()).toBeVisible();
    expect(updateCalls).toBe(1);

    await targetQuantity.fill("1.5");
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("目标库存必须是非负整数").last()).toBeVisible();
    expect(updateCalls).toBe(1);

    updateMode = "conflict";
    await targetQuantity.fill("7");
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(
      page.getByText("库存已被其他操作更新，已按最新结果重新加载"),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toHaveCount(0);
    await expect(inventoryRow.getByText("6", { exact: true })).toBeVisible();
    expect(lastUpdateBody).toEqual({
      type: "adjust",
      quantity: 7,
      expectedQuantity: 5,
    });
    expect(updateCalls).toBe(2);
  });

  test("Inventory 写响应丢失后只读确认已生效或未生效，不自动重放 PUT", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    let quantity = 8;
    let mode: "committed-loss" | "uncommitted-loss" | "success" = "committed-loss";
    let putCalls = 0;
    let authorityReads = 0;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "PUT") {
        putCalls += 1;
        const body = request.postDataJSON() as {
          quantity: number;
          expectedQuantity: number;
        };
        expect(body.expectedQuantity).toBe(quantity);
        if (mode === "committed-loss") {
          quantity = body.quantity;
          await route.abort("failed");
          return;
        }
        if (mode === "uncommitted-loss") {
          await route.abort("failed");
          return;
        }
        quantity = body.quantity;
        await fulfillJson(route, { id: 11, quantity });
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "GET") {
        authorityReads += 1;
        await fulfillJson(route, { id: 11, quantity });
        return;
      }
      if (path.endsWith("/api/inventory")) {
        await fulfillJson(route, {
          list: [{
            id: 11,
            quantity,
            safetyStock: 2,
            sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
            warehouse: { name: "深圳展厅" },
          }],
          total: 1,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    let inventoryRow = page.getByRole("row").filter({ hasText: "测试戒指" });
    await inventoryRow.getByRole("button", { name: /调\s*整/ }).click();
    const targetQuantity = page.getByRole("spinbutton", { name: "目标库存" });
    await targetQuantity.fill("5");
    await page.getByRole("button", { name: "保存库存调整" }).click();

    await expect(page.getByText("权威库存已是目标值")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toHaveCount(0);
    await expect(inventoryRow.getByText("5", { exact: true })).toBeVisible();
    expect(putCalls).toBe(1);
    expect(authorityReads).toBe(1);

    mode = "uncommitted-loss";
    inventoryRow = page.getByRole("row").filter({ hasText: "测试戒指" });
    await inventoryRow.getByRole("button", { name: /调\s*整/ }).click();
    await targetQuantity.fill("7");
    await page.getByRole("button", { name: "保存库存调整" }).click();

    await expect(page.getByText("库存调整未生效，可再次确认保存")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toBeVisible();
    expect(putCalls).toBe(2);
    expect(authorityReads).toBe(2);

    mode = "success";
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("库存已调整")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toHaveCount(0);
    expect(putCalls).toBe(3);
    expect(authorityReads).toBe(2);
  });

  test("Inventory 权威第三值或核验失败时关闭写入口并重新加载", async ({ page }) => {
    await authenticateAdmin(page);
    let quantity = 8;
    let mode: "concurrent-loss" | "authority-failure" = "concurrent-loss";
    let putCalls = 0;
    let authorityReads = 0;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "PUT") {
        putCalls += 1;
        if (mode === "concurrent-loss") quantity = 6;
        await route.abort("failed");
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "GET") {
        authorityReads += 1;
        if (mode === "authority-failure") {
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, { id: 11, quantity });
        return;
      }
      if (path.endsWith("/api/inventory")) {
        await fulfillJson(route, {
          list: [{
            id: 11,
            quantity,
            safetyStock: 2,
            sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
            warehouse: { name: "深圳展厅" },
          }],
          total: 1,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    let inventoryRow = page.getByRole("row").filter({ hasText: "测试戒指" });
    await inventoryRow.getByRole("button", { name: /调\s*整/ }).click();
    const targetQuantity = page.getByRole("spinbutton", { name: "目标库存" });
    await targetQuantity.fill("5");
    await page.getByRole("button", { name: "保存库存调整" }).click();

    await expect(
      page.getByText("库存已被其他操作更新，已按最新结果重新加载"),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toHaveCount(0);
    await expect(inventoryRow.getByText("6", { exact: true })).toBeVisible();
    expect(putCalls).toBe(1);
    expect(authorityReads).toBe(1);

    mode = "authority-failure";
    inventoryRow = page.getByRole("row").filter({ hasText: "测试戒指" });
    await inventoryRow.getByRole("button", { name: /调\s*整/ }).click();
    await targetQuantity.fill("4");
    await page.getByRole("button", { name: "保存库存调整" }).click();

    await expect(
      page.getByText("库存调整结果待确认，已停止重复提交。请重新加载库存后核对。"),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toHaveCount(0);
    expect(putCalls).toBe(2);
    expect(authorityReads).toBe(2);
  });

  test("UserManage 隐藏失败前的旧结果，重试与筛选空态可恢复", async ({ page }) => {
    await authenticateAdmin(page);
    let mode: "old" | "fail" | "fresh" | "empty" = "old";
    let releaseUsers!: () => void;
    const usersGate = new Promise<void>((resolve) => {
      releaseUsers = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (!path.endsWith("/api/users")) {
        await fulfillJson(route, {});
        return;
      }
      if (mode === "old") {
        await usersGate;
        await fulfillJson(route, {
          list: [
            {
              id: 1,
              username: "old-result",
              realName: "旧结果员工",
              role: "ADMIN",
              status: "ACTIVE",
              createdAt: "2026-08-22T00:00:00.000Z",
            },
          ],
          total: 1,
          roleCounts: { ADMIN: 1 },
        });
        return;
      }
      if (mode === "fail") {
        await fulfillJson(route, null, 503);
        return;
      }
      if (mode === "empty") {
        await fulfillJson(route, { list: [], total: 0, roleCounts: {} });
        return;
      }
      await fulfillJson(route, {
        list: [
          {
            id: 2,
            username: "fresh-result",
            realName: "新结果员工",
            role: "EDITOR",
            status: "ACTIVE",
            createdAt: "2026-08-22T00:00:00.000Z",
          },
        ],
        total: 1,
        roleCounts: { EDITOR: 1 },
      });
    });

    await page.goto("/admin/users");
    await expect(page.getByText("正在加载后台员工数据…")).toBeVisible();
    releaseUsers();
    await expect(page.getByText("旧结果员工")).toBeVisible();

    mode = "fail";
    const search = page.getByPlaceholder("搜索用户名 / 姓名 / 手机号");
    await search.fill("新员工");
    await search.press("Enter");
    await expect(page.getByText("后台员工数据加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("旧结果员工")).toHaveCount(0);
    await expect(page.getByText("超级管理员")).toHaveCount(0);

    mode = "fresh";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("新结果员工")).toBeVisible();
    await expect(page.getByText("旧结果员工")).toHaveCount(0);

    mode = "empty";
    await search.fill("无结果");
    await search.press("Enter");
    await expect(page.getByText("没有符合当前筛选条件的后台员工")).toBeVisible();
  });

  test("GoldPrice 分项显示失败，重试成功且空数据不伪造价格", async ({ page }) => {
    await authenticateAdmin(page);
    let mode: "partial" | "success" | "empty" = "partial";
    let releaseGold!: () => void;
    const goldGate = new Promise<void>((resolve) => {
      releaseGold = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (!path.includes("/api/gold-price/")) {
        await fulfillJson(route, {});
        return;
      }
      if (mode === "partial") {
        await goldGate;
        if (path.endsWith("/history")) {
          await fulfillJson(route, []);
        } else {
          await fulfillJson(route, null, 503);
        }
        return;
      }
      if (mode === "empty") {
        if (path.endsWith("/automation-status")) {
          await fulfillJson(route, { autoFetchConfigured: true });
        } else {
          await fulfillJson(route, path.endsWith("/history") ? [] : null);
        }
        return;
      }
      if (path.endsWith("/latest")) {
        await fulfillJson(route, {
          id: 31,
          price: 520.88,
          change: 2.5,
          source: "MANUAL",
          recordDate: "2026-08-22T00:00:00.000Z",
        });
      } else if (path.endsWith("/history")) {
        await fulfillJson(route, [
          {
            id: 31,
            price: 520.88,
            change: 2.5,
            source: "MANUAL",
            recordDate: "2026-08-22T00:00:00.000Z",
          },
        ]);
      } else {
        await fulfillJson(route, { autoFetchConfigured: false });
      }
    });

    await page.goto("/admin/gold-price");
    await expect(page.getByText("正在加载金价数据…")).toBeVisible();
    releaseGold();

    await expect(page.getByText("当前金价加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("自动抓取配置状态加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("暂无金价历史")).toBeVisible();
    await expect(page.getByText("485", { exact: true })).toHaveCount(0);
    await expect(page.getByText("0.00", { exact: true })).toHaveCount(0);

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).first().click();
    await expect(page.getByText("520.88 元/克", { exact: true })).toBeVisible();
    await expect(page.getByText("自动抓取未配置，当前金价需手动维护")).toBeVisible();

    mode = "empty";
    await page.reload();
    await expect(page.getByText("尚未配置当前金价")).toBeVisible();
    await expect(page.getByText("暂无金价历史")).toBeVisible();
    await expect(page.getByText("只记录金价事实，不会改写商品售价")).toBeVisible();
    await page.getByRole("button", { name: "更新金价" }).click();
    await expect(page.getByText("保存后只新增一条金价记录")).toBeVisible();
    await expect(page.getByText("重算全店")).toHaveCount(0);
    await expect(page.getByRole("spinbutton")).toHaveValue("");
  });
});

test.describe("后台经营底座第二批状态", () => {
  test("订单详情失败时保留抽屉并可就地重新加载", async ({ page }) => {
    await authenticateAdmin(page);
    let detailAttempts = 0;
    const order = {
      id: 501,
      orderNo: "HC-ORDER-501",
      customerName: "详情恢复测试客户",
      customerPhone: "13800000501",
      address: "测试地址",
      totalAmount: 12800,
      discountAmount: 0,
      finalAmount: 12800,
      paidAmount: 0,
      status: "PENDING_PAYMENT",
      orderType: "SPOT",
      deliveryStatus: "PENDING_SHIP",
      payments: [],
      items: [],
      createdAt: "2026-09-06T08:00:00.000Z",
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/orders/501")) {
        detailAttempts += 1;
        if (detailAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, order);
      }
      if (path.endsWith("/api/orders")) {
        return fulfillJson(route, { list: [order], total: 1 });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/orders");
    await page.getByRole("row").filter({ hasText: "HC-ORDER-501" })
      .getByRole("button", { name: "详情" }).click();

    const drawer = page.getByRole("dialog", { name: "订单详情" });
    await expect(drawer.getByText("订单详情加载失败", { exact: true })).toBeVisible();
    await expect(drawer.getByText("HC-ORDER-501", { exact: true })).toHaveCount(0);
    await drawer.getByRole("button", { name: "重新加载" }).click();
    await expect(drawer.getByText("HC-ORDER-501", { exact: true }).first()).toBeVisible();
    expect(detailAttempts).toBe(2);
  });

  test("报价单详情失败时保留抽屉并可就地重新加载", async ({ page }) => {
    await authenticateAdmin(page);
    let detailAttempts = 0;
    const quotation = {
      id: 601,
      quoteNo: "HC-QUOTE-601",
      customerName: "报价恢复测试客户",
      customerPhone: "13800000601",
      status: "DRAFT",
      totalAmount: 16800,
      discountAmount: 800,
      finalAmount: 16000,
      depositAmount: 2000,
      items: [],
      createdAt: "2026-09-06T08:00:00.000Z",
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/quotations/601")) {
        detailAttempts += 1;
        if (detailAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, quotation);
      }
      if (path.endsWith("/api/quotations")) {
        return fulfillJson(route, { list: [quotation], total: 1 });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/trade/quotations");
    await page.getByRole("row").filter({ hasText: "HC-QUOTE-601" })
      .getByRole("button", { name: "详情" }).click();

    const drawer = page.getByRole("dialog", { name: "报价单详情" });
    await expect(drawer.getByText("报价单详情加载失败", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "重新加载" }).click();
    await expect(drawer.getByText("HC-QUOTE-601", { exact: true }).first()).toBeVisible();
    expect(detailAttempts).toBe(2);
  });

  test("备份状态查询失败不伪造未挂载状态，重试后显示真实结果", async ({ page }) => {
    await authenticateAdmin(page);
    let attempts = 0;

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/backup")) {
        attempts += 1;
        if (attempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, {
          lastBackup: "2026-09-06T07:00:00.000Z",
          autoBackup: true,
          storageMounted: true,
          backupSchedule: "每 24 小时执行一次",
          totalBackups: 3,
          executionStatus: "SUCCESS",
          lastAttemptFinishedAt: "2026-09-06T07:05:00.000Z",
          lastExitCode: 0,
          message: "最近一次备份已完成。",
          latestFiles: [],
        });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/settings");
    await expect(page.getByText("备份状态加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("未挂载", { exact: true })).toHaveCount(0);
    await expect(page.getByText("自动备份", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("数据库与媒体备份", { exact: true })).toBeVisible();
    await expect(page.getByText("已成功", { exact: true })).toBeVisible();
    await expect(page.getByText("已配置", { exact: true })).toBeVisible();
    expect(attempts).toBe(2);
  });

  test("未知备份执行状态安全降级而不让系统设置页崩溃", async ({ page }) => {
    await authenticateAdmin(page);

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/backup")) {
        return fulfillJson(route, {
          lastBackup: null,
          autoBackup: false,
          storageMounted: true,
          backupSchedule: null,
          totalBackups: 0,
          executionStatus: "UPSTREAM_NEW_STATUS",
          message: "上游返回了尚未识别的状态。",
          latestFiles: [],
        });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible();
    await expect(page.getByText("状态未知", { exact: true })).toHaveCount(2);
    await expect(page.getByText("上游返回了尚未识别的状态。", { exact: true })).toHaveCount(2);
  });

  test("商品批量操作部分失败后保留失败项选择", async ({ page }) => {
    await authenticateAdmin(page);
    const products = [
      {
        id: 701,
        code: "HC-PRODUCT-701",
        name: "批量成功商品",
        categoryId: 1,
        materialType: "GOLD",
        status: "DRAFT",
        price: 12800,
        totalStock: 1,
        salesCount: 0,
        images: [],
        skus: [],
        createdAt: "2026-09-06T08:00:00.000Z",
      },
      {
        id: 702,
        code: "HC-PRODUCT-702",
        name: "批量失败商品",
        categoryId: 1,
        materialType: "GOLD",
        status: "DRAFT",
        price: 16800,
        totalStock: 1,
        salesCount: 0,
        images: [],
        skus: [],
        createdAt: "2026-09-06T08:00:00.000Z",
      },
    ];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/products/counts")) {
        return fulfillJson(route, { all: 2, DRAFT: 2, PUBLISHED: 0, OFFLINE: 0, ARCHIVED: 0 });
      }
      if (path.endsWith("/api/products/701/status") && request.method() === "PUT") {
        return fulfillJson(route, { id: 701, status: "PUBLISHED" });
      }
      if (path.endsWith("/api/products/702/status") && request.method() === "PUT") {
        return fulfillJson(route, null, 503);
      }
      if (path.endsWith("/api/products")) {
        return fulfillJson(route, { list: products, total: 2 });
      }
      if (path.endsWith("/api/categories/admin/tree")) {
        return fulfillJson(route, []);
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/products");
    const successRow = page.getByRole("row").filter({ hasText: "批量成功商品" });
    const failedRow = page.getByRole("row").filter({ hasText: "批量失败商品" });
    await successRow.getByRole("checkbox").check();
    await failedRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: "更多批量操作" }).click();
    await page.getByRole("menuitem", { name: "批量上架" }).click();
    const publishDialog = page.getByRole("dialog", { name: "确认批量上架 2 件商品？" });
    await expect(publishDialog.getByText(/立即对各自当前可见范围内的客户展示/)).toBeVisible();
    await publishDialog.getByRole("button", { name: "确认批量上架" }).click();

    await expect(page.getByText(/已完成 1 项，共 2 项；未完成项请检查后重试/)).toBeVisible();
    await expect(successRow.getByRole("checkbox")).not.toBeChecked();
    await expect(failedRow.getByRole("checkbox")).toBeChecked();
    await expect(page.getByText("已选 1 件", { exact: true })).toBeVisible();
  });

  test("商品单个上架与通过审核并上架均先说明公开后果", async ({ page }) => {
    await authenticateAdmin(page);
    let statusUpdates = 0;
    const products = [
      {
        id: 711, code: "HC-PRODUCT-711", name: "待上架商品", categoryId: 1,
        materialType: "GOLD", status: "DRAFT", price: 12800, totalStock: 1,
        salesCount: 0, images: [], skus: [], createdAt: "2026-09-06T08:00:00.000Z",
      },
      {
        id: 712, code: "HC-PRODUCT-712", name: "待审核商品", categoryId: 1,
        materialType: "GOLD", status: "DRAFT", reviewStatus: "IN_REVIEW", price: 16800,
        totalStock: 1, salesCount: 0, images: [], skus: [], createdAt: "2026-09-06T08:00:00.000Z",
      },
    ];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/products/counts")) {
        return fulfillJson(route, { all: 2, DRAFT: 2, PUBLISHED: 0, OFFLINE: 0, ARCHIVED: 0 });
      }
      if (/\/api\/products\/71[12]\/status$/.test(path) && request.method() === "PUT") {
        statusUpdates += 1;
        return fulfillJson(route, { id: Number(path.split("/").at(-2)), status: "PUBLISHED" });
      }
      if (path.endsWith("/api/products")) return fulfillJson(route, { list: products, total: 2 });
      if (path.endsWith("/api/categories/admin/tree")) return fulfillJson(route, []);
      return fulfillJson(route, {});
    });

    await page.goto("/admin/products");
    await page.getByRole("row").filter({ hasText: "待上架商品" }).getByRole("button", { name: "上架", exact: true }).click();
    expect(statusUpdates).toBe(0);
    let dialog = page.getByRole("dialog", { name: "上架“待上架商品”？" });
    await expect(dialog.getByText(/立即对当前可见范围内的客户展示/)).toBeVisible();
    await dialog.getByRole("button", { name: "确认上架" }).click();
    await expect.poll(() => statusUpdates).toBe(1);

    await page.getByRole("row").filter({ hasText: "待审核商品" }).getByRole("button", { name: "通过并上架" }).click();
    dialog = page.getByRole("dialog", { name: "通过审核并上架“待审核商品”？" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "确认通过并上架" }).click();
    await expect.poll(() => statusUpdates).toBe(2);
  });

  test("订单取消在 409 与 500 后保留弹窗和原因并允许原地重试", async ({ page }) => {
    await authenticateAdmin(page);
    let attempts = 0;
    const payloads: Array<Record<string, unknown>> = [];
    const order = {
      id: 721, orderNo: "HC-ORDER-721", customerName: "取消恢复测试客户",
      customerPhone: "13800000721", address: "测试地址", totalAmount: 12800,
      discountAmount: 0, finalAmount: 12800, paidAmount: 0, status: "PENDING_PAYMENT",
      orderType: "SPOT", deliveryStatus: "PENDING_SHIP", payments: [], items: [],
      createdAt: "2026-09-06T08:00:00.000Z",
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/orders/721/status") && request.method() === "PUT") {
        attempts += 1;
        payloads.push(request.postDataJSON());
        if (attempts === 1) return fulfillJson(route, null, 409);
        if (attempts === 2) return fulfillJson(route, null, 500);
        return fulfillJson(route, { ...order, status: "CANCELLED" });
      }
      if (path.endsWith("/api/orders")) return fulfillJson(route, { list: [order], total: 1 });
      return fulfillJson(route, {});
    });

    await page.goto("/admin/orders");
    await page.getByRole("row").filter({ hasText: "HC-ORDER-721" }).getByRole("button", { name: /取\s*消/ }).click();
    const dialog = page.getByRole("dialog", { name: "取消订单“HC-ORDER-721”？" });
    const reason = dialog.getByLabel("取消原因");
    await reason.fill("客户要求取消并重新确认款式");
    await dialog.getByRole("button", { name: "确认取消" }).click();
    await expect.poll(() => attempts).toBe(1);
    await expect(dialog).toBeVisible();
    await expect(reason).toHaveValue("客户要求取消并重新确认款式");
    await dialog.getByRole("button", { name: "确认取消" }).click();
    await expect.poll(() => attempts).toBe(2);
    await expect(dialog).toBeVisible();
    await expect(reason).toHaveValue("客户要求取消并重新确认款式");
    await dialog.getByRole("button", { name: "确认取消" }).click();
    await expect(dialog).toBeHidden();
    expect(payloads).toEqual([
      { status: "CANCELLED", internalNote: "客户要求取消并重新确认款式" },
      { status: "CANCELLED", internalNote: "客户要求取消并重新确认款式" },
      { status: "CANCELLED", internalNote: "客户要求取消并重新确认款式" },
    ]);
  });

  test("ADMIN 无法打开 SUPER_ADMIN 编辑入口且能看到权限说明", async ({ page }) => {
    await installAdminSession(page, {
      username: "operating-foundation-admin-role",
      realName: "普通管理员",
      role: "ADMIN",
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/users")) {
        return fulfillJson(route, {
          list: [
            { id: 731, username: "root-admin", realName: "超级管理员", role: "SUPER_ADMIN", status: "ACTIVE" },
            { id: 732, username: "content-admin", realName: "普通员工", role: "EDITOR", status: "ACTIVE" },
          ],
          total: 2,
          roleCounts: { SUPER_ADMIN: 1, EDITOR: 1 },
        });
      }
      return fulfillJson(route, {});
    });

    await page.goto("/admin/users");
    const superRow = page.getByRole("row").filter({ hasText: "root-admin" });
    const restrictedEdit = superRow.getByRole("button", { name: "编辑" });
    await expect(restrictedEdit).toBeDisabled();
    await restrictedEdit.locator("xpath=..").hover();
    await expect(page.getByText("仅超级管理员可编辑超级管理员账号")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "content-admin" }).getByRole("button", { name: "编辑" })).toBeEnabled();
  });

  test("报价客户搜索失败后保留输入并可在下拉中重试", async ({ page }) => {
    await authenticateAdmin(page);
    let customerAttempts = 0;
    await page.route("**/api/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/quotations/issue-customers")) {
        customerAttempts += 1;
        if (customerAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, {
          list: [{ id: 751, name: "搜索恢复客户", phone: "13800000751", accountType: "MEMBER", partnerStatus: "NONE", status: "ACTIVE" }],
        });
      }
      if (path.endsWith("/api/quotations")) return fulfillJson(route, { list: [], total: 0 });
      if (path.endsWith("/api/users/assignable")) return fulfillJson(route, []);
      return fulfillJson(route, {});
    });

    await page.goto("/admin/trade/quotations");
    await page.getByRole("button", { name: "新建报价" }).click();
    const dialog = page.getByRole("dialog", { name: "新建报价" });
    const customerSearch = dialog.locator(".ant-select-selection-search-input").first();
    await customerSearch.fill("恢复客户");
    await expect(page.getByText("客户搜索失败，请保留当前输入并重试。")).toBeVisible();
    await expect(customerSearch).toHaveValue("恢复客户");
    await page.getByRole("button", { name: "重新搜索客户" }).click();
    await expect(page.getByText("搜索恢复客户 · 13800000751")).toBeVisible();
    expect(customerAttempts).toBe(2);
  });

  test("人工建单商品与 SKU 搜索失败后分别保留输入并可重试", async ({ page }) => {
    await authenticateAdmin(page);
    let productAttempts = 0;
    let skuAttempts = 0;
    await page.route("**/api/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/orders")) return fulfillJson(route, { list: [], total: 0 });
      if (path.endsWith("/api/products/761/skus")) {
        skuAttempts += 1;
        if (skuAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, [{ id: 762, skuCode: "SKU-762", price: 18800 }]);
      }
      if (path.endsWith("/api/products")) {
        if (!requestUrl.searchParams.get("keyword")) return fulfillJson(route, { list: [], total: 0 });
        productAttempts += 1;
        if (productAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, {
          list: [{ id: 761, name: "搜索恢复戒指", code: "HC-761", status: "DRAFT", images: [], skus: [] }], total: 1,
        });
      }
      return fulfillJson(route, {});
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "人工建单" }).click();
    const dialog = page.getByRole("dialog", { name: "人工建单" });
    const productSearch = dialog.locator(".ant-select-selection-search-input").nth(1);
    await productSearch.fill("恢复戒指");
    await expect(page.getByText("商品搜索失败，请保留当前输入并重试。")).toBeVisible();
    await expect(productSearch).toHaveValue("恢复戒指");
    await page.getByRole("button", { name: "重新搜索商品" }).click();
    await page.getByText("搜索恢复戒指 (HC-761)").click();
    await dialog.locator(".ant-select").nth(2).click();
    await expect(page.getByText("SKU 加载失败，请重试。")).toBeVisible();
    await page.getByRole("button", { name: "重新加载 SKU" }).click();
    await expect(page.getByText("SKU-762", { exact: true })).toBeVisible();
    expect(productAttempts).toBe(2);
    expect(skuAttempts).toBe(2);
  });

  test("商品与报价客户搜索只允许最新请求写入结果、错误和加载状态", async ({ page }) => {
    await authenticateAdmin(page);
    let releaseOldProduct!: () => void;
    let markOldProductStarted!: () => void;
    const oldProductGate = new Promise<void>((resolve) => { releaseOldProduct = resolve; });
    const oldProductStarted = new Promise<void>((resolve) => { markOldProductStarted = resolve; });

    await page.route("**/api/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/orders")) return fulfillJson(route, { list: [], total: 0 });
      if (path.endsWith("/api/products")) {
        const keyword = requestUrl.searchParams.get("keyword");
        if (keyword === "旧商品") {
          markOldProductStarted();
          await oldProductGate;
          return fulfillJson(route, { list: [{ id: 791, name: "旧搜索商品", code: "HC-OLD", status: "DRAFT", images: [], skus: [] }], total: 1 });
        }
        if (keyword === "新商品") {
          return fulfillJson(route, { list: [{ id: 792, name: "新搜索商品", code: "HC-NEW", status: "DRAFT", images: [], skus: [] }], total: 1 });
        }
        return fulfillJson(route, { list: [], total: 0 });
      }
      return fulfillJson(route, {});
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "人工建单" }).click();
    let dialog = page.getByRole("dialog", { name: "人工建单" });
    const productSearch = dialog.locator(".ant-select-selection-search-input").nth(1);
    await productSearch.fill("旧商品");
    await oldProductStarted;
    await productSearch.fill("新商品");
    await expect(page.getByText("新搜索商品 (HC-NEW)")).toBeVisible();
    releaseOldProduct();
    await expect(page.getByText("旧搜索商品 (HC-OLD)")).toHaveCount(0);
    await expect(page.getByText("商品搜索失败，请保留当前输入并重试。")).toHaveCount(0);

    await page.unroute("**/api/**");
    let releaseOldCustomer!: () => void;
    let markOldCustomerStarted!: () => void;
    let oldCustomerSettled = false;
    const oldCustomerGate = new Promise<void>((resolve) => { releaseOldCustomer = resolve; });
    const oldCustomerStarted = new Promise<void>((resolve) => { markOldCustomerStarted = resolve; });
    await page.route("**/api/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/quotations")) return fulfillJson(route, { list: [], total: 0 });
      if (path.endsWith("/api/users/assignable")) return fulfillJson(route, []);
      if (path.endsWith("/api/quotations/issue-customers")) {
        const keyword = requestUrl.searchParams.get("keyword");
        if (keyword === "旧客户") {
          markOldCustomerStarted();
          await oldCustomerGate;
          await fulfillJson(route, null, 503);
          oldCustomerSettled = true;
          return;
        }
        if (keyword === "新客户") {
          return fulfillJson(route, { list: [{ id: 793, name: "新搜索客户", phone: "13800000793", accountType: "MEMBER", partnerStatus: "NONE", status: "ACTIVE" }] });
        }
      }
      return fulfillJson(route, {});
    });

    await page.goto("/admin/trade/quotations");
    await page.getByRole("button", { name: "新建报价" }).click();
    dialog = page.getByRole("dialog", { name: "新建报价" });
    const customerSearch = dialog.locator(".ant-select-selection-search-input").first();
    await customerSearch.fill("旧客户");
    await oldCustomerStarted;
    await customerSearch.fill("新客户");
    await expect(page.getByText("新搜索客户 · 13800000793")).toBeVisible();
    releaseOldCustomer();
    await expect.poll(() => oldCustomerSettled).toBe(true);
    await expect(page.getByText("新搜索客户 · 13800000793")).toBeVisible();
    await expect(page.getByText("客户搜索失败，请保留当前输入并重试。")).toHaveCount(0);
  });

  test("同商品 SKU 重复加载时旧失败不能覆盖新成功", async ({ page }) => {
    await authenticateAdmin(page);
    let skuCalls = 0;
    let releaseOldSku!: () => void;
    let markOldSkuStarted!: () => void;
    let oldSkuSettled = false;
    const oldSkuGate = new Promise<void>((resolve) => { releaseOldSku = resolve; });
    const oldSkuStarted = new Promise<void>((resolve) => { markOldSkuStarted = resolve; });
    await page.route("**/api/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const path = requestUrl.pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/orders")) return fulfillJson(route, { list: [], total: 0 });
      if (path.endsWith("/api/products/801/skus")) {
        skuCalls += 1;
        if (skuCalls === 1) {
          markOldSkuStarted();
          await oldSkuGate;
          await fulfillJson(route, null, 503);
          oldSkuSettled = true;
          return;
        }
        return fulfillJson(route, [{ id: 802, skuCode: "SKU-LATEST", price: 28800 }]);
      }
      if (path.endsWith("/api/products/803/skus")) return fulfillJson(route, []);
      if (path.endsWith("/api/products")) {
        return fulfillJson(route, {
          list: [
            { id: 801, name: "并发 SKU 商品", code: "HC-801", status: "DRAFT", images: [], skus: [] },
            { id: 803, name: "切换用商品", code: "HC-803", status: "DRAFT", images: [], skus: [] },
          ],
          total: 2,
        });
      }
      return fulfillJson(route, {});
    });

    await page.goto("/admin/orders");
    await page.getByRole("button", { name: "人工建单" }).click();
    const dialog = page.getByRole("dialog", { name: "人工建单" });
    await dialog.locator(".ant-select").nth(1).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option-content").filter({ hasText: "并发 SKU 商品 (HC-801)" }).last().click();
    await oldSkuStarted;
    await dialog.locator(".ant-select").nth(1).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option-content").filter({ hasText: "切换用商品 (HC-803)" }).last().click();
    await dialog.locator(".ant-select").nth(1).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option-content").filter({ hasText: "并发 SKU 商品 (HC-801)" }).last().click();
    await expect.poll(() => skuCalls).toBe(2);
    await dialog.locator(".ant-select").nth(2).click();
    await expect(page.getByText("SKU-LATEST", { exact: true })).toBeVisible();
    releaseOldSku();
    await expect.poll(() => oldSkuSettled).toBe(true);
    await expect(page.getByText("SKU-LATEST", { exact: true })).toBeVisible();
    await expect(page.getByText("SKU 加载失败，请重试。")).toHaveCount(0);
  });

  test("商品复制子资源部分失败使用警告并列出未完成项", async ({ page }) => {
    await authenticateAdmin(page);
    const source = {
      id: 771, code: "HC-PRODUCT-771", name: "复制源商品", categoryId: 1,
      materialType: "GOLD", status: "DRAFT", price: 12800, totalStock: 1,
      salesCount: 0, skus: [], tags: [{ id: 1, tagName: "新品" }], certificates: [],
      images: [{ id: 1, url: "/failed-image.jpg", type: "FRONT", sortOrder: 1, isVideo: false }],
      createdAt: "2026-09-06T08:00:00.000Z",
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/products/counts")) return fulfillJson(route, { all: 1, DRAFT: 1, PUBLISHED: 0, OFFLINE: 0, ARCHIVED: 0 });
      if (path.endsWith("/api/products/771") && request.method() === "GET") return fulfillJson(route, source);
      if (path.endsWith("/api/products") && request.method() === "POST") return fulfillJson(route, { ...source, id: 772, name: "复制源商品（副本）", images: [], tags: [] });
      if (path.endsWith("/api/products/772/images")) return fulfillJson(route, null, 503);
      if (path.endsWith("/api/products/772/tags")) return fulfillJson(route, []);
      if (path.endsWith("/api/products")) return fulfillJson(route, { list: [source], total: 1 });
      if (path.endsWith("/api/categories/admin/tree")) return fulfillJson(route, []);
      return fulfillJson(route, {});
    });

    await page.goto("/admin/products");
    await page.getByRole("row").filter({ hasText: "复制源商品" }).getByRole("button", { name: "复制", exact: true }).click();
    const warning = page.locator(".ant-message-warning");
    await expect(warning).toContainText(/主商品「复制源商品（副本）」已创建；未完成：图片 1/);
  });

  test("订单、报价与客户列表忽略逆序返回的陈旧请求", async ({ page }) => {
    await authenticateAdmin(page);
    const cases = [
      {
        pagePath: "/admin/orders", apiPath: "/api/orders", placeholder: "订单号 / 客户 / 手机号",
        oldText: "HC-ORDER-OLD", newText: "HC-ORDER-NEW",
        oldRow: { id: 781, orderNo: "HC-ORDER-OLD", customerName: "旧订单客户", customerPhone: "13800000781", totalAmount: 1, finalAmount: 1, paidAmount: 0, status: "PENDING_PAYMENT", orderType: "SPOT", deliveryStatus: "PENDING_SHIP", createdAt: "2026-09-06T08:00:00.000Z" },
        newRow: { id: 782, orderNo: "HC-ORDER-NEW", customerName: "新订单客户", customerPhone: "13800000782", totalAmount: 2, finalAmount: 2, paidAmount: 0, status: "PENDING_PAYMENT", orderType: "SPOT", deliveryStatus: "PENDING_SHIP", createdAt: "2026-09-06T08:00:00.000Z" },
      },
      {
        pagePath: "/admin/trade/quotations", apiPath: "/api/quotations", placeholder: "搜索报价单号、客户姓名或手机号",
        oldText: "HC-QUOTE-OLD", newText: "HC-QUOTE-NEW",
        oldRow: { id: 783, quoteNo: "HC-QUOTE-OLD", channel: "CUSTOM", currentVersion: 1, customerName: "旧报价客户", customerPhone: "13800000783", totalAmount: 1, finalAmount: 1, status: "DRAFT", createdAt: "2026-09-06T08:00:00.000Z" },
        newRow: { id: 784, quoteNo: "HC-QUOTE-NEW", channel: "CUSTOM", currentVersion: 1, customerName: "新报价客户", customerPhone: "13800000784", totalAmount: 2, finalAmount: 2, status: "DRAFT", createdAt: "2026-09-06T08:00:00.000Z" },
      },
      {
        pagePath: "/admin/customers", apiPath: "/api/customers/admin", placeholder: "搜索手机号 / 姓名 / 邮箱（回车应用）",
        oldText: "旧客户档案", newText: "新客户档案",
        oldRow: { id: 785, phone: "13800000785", name: "旧客户档案", email: null, status: "ACTIVE", accountType: "MEMBER", partnerStatus: "NONE", lastOrderAt: null, createdAt: "2026-09-06T08:00:00.000Z", _count: { orders: 0, favorites: 0, inquiries: 0 } },
        newRow: { id: 786, phone: "13800000786", name: "新客户档案", email: null, status: "ACTIVE", accountType: "MEMBER", partnerStatus: "NONE", lastOrderAt: null, createdAt: "2026-09-06T08:00:00.000Z", _count: { orders: 0, favorites: 0, inquiries: 0 } },
      },
    ];

    for (const target of cases) {
      let calls = 0;
      let releaseOld!: () => void;
      const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/api/auth/profile")) return route.fallback();
        if (path === target.apiPath) {
          calls += 1;
          if (calls === 1) {
            await oldGate;
            return fulfillJson(route, { list: [target.oldRow], total: 1 });
          }
          return fulfillJson(route, { list: [target.newRow], total: 1 });
        }
        return fulfillJson(route, {});
      });
      await page.goto(target.pagePath);
      const search = page.getByPlaceholder(target.placeholder);
      await search.fill("new");
      await search.press("Enter");
      await expect(page.getByText(target.newText, { exact: true })).toBeVisible();
      releaseOld();
      await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
      await expect(page.getByText(target.oldText, { exact: true })).toHaveCount(0);
      await page.unroute("**/api/**");
    }
  });

  test("390px 下高频运营页保留对象、主操作且不产生页面级横向滚动", async ({ page }) => {
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/products/counts")) {
        return fulfillJson(route, { all: 0, DRAFT: 0, PUBLISHED: 0, OFFLINE: 0, ARCHIVED: 0 });
      }
      if (path.endsWith("/api/products")) {
        return fulfillJson(route, { list: [], total: 0 });
      }
      if (path.endsWith("/api/categories/admin/tree")) {
        return fulfillJson(route, []);
      }
      if (path.endsWith("/api/orders")) {
        return fulfillJson(route, { list: [], total: 0 });
      }
      if (path.endsWith("/api/quotations")) {
        return fulfillJson(route, {
          list: [{
            id: 741, quoteNo: "HC-QUOTE-741", channel: "CUSTOM", currentVersion: 1,
            customerName: "窄屏报价客户", customerPhone: "13800000741", totalAmount: 16800,
            finalAmount: 16000, depositAmount: 2000, validUntil: "2026-10-01T00:00:00.000Z",
            status: "DRAFT", createdAt: "2026-09-06T08:00:00.000Z",
          }], total: 1,
        });
      }
      if (path.endsWith("/api/customers/admin")) {
        return fulfillJson(route, { list: [], total: 0 });
      }
      if (path.endsWith("/api/settings/backup")) {
        return fulfillJson(route, {
          lastBackup: null,
          autoBackup: false,
          storageMounted: false,
          backupSchedule: null,
          totalBackups: 0,
          executionStatus: "UNKNOWN",
          message: "本地环境未挂载备份目录。",
          latestFiles: [],
        });
      }
      await fulfillJson(route, {});
    });

    const pages = [
      { path: "/admin/products", heading: "商品管理", action: "新建商品" },
      { path: "/admin/orders", heading: "订单中心", action: "人工建单" },
      { path: "/admin/trade/quotations", heading: "报价管理", action: "新建报价" },
      { path: "/admin/customers", heading: "客户管理", action: "刷新" },
      { path: "/admin/settings", heading: "系统设置", action: "刷新备份状态" },
    ];

    for (const target of pages) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { name: target.heading })).toBeVisible();
      await expect(page.getByRole("button", { name: target.action })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${target.path} 不应产生页面级横向滚动`,
      ).toBe(true);
    }

    await page.goto("/admin/trade/quotations");
    const tableScroll = page.locator(".ant-table-content").first();
    await expect(page.getByText("HC-QUOTE-741", { exact: true })).toBeVisible();
    expect(await tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await tableScroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect(page.getByRole("row").filter({ hasText: "HC-QUOTE-741" }).getByRole("button", { name: "详情" })).toBeVisible();

    await page.goto("/admin/products");
    const advanced = page.getByRole("button", { name: /展\s*开/ });
    await advanced.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /收\s*起/ }))
      .toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#product-advanced-filters")).toBeVisible();
  });
});
