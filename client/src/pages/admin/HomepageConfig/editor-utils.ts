/**
 * editor-utils.ts — 装修编辑器的纯函数与共享类型。
 * 不含组件与 Puck store 状态，仅依赖 config 层常量。
 * （自 index.tsx 平移，逻辑零变更）
 */
import type { ReactNode } from "react";
import { BLOCK_META } from "@/page-builder/config/blockMeta";
import { isMobileCanvasWidth } from "@/page-builder/config/blockContracts";
import type { PublishValidationIssue } from "@/page-builder/inspector/publishValidation";
import { collapseManagedMediaAuthorizationIssues } from "@/page-builder/inspector/managedMediaPublishIssues";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance/types";
import { catalogCardName } from "@/page-builder/template-editor/catalogCardName";
import { isPuckDocument, type PuckDocument, type PuckProps } from "@/page-builder/types";

export type ViewportPreset = {
  label: string;
  icon: ReactNode;
  width: number | "100%";
  height: number | "auto";
  displayWidth?: number;
};

export function formatViewportSize(preset: ViewportPreset) {
  return `${preset.displayWidth ?? preset.width} × ${preset.height}`;
}

export function cloneModuleProps<T extends Record<string, unknown>>(props: T): T {
  return JSON.parse(JSON.stringify(props)) as T;
}

/** 递归按键名排序，消除对象键序差异导致的误判。 */
function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    Object.keys(record)
      .sort()
      .forEach((key) => {
        sorted[key] = sortObjectKeys(record[key]);
      });
    return sorted;
  }
  return value;
}

/**
 * 页面内容语义指纹：比较根 content、zones 与 root，
 * 忽略区块会话 id、对象键序与 Puck 归一化带来的结构差异。
 * 用于判断“草稿是否与线上已发布内容存在实质差异”。
 */
export function canonicalizePuckContent(puck: unknown): string {
  if (!puck || typeof puck !== "object" || Array.isArray(puck)) return "";
  const document = puck as Record<string, unknown>;
  const normalizeBlocks = (blocks: unknown) =>
    Array.isArray(blocks)
      ? blocks.map((block) => {
          const record = block && typeof block === "object" && !Array.isArray(block)
            ? block as Record<string, unknown>
            : {};
          const props = record.props && typeof record.props === "object" && !Array.isArray(record.props)
            ? { ...record.props as Record<string, unknown> }
            : {};
          delete props.id;
          return { type: record.type, props: sortObjectKeys(props) };
        })
      : [];
  const zones =
    document.zones &&
    typeof document.zones === "object" &&
    !Array.isArray(document.zones)
      ? Object.fromEntries(
          Object.keys(document.zones)
            .sort()
            .map((zoneKey) => [
              zoneKey,
              normalizeBlocks((document.zones as Record<string, unknown>)[zoneKey]),
            ]),
        )
      : {};
  return JSON.stringify(
    sortObjectKeys({
      content: normalizeBlocks(document.content),
      zones,
      root:
        document.root && typeof document.root === "object"
          ? document.root
          : {},
    }),
  );
}

/**
 * 页面完整语义签名：content 指纹 + metadata 规范化签名。
 * 用于判定“草稿是否与线上已发布内容存在实质差异”（含 SEO 等 metadata 差异）。
 * metadata 与 Puck 文档分别规范化，避免键序差异造成误判。
 */
export function canonicalizePageContent(
  puck: unknown,
  metadata?: unknown,
): string {
  const metadataSig =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? JSON.stringify(sortObjectKeys(metadata))
      : "{}";
  return `${canonicalizePuckContent(puck)}||${metadataSig}`;
}

export type PageHistoryDiffSummary = {
  unchanged: boolean;
  contentChanged: boolean;
  rootChanged: boolean;
  blockCountBefore: number;
  blockCountAfter: number;
  changedMetadataKeys: string[];
};

/** 历史预览使用的只读摘要；保存与发布仍以服务端合同为准。 */
export function summarizePageHistoryDiff(
  before: { puckData: unknown; metadata?: unknown },
  after: { puckData: unknown; metadata?: unknown },
): PageHistoryDiffSummary {
  const readDocument = (value: unknown) => (
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  );
  const countBlocks = (value: unknown) => {
    const document = readDocument(value);
    const rootCount = Array.isArray(document.content) ? document.content.length : 0;
    const zoneCount = document.zones && typeof document.zones === "object" && !Array.isArray(document.zones)
      ? Object.values(document.zones).reduce(
          (total, blocks) => total + (Array.isArray(blocks) ? blocks.length : 0),
          0,
        )
      : 0;
    return rootCount + zoneCount;
  };
  const beforeDocument = readDocument(before.puckData);
  const afterDocument = readDocument(after.puckData);
  const beforeMetadata = readDocument(before.metadata);
  const afterMetadata = readDocument(after.metadata);
  const metadataKeys = [...new Set([
    ...Object.keys(beforeMetadata),
    ...Object.keys(afterMetadata),
  ])].sort();
  const changedMetadataKeys = metadataKeys.filter((key) => (
    JSON.stringify(sortObjectKeys(beforeMetadata[key]))
      !== JSON.stringify(sortObjectKeys(afterMetadata[key]))
  ));
  const unchanged = canonicalizePageContent(before.puckData, before.metadata)
    === canonicalizePageContent(after.puckData, after.metadata);
  return {
    unchanged,
    contentChanged: canonicalizePuckContent(before.puckData)
      !== canonicalizePuckContent(after.puckData),
    rootChanged: JSON.stringify(sortObjectKeys(beforeDocument.root ?? {}))
      !== JSON.stringify(sortObjectKeys(afterDocument.root ?? {})),
    blockCountBefore: countBlocks(before.puckData),
    blockCountAfter: countBlocks(after.puckData),
    changedMetadataKeys,
  };
}

