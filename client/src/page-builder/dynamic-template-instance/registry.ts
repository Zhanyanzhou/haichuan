import { create } from "zustand";
import { validateDynamicTemplateDefinition } from "../template-definition";
import {
  dynamicTemplateVersionKey,
  type ResolvedDynamicTemplateDefinition,
  type ResolvedDynamicTemplateDefinitionMap,
} from "./types";

interface DynamicTemplateDefinitionRegistryState {
  definitions: ResolvedDynamicTemplateDefinitionMap;
  rejected: Record<string, ResolvedDynamicTemplateDefinitionRejection>;
  replace: (value: unknown) => void;
  register: (value: ResolvedDynamicTemplateDefinition) => void;
}

export interface ResolvedDynamicTemplateDefinitionRejection {
  key: string;
  reason: string;
}

export function inspectResolvedDynamicTemplateDefinitions(value: unknown): {
  definitions: ResolvedDynamicTemplateDefinitionMap;
  rejected: Record<string, ResolvedDynamicTemplateDefinitionRejection>;
} {
  const definitions: ResolvedDynamicTemplateDefinitionMap = {};
  const rejected: Record<string, ResolvedDynamicTemplateDefinitionRejection> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { definitions, rejected };
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      rejected[key] = { key, reason: "精确模板版本记录不是有效对象。" };
      continue;
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.templateId !== "string" || !Number.isInteger(record.version)) {
      rejected[key] = { key, reason: "精确模板版本记录缺少有效的模板 ID 或版本号。" };
      continue;
    }
    const expectedKey = dynamicTemplateVersionKey(record.templateId, Number(record.version));
    if (key !== expectedKey) {
      rejected[key] = { key, reason: `精确模板版本键与记录身份不一致，应为 ${expectedKey}。` };
      continue;
    }
    const validation = validateDynamicTemplateDefinition(record.definition);
    const definition = validation.definition;
    if (!validation.valid || !definition) {
      rejected[key] = {
        key,
        reason: validation.issues.find((issue) => issue.level === "error")?.message
          ?? "精确模板定义未通过当前结构校验。",
      };
      continue;
    }
    if (
      definition.templateId !== record.templateId
      || definition.schemaVersion !== record.schemaVersion
      || typeof record.definitionChecksum !== "string"
      || !record.definitionChecksum
    ) {
      rejected[key] = { key, reason: "精确模板定义与版本记录的身份、Schema 或校验摘要不一致。" };
      continue;
    }
    definitions[key] = {
      ...(candidate as ResolvedDynamicTemplateDefinition),
      definition,
    };
  }
  return { definitions, rejected };
}

export const useDynamicTemplateDefinitionRegistry = create<DynamicTemplateDefinitionRegistryState>((set) => ({
  definitions: {},
  rejected: {},
  replace: (value) => {
    set(inspectResolvedDynamicTemplateDefinitions(value));
  },
  register: (value) => {
    const key = dynamicTemplateVersionKey(value.templateId, value.version);
    const inspected = inspectResolvedDynamicTemplateDefinitions({ [key]: value });
    set((state) => ({
      definitions: {
        ...Object.fromEntries(Object.entries(state.definitions).filter(([candidateKey]) => candidateKey !== key)),
        ...inspected.definitions,
      },
      rejected: {
        ...Object.fromEntries(Object.entries(state.rejected).filter(([candidateKey]) => candidateKey !== key)),
        ...inspected.rejected,
      },
    }));
  },
}));

export function registerResolvedDynamicTemplate(value: ResolvedDynamicTemplateDefinition) {
  useDynamicTemplateDefinitionRegistry.getState().register(value);
}

/** 事件 handler 在执行当下读取，避免目录拖拽闭包沿用旧的精确版本解析结果。 */
export function getResolvedDynamicTemplateDefinitions() {
  return useDynamicTemplateDefinitionRegistry.getState().definitions;
}

export function replaceResolvedDynamicTemplates(value: unknown) {
  useDynamicTemplateDefinitionRegistry.getState().replace(value);
}

export function useResolvedDynamicTemplateDefinitions() {
  return useDynamicTemplateDefinitionRegistry((state) => state.definitions);
}

export function useRejectedDynamicTemplateDefinitions() {
  return useDynamicTemplateDefinitionRegistry((state) => state.rejected);
}

export function useResolvedDynamicTemplate(templateId: string, version: number) {
  return useDynamicTemplateDefinitionRegistry((state) => (
    state.definitions[dynamicTemplateVersionKey(templateId, version)]
  ));
}
