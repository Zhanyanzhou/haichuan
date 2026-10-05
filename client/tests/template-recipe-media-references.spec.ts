import { expect, test } from "@playwright/test";
import { AxiosError, AxiosHeaders } from "axios";
import api from "../src/services/httpClient";
import { advanceSessionEpoch } from "../src/services/sessionEpoch";
import {
  getDynamicTemplateDocumentMediaReferences as clientReferences,
  hasExplicitDynamicTemplateInstanceImage,
} from "../src/page-builder/dynamic-template-instance/mediaReferences";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { compileDynamicTemplateRenderPlan } from "../src/page-builder/template-definition/renderPlan";
import {
  getLocalUploadUrls,
  resolveEditorMediaProbeUrl,
  editorMediaProbeIndicatesMissing,
} from "../src/page-builder/runtime/renderParity";
import {
  isStaffManagedMediaPreviewUrl,
  loadManagedTemplateMediaObjectUrl,
  resetManagedTemplateMediaObjectUrlCacheForTests,
  resolveManagedTemplateMediaPreviewUrl,
} from "../src/page-builder/template-definition/managedMediaPreview";

function definitionFixture() {
  const definition = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"), {
    name: "媒体引用测试",
    templateId: "tpl_media_reference_test",
  });
  const headingSlot = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
  const heading = Object.values(definition.nodes).find((node) => node.slotId === headingSlot.slotId)!;
  const container = Object.values(definition.nodes).find((node) => node.childIds.includes(heading.nodeId))!;
  const imageSlot = Object.values(definition.slots).find((slot) => slot.type === "image")!;
  const image = Object.values(definition.nodes).find((node) => node.slotId === imageSlot.slotId)!;
  const imageContainer = Object.values(definition.nodes).find((node) => node.childIds.includes(image.nodeId))!;
  const visibleSlot = Object.values(definition.slots).find((slot) => (
    slot.type === "text" && slot.slotId !== headingSlot.slotId
  ))!;
  return {
    definition,
    containerId: container.nodeId,
    headingId: heading.nodeId,
    headingSlotId: headingSlot.slotId,
    imageContainerId: imageContainer.nodeId,
    imageSlotId: imageSlot.slotId,
    rootId: definition.rootNodeId,
    visibleSlotId: visibleSlot.slotId,
  };
}

test("客户端背景引用覆盖仅手机可见、隐藏父级与空槽位", () => {
  const { definition, containerId, headingId, headingSlotId, rootId, visibleSlotId } = definitionFixture();
  definition.schemaVersion = 3;
  definition.templateRecipe = createRecommendedRecipe();
  definition.nodes[rootId].responsive.desktop.backgroundImage = "/uploads/root.jpg";
  definition.nodes[containerId].responsive.desktop.display = "none";
  definition.nodes[containerId].responsive.tablet = {
    display: "block",
    backgroundImage: "/uploads/tablet.jpg",
  };
  definition.nodes[containerId].responsive.mobile = {
    ...definition.nodes[containerId].responsive.mobile,
    display: "block",
    backgroundImage: "/uploads/mobile.jpg",
  };
  definition.nodes[headingId].responsive.desktop.backgroundImage = "/uploads/heading.jpg";
  const props = { id: "instance_preview", instanceId: "instance_preview", instanceSchemaVersion: 1, moduleName: "预览", templateId: definition.templateId, templateVersion: 1, contentBySlotId: { [visibleSlotId]: "保持模板可达" }, layoutOverridesByNodeId: {}, hiddenSlotIds: [] as string[], isVisible: true };
  const probe = compileDynamicTemplateRenderPlan(definition, {
    device: "desktop",
    breakpoint: "desktop",
    contentBySlotId: props.contentBySlotId,
    showEmptySlots: false,
  });
  expect(probe.ok, JSON.stringify(probe)).toBe(true);
  const document = { content: [{ type: "动态模板实例", props }], resolvedDynamicTemplates: { [`${definition.templateId}@1`]: { templateId: definition.templateId, version: 1, schemaVersion: 3, definitionChecksum: "a".repeat(64), definition } } };
  const urls = (collect: (input: unknown) => Array<{ url: string }>) => collect(document).map((item) => item.url).sort();
  expect(urls(clientReferences)).toEqual(["/uploads/mobile.jpg", "/uploads/root.jpg"]);
  definition.defaultContent[headingSlotId] = "标题";
  expect(urls(clientReferences)).toEqual(["/uploads/heading.jpg", "/uploads/mobile.jpg", "/uploads/root.jpg"]);
  props.hiddenSlotIds = [headingSlotId];
  expect(urls(clientReferences)).toEqual(["/uploads/mobile.jpg", "/uploads/root.jpg"]);
  definition.nodes[containerId].hidden = true;
  expect(urls(clientReferences)).toEqual(["/uploads/root.jpg"]);
  props.isVisible = false;
  expect(urls(clientReferences)).toEqual([]);
});