/** Puck 首帧归一化不会因此被误判为用户编辑。 */
export function dataSignature(data: unknown): string {
  return canonicalizePuckContent(data);
}

export function normalizePuckMetadata(value: unknown): PuckProps {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PuckProps
    : {};
}

export function getPuckDocument(value: unknown): PuckDocument | null {
  return isPuckDocument(value) ? value : null;
}

export function resolvePublishValidationIssues(result: {
  errors?: string[];
  issues?: PublishValidationIssue[];
}): PublishValidationIssue[] {
  const structuredIssues = result.issues ?? [];
  const structuredErrorMessages = new Set(
    structuredIssues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
  );
  const fallbackErrors = (result.errors ?? [])
    .filter((message) => !structuredErrorMessages.has(message))
    .map((message) => ({ message, severity: "error" as const }));
  return collapseManagedMediaAuthorizationIssues([
    ...structuredIssues,
    ...fallbackErrors,
  ]);
}

function sectionRoleOnDefinition(definition: {
  metadata?: { sectionRole?: string };
  templateRecipe?: { sectionRole?: string };
} | undefined) {
  return definition?.metadata?.sectionRole || definition?.templateRecipe?.sectionRole || undefined;
}

/**
 * 页面结构、画布和属性标题与模板组件库使用同一区块角色。
 * 先读页面锁定的精确版本，没有角色时再按 templateId 用目录里的角色。
 */
export function resolveTemplateSectionRole(
  props: Record<string, unknown> | undefined,
  sources: {
    definitions?: ResolvedDynamicTemplateDefinitionMap | null;
    rolesByTemplateId?: Readonly<Record<string, string>> | null;
  } = {},
) {
  const templateId = typeof props?.templateId === "string" ? props.templateId : undefined;
  const version = props?.templateVersion;
  if (templateId && typeof version === "number" && Number.isInteger(version)) {
    const lockedRole = sectionRoleOnDefinition(
      sources.definitions?.[dynamicTemplateVersionKey(templateId, version)]?.definition,
    );
    if (lockedRole) return lockedRole;
  }
  if (templateId && sources.definitions) {
    for (const item of Object.values(sources.definitions)) {
      if (item.templateId !== templateId) continue;
      const role = sectionRoleOnDefinition(item.definition);
      if (role) return role;
    }
  }
  if (templateId && sources.rolesByTemplateId?.[templateId]) {
    return sources.rolesByTemplateId[templateId];
  }
  return undefined;
}

/** 从页面文档上的解析缓存读取区块角色。Puck 画布状态经常丢掉这个字段，界面还应同时读注册表和目录。 */
export function sectionRoleFromResolvedDocument(
  document: object | null | undefined,
  props?: Record<string, unknown>,
) {
  return resolveTemplateSectionRole(props, {
    definitions: readResolvedDynamicTemplateDefinitions(
      (document as { resolvedDynamicTemplates?: unknown } | null | undefined)?.resolvedDynamicTemplates,
    ),
  });
}

export function getModuleDisplayName(
  type: string,
  props?: Record<string, unknown>,
  sectionRole?: string,
) {
  // 动态模板在目录、页面结构和属性标题使用同一区块角色名。
  // moduleName 仍是模板保存名，只在没有角色时回退显示。
  if (type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
    const templateName = typeof props?.moduleName === "string"
      ? props.moduleName.trim()
      : "";
    if (templateName || sectionRole) return catalogCardName(sectionRole, templateName);
  }
  return BLOCK_META[type]?.name ?? type;
}

export function formatEditorTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  // 跨年时补年份，避免版本历史/草稿时间跨年混淆。
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(
    "zh-CN",
    sameYear
      ? {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }
      : {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
  );
}

export type InspectorDevice = "desktop" | "mobile";

export function getInspectorDevice(viewport: {
  width: number | "100%";
}): InspectorDevice {
  return isMobileCanvasWidth(viewport.width) ? "mobile" : "desktop";
}
