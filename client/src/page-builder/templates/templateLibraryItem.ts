import type {
  PersonalContentTemplate,
  SystemContentTemplateCurrent,
} from "@/services/api";
import type { DynamicTemplateResource } from "@/services/clients/dynamicTemplateClient";

type TemplateLibraryItemBase = {
  key: string;
  name: string;
  moduleType: string | null;
};

export type TemplateLibraryItem =
  | (TemplateLibraryItemBase & {
      kind: "system-fixed";
      system: SystemContentTemplateCurrent;
    })
  | (TemplateLibraryItemBase & {
      kind: "personal-fixed";
      personal: PersonalContentTemplate;
    })
  | (TemplateLibraryItemBase & {
      kind: "dynamic";
      dynamic: DynamicTemplateResource;
    });

export function adaptSystemTemplateLibraryItems(
  templates: readonly SystemContentTemplateCurrent[],
): TemplateLibraryItem[] {
  return templates.map((system) => ({
    kind: "system-fixed",
    key: `system:${system.contractKey}`,
    name: system.displayName,
    moduleType: system.moduleType,
    system,
  }));
}

export function adaptPersonalTemplateLibraryItems(
  templates: readonly PersonalContentTemplate[],
): TemplateLibraryItem[] {
  return templates.map((personal) => ({
    kind: "personal-fixed",
    key: `personal:${personal.id}`,
    name: personal.name,
    moduleType: personal.moduleType,
    personal,
  }));
}

export function adaptDynamicTemplateLibraryItems(
  templates: readonly DynamicTemplateResource[],
): TemplateLibraryItem[] {
  return templates.map((dynamic) => ({
    kind: "dynamic",
    key: `dynamic:${dynamic.templateId}`,
    name: dynamic.name,
    moduleType: null,
    dynamic,
  }));
}