test("公开模板显隐按当前断点判断，不把其他断点的图当成当前可见", () => {
  const { definition, imageContainerId, imageSlotId } = definitionFixture();
  definition.nodes[imageContainerId].responsive.mobile = {
    ...definition.nodes[imageContainerId].responsive.mobile,
    display: "none",
  };
  const content = {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  };

  expect(hasExplicitDynamicTemplateInstanceImage(definition, content, [])).toBe(true);
  expect(hasExplicitDynamicTemplateInstanceImage(definition, content, [], "desktop")).toBe(true);
  expect(hasExplicitDynamicTemplateInstanceImage(definition, content, [], "mobile")).toBe(false);
});

test("公开模板显隐只认页面实例明确填写且可达的图片", () => {
  const { definition, imageContainerId, imageSlotId } = definitionFixture();
  definition.defaultContent[imageSlotId] = {
    src: "/images/template-default.jpg",
    alt: "模板默认图",
  };

  expect(hasExplicitDynamicTemplateInstanceImage(definition, {}, [])).toBe(false);
  expect(hasExplicitDynamicTemplateInstanceImage(definition, {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  }, [])).toBe(true);
  expect(hasExplicitDynamicTemplateInstanceImage(definition, {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  }, [imageSlotId])).toBe(false);

  definition.nodes[imageContainerId].responsive.desktop.display = "none";
  definition.nodes[imageContainerId].responsive.tablet = {
    display: "none",
  };
  definition.nodes[imageContainerId].responsive.mobile.display = "none";
  expect(hasExplicitDynamicTemplateInstanceImage(definition, {
    [imageSlotId]: { src: "/uploads/page-instance.jpg", alt: "页面上传图" },
  }, [])).toBe(false);
});

test("编辑器探测未授权 page-assets 走预览端点，不把公开地址当缺失文件", () => {
  expect(resolveEditorMediaProbeUrl("/uploads/page-assets/replaced.png")).toBe(
    "/api/upload/media/preview-by-storage-key?storageKey=page-assets%2Freplaced.png",
  );
  expect(resolveEditorMediaProbeUrl("/uploads/legacy.png")).toBe("/uploads/legacy.png");
  expect(getLocalUploadUrls({
    contentBySlotId: { slot_image: { src: "/uploads/page-assets/replaced.png", alt: "替换图" } },
  })).toEqual(["/uploads/page-assets/replaced.png"]);
});

test("编辑器素材探测只把 404/410 当成文件缺失，限流和瞬时失败不拆画布", () => {
  expect(editorMediaProbeIndicatesMissing(200)).toBe(false);
  expect(editorMediaProbeIndicatesMissing(204)).toBe(false);
  expect(editorMediaProbeIndicatesMissing(401)).toBe(false);
  expect(editorMediaProbeIndicatesMissing(429)).toBe(false);
  expect(editorMediaProbeIndicatesMissing(503)).toBe(false);
  expect(editorMediaProbeIndicatesMissing(404)).toBe(true);
  expect(editorMediaProbeIndicatesMissing(410)).toBe(true);
});

