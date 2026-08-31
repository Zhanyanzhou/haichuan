import { create } from "zustand";
import { validateDynamicTemplateDefinition } from "../template-definition";
import {
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  type ResolvedDynamicTemplateDefinition,
  type ResolvedDynamicTemplateDefinitionMap,
} from "./types";

interface DynamicTemplateDefinitionRegistryState {
  definitions: ResolvedDynamicTemplateDefinitionMap;
  replace: (value: unknown) => void;
  register: (value: ResolvedDynamicTemplateDefinition) => void;
}

export const useDynamicTemplateDefinitionRegistry = create<DynamicTemplateDefinitionRegistryState>((set) => ({
  definitions: {},
  replace: (value) => {
    const candidates = readResolvedDynamicTemplateDefinitions(value);
    const definitions = Object.fromEntries(Object.entries(candidates).flatMap(([key, candidate]) => {
      const validation = validateDynamicTemplateDefinition(candidate.definition);
      if (!validation.valid || !validation.definition) return [];
      return [[key, { ...candidate, definition: validation.definition }]];
    }));
    set({ definitions });
  },
  register: (value) => {
    const validation = validateDynamicTemplateDefinition(value.definition);
    const definition = validation.definition;
    if (!validation.valid || !definition) return;
    const key = dynamicTemplateVersionKey(value.templateId, value.version);
    set((state) => ({
      definitions: {
        ...state.definitions,
        [key]: { ...value, definition },
      },
    }));
  },
}));

export function registerResolvedDynamicTemplate(value: ResolvedDynamicTemplateDefinition) {
  useDynamicTemplateDefinitionRegistry.getState().register(value);
}

export function replaceResolvedDynamicTemplates(value: unknown) {
  useDynamicTemplateDefinitionRegistry.getState().replace(value);
}

export function useResolvedDynamicTemplateDefinitions() {
  return useDynamicTemplateDefinitionRegistry((state) => state.definitions);
}

export function useResolvedDynamicTemplate(templateId: string, version: number) {
  return useDynamicTemplateDefinitionRegistry((state) => (
    state.definitions[dynamicTemplateVersionKey(templateId, version)]
  ));
}
