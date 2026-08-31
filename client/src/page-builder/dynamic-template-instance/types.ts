import type {
  TemplateDefinitionV2,
  TemplateInstanceLayoutOverridesByNodeId,
  TemplateInstanceV2,
} from "../template-definition";
export type {
  TemplateInstanceLayoutOverride,
  TemplateInstanceLayoutOverridesByNodeId,
  TemplateInstanceV2,
} from "../template-definition";

// 已写入 PageDocument 的兼容类型键，不能随产品文案改名；界面统一显示“模板实例”。
/** 已发布 Puck 文档的持久化类型标识；不是面向用户的模板分类名称。 */
export const DYNAMIC_TEMPLATE_BLOCK_TYPE = "动态模板实例";
export const DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION = 1;
export const TEMPLATE_INSTANCE_MODEL_VERSION = 2 as const;
export const DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY = "resolvedDynamicTemplates";

/** Puck 运行时外壳；id/moduleName 与 legacy overrides 不属于 V2 业务事实。 */
export interface DynamicTemplateInstanceProps extends Record<string, unknown>, Omit<TemplateInstanceV2, "layoutOverridesByNodeId"> {
  id: string;
  instanceSchemaVersion: typeof DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION;
  moduleName: string;
  layoutOverridesByNodeId?: TemplateInstanceLayoutOverridesByNodeId;
  /** v1 页面兼容字段；新实例不再写入。 */
  overrides?: Record<string, unknown>;
}

export interface ResolvedDynamicTemplateDefinition {
  templateId: string;
  version: number;
  schemaVersion: number;
  definitionChecksum: string;
  definition: TemplateDefinitionV2;
}

export type ResolvedDynamicTemplateDefinitionMap = Record<
  string,
  ResolvedDynamicTemplateDefinition
>;

function createStableInstanceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `instance_${crypto.randomUUID()}`;
  }
  return `instance_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function dynamicTemplateVersionKey(templateId: string, version: number) {
  return `${templateId}@${version}`;
}

export function createDynamicTemplateInstanceProps(input: {
  templateId: string;
  version: number;
  name: string;
}): DynamicTemplateInstanceProps {
  const instanceId = createStableInstanceId();
  return {
    id: instanceId,
    instanceSchemaVersion: DYNAMIC_TEMPLATE_INSTANCE_SCHEMA_VERSION,
    instanceId,
    templateId: input.templateId,
    templateVersion: input.version,
    moduleName: input.name,
    contentBySlotId: {},
    layoutOverridesByNodeId: {},
    hiddenSlotIds: [],
    isVisible: true,
  };
}

export function readResolvedDynamicTemplateDefinitions(
  value: unknown,
): ResolvedDynamicTemplateDefinitionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, candidate]) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.templateId !== "string"
      || !Number.isInteger(record.version)
      || typeof record.version !== "number"
      || !record.definition
    ) return [];
    const expectedKey = dynamicTemplateVersionKey(record.templateId, record.version);
    if (key !== expectedKey) return [];
    return [[key, candidate as ResolvedDynamicTemplateDefinition]];
  }));
}