test("编辑器 page-assets 由宿主拉取对象 URL，不把预览地址直接塞进 iframe 图片", async () => {
  resetManagedTemplateMediaObjectUrlCacheForTests();
  const previewUrl = resolveManagedTemplateMediaPreviewUrl("/uploads/page-assets/hero.jpg");
  expect(isStaffManagedMediaPreviewUrl(previewUrl)).toBe(true);
  expect(previewUrl).toBe("/api/upload/media/preview-by-storage-key?storageKey=page-assets%2Fhero.jpg");

  const requests: Array<{ url?: string; responseType?: string; sessionDomain?: string; withCredentials?: boolean; header?: unknown }> = [];
  const originalAdapter = api.defaults.adapter;
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  let blobSequence = 0;
  URL.createObjectURL = () => `blob:http://127.0.0.1/managed-hero-${++blobSequence}`;
  api.defaults.adapter = async (config) => {
    requests.push({
      url: config.url,
      responseType: config.responseType,
      sessionDomain: config.sessionDomain,
      withCredentials: config.withCredentials,
      header: config.headers.get("X-Session-Domain"),
    });
    return {
      config,
      data: new Blob(["hero"], { type: "image/jpeg" }),
      headers: new AxiosHeaders(),
      status: 200,
      statusText: "OK",
    };
  };

  try {
    expect(await loadManagedTemplateMediaObjectUrl("/uploads/legacy.png")).toBe("/uploads/legacy.png");
    expect(requests).toEqual([]);
    expect(await loadManagedTemplateMediaObjectUrl("/uploads/page-assets/hero.jpg")).toBe("blob:http://127.0.0.1/managed-hero-1");
    expect(await loadManagedTemplateMediaObjectUrl(previewUrl)).toBe("blob:http://127.0.0.1/managed-hero-1");
    expect(requests).toEqual([{
      url: "/upload/media/preview-by-storage-key?storageKey=page-assets%2Fhero.jpg",
      responseType: "blob",
      sessionDomain: "admin",
      withCredentials: true,
      header: "admin",
    }]);
    advanceSessionEpoch("admin");
    expect(await loadManagedTemplateMediaObjectUrl(previewUrl)).toBe("blob:http://127.0.0.1/managed-hero-2");
    expect(requests).toHaveLength(2);
  } finally {
    api.defaults.adapter = originalAdapter;
    URL.createObjectURL = originalCreateObjectURL;
    resetManagedTemplateMediaObjectUrlCacheForTests();
  }
});

test("宿主预览取图失败不缓存，公开地址仍保持原样", async () => {
  resetManagedTemplateMediaObjectUrlCacheForTests();
  const originalAdapter = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    const response = {
      config,
      data: { message: "missing" },
      headers: new AxiosHeaders(),
      status: 404,
      statusText: "Not Found",
    };
    throw new AxiosError("missing", "ERR_BAD_RESPONSE", config, undefined, response);
  };
  try {
    await expect(loadManagedTemplateMediaObjectUrl("/uploads/page-assets/missing.jpg")).rejects.toThrow("managed-media-preview:404");
    expect(resolveManagedTemplateMediaPreviewUrl("/uploads/page-assets/missing.jpg")).toBe(
      "/api/upload/media/preview-by-storage-key?storageKey=page-assets%2Fmissing.jpg",
    );
  } finally {
    api.defaults.adapter = originalAdapter;
    resetManagedTemplateMediaObjectUrlCacheForTests();
  }
});

test("后台媒体预览首次 401 后沿现有会话刷新链路重试取图（route-Mock）", async ({ page }) => {
  let previewRequests = 0;
  let refreshRequests = 0;
  await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
    previewRequests += 1;
    expect(route.request().headers()["x-session-domain"]).toBe("admin");
    await route.fulfill(previewRequests === 1
      ? { status: 401, contentType: "application/json", body: '{"message":"Unauthorized"}' }
      : { status: 200, contentType: "image/png", body: Buffer.from("image-bytes") });
  });
  await page.route("**/api/auth/session/refresh", async (route) => {
    refreshRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"code":200,"data":{},"message":"ok"}',
    });
  });
  await page.goto("/admin/login");

  const result = await page.evaluate(async () => {
    const media = await import("/src/page-builder/template-definition/managedMediaPreview.ts");
    media.resetManagedTemplateMediaObjectUrlCacheForTests();
    const url = await media.loadManagedTemplateMediaObjectUrl("/uploads/page-assets/recover.png");
    return { protocol: new URL(url).protocol, size: (await fetch(url).then((response) => response.blob())).size };
  });
  expect(result).toEqual({ protocol: "blob:", size: "image-bytes".length });
  expect(previewRequests).toBe(2);
  expect(refreshRequests).toBe(1);
});
