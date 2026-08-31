import type {
  PersonalContentTemplate,
  SystemContentTemplateCurrent,
} from "@/services/api";
import { sanitizeContentTemplateLayoutData } from "../generated/contentTemplates.generated";

export type TemplateOrigin =
  | {
      kind: "system";
      contractKey: string;
      version: number;
    }
  | {
      kind: "personal";
      templateId: number;
      revision: number;
    };

type TemplateBlock = {
  type?: unknown;
  props?: unknown;
  [key: string]: unknown;
};

export function readTemplateOrigin(value: unknown): TemplateOrigin | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const origin = value as Record<string, unknown>;
  if (
    origin.kind === "system"
    && typeof origin.contractKey === "string"
    && Number.isInteger(origin.version)
    && Number(origin.version) >= 0
  ) {
    return { kind: "system", contractKey: origin.contractKey, version: Number(origin.version) };
  }
  if (
    origin.kind === "personal"
    && Number.isInteger(origin.templateId)
    && Number(origin.templateId) > 0
    && Number.isInteger(origin.revision)
    && Number(origin.revision) > 0
  ) {
    return {
      kind: "personal",
      templateId: Number(origin.templateId),
      revision: Number(origin.revision),
    };
  }
  return null;
}

function mapDocumentBlocks<T extends Record<string, unknown>>(
  document: T,
  mapBlock: (block: TemplateBlock) => TemplateBlock,
): T {
  const mapList = (value: unknown) => Array.isArray(value)
    ? value.map((block) => (
        block && typeof block === "object" && !Array.isArray(block)
          ? mapBlock(block as TemplateBlock)
          : block
      ))
    : value;
  const zones = document.zones && typeof document.zones === "object" && !Array.isArray(document.zones)
    ? Object.fromEntries(
        Object.entries(document.zones as Record<string, unknown>)
          .map(([key, blocks]) => [key, mapList(blocks)]),
      )
    : document.zones;
  return {
    ...document,
    ...(Array.isArray(document.content) ? { content: mapList(document.content) } : {}),
    ...(zones !== undefined ? { zones } : {}),
  } as T;
}

export function upgradePersonalTemplateInstances<T extends Record<string, unknown>>(
  document: T,
  templates: readonly PersonalContentTemplate[],
): { document: T; upgradedCount: number } {
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  let upgradedCount = 0;
  const nextDocument = mapDocumentBlocks(document, (block) => {
    if (typeof block.type !== "string" || !block.props || typeof block.props !== "object" || Array.isArray(block.props)) {
      return block;
    }
    const props = block.props as Record<string, unknown>;
    const origin = readTemplateOrigin(props.__templateOrigin);
    if (!origin || origin.kind !== "personal") return block;
    const template = templatesById.get(origin.templateId);
    if (!template || template.moduleType !== block.type || template.revision <= origin.revision) return block;
    const layoutData = sanitizeContentTemplateLayoutData(template.moduleType, template.layoutData);
    if (!layoutData) return block;
    upgradedCount += 1;
    return {
      ...block,
      props: {
        ...props,
        __instanceOverrides: layoutData,
        __templateOrigin: {
          kind: "personal",
          templateId: template.id,
          revision: template.revision,
        } satisfies TemplateOrigin,
      },
    };
  });
  return { document: nextDocument, upgradedCount };
}

export function countUpgradeableSystemTemplateInstances(
  document: Record<string, unknown>,
  current: SystemContentTemplateCurrent,
): number {
  let count = 0;
  mapDocumentBlocks(document, (block) => {
    if (typeof block.type !== "string" || !block.props || typeof block.props !== "object" || Array.isArray(block.props)) return block;
    const origin = readTemplateOrigin((block.props as Record<string, unknown>).__templateOrigin);
    if (
      origin?.kind === "system"
      && origin.contractKey === current.contractKey
      && origin.version < current.activeVersion
    ) count += 1;
    return block;
  });
  return count;
}

export function upgradeSystemTemplateInstances<T extends Record<string, unknown>>(
  document: T,
  current: SystemContentTemplateCurrent,
): { document: T; upgradedCount: number } {
  const layoutData = sanitizeContentTemplateLayoutData(current.moduleType, current.layoutData);
  if (!layoutData) return { document, upgradedCount: 0 };
  let upgradedCount = 0;
  const nextDocument = mapDocumentBlocks(document, (block) => {
    if (block.type !== current.moduleType || !block.props || typeof block.props !== "object" || Array.isArray(block.props)) return block;
    const props = block.props as Record<string, unknown>;
    const origin = readTemplateOrigin(props.__templateOrigin);
    if (
      origin?.kind !== "system"
      || origin.contractKey !== current.contractKey
      || origin.version >= current.activeVersion
    ) return block;
    upgradedCount += 1;
    return {
      ...block,
      props: {
        ...props,
        __instanceOverrides: layoutData,
        __templateOrigin: {
          kind: "system",
          contractKey: current.contractKey,
          version: current.activeVersion,
        } satisfies TemplateOrigin,
      },
    };
  });
  return { document: nextDocument, upgradedCount };
}
