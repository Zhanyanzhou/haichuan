import { expect, test } from "@playwright/test";
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

  const fetchCalls: Array<{ url: string; credentials?: RequestCredentials; sessionDomain?: string | null }> = [];
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = () => "blob:http://127.0.0.1/managed-hero";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push({
      url,
      credentials: init?.credentials,
      sessionDomain: new Headers(init?.headers).get("X-Session-Domain"),
    });
    return new Response(new Blob(["hero"], { type: "image/jpeg" }), { status: 200 });
  }) as typeof fetch;

  try {
    expect(await loadManagedTemplateMediaObjectUrl("/uploads/legacy.png")).toBe("/uploads/legacy.png");
    expect(fetchCalls).toEqual([]);
    expect(await loadManagedTemplateMediaObjectUrl("/uploads/page-assets/hero.jpg")).toBe("blob:http://127.0.0.1/managed-hero");
    expect(await loadManagedTemplateMediaObjectUrl(previewUrl)).toBe("blob:http://127.0.0.1/managed-hero");
    expect(fetchCalls).toEqual([{
      url: previewUrl,
      credentials: "same-origin",
      sessionDomain: "admin",
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    resetManagedTemplateMediaObjectUrlCacheForTests();
  }
});

test("宿主预览取图失败不缓存，公开地址仍保持原样", async () => {
  resetManagedTemplateMediaObjectUrlCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("missing", { status: 404 })) as typeof fetch;
  try {
    await expect(loadManagedTemplateMediaObjectUrl("/uploads/page-assets/missing.jpg")).rejects.toThrow("managed-media-preview:404");
    expect(resolveManagedTemplateMediaPreviewUrl("/uploads/page-assets/missing.jpg")).toBe(
      "/api/upload/media/preview-by-storage-key?storageKey=page-assets%2Fmissing.jpg",
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetManagedTemplateMediaObjectUrlCacheForTests();
  }
});
