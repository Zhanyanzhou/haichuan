import type {
  DynamicTemplateResource,
  TemplateCatalogResource,
} from "@/services/clients/dynamicTemplateClient";

export const DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT =
  "haichuan:dynamic-template-server-changed";

export type DynamicTemplateCatalogChangeDetail =
  | {
      kind: "editable-upsert";
      identity: {
        templateId: string;
        revision: number;
        definitionChecksum: string;
      };
      template: DynamicTemplateResource;
    }
  | {
      kind: "verified-catalog";
      identity: {
        templateId: string;
        version: number;
        definitionChecksum: string;
      };
      catalog: TemplateCatalogResource;
    };

export function notifyDynamicTemplateCatalogChanged(
  detail?: DynamicTemplateCatalogChangeDetail,
) {
  window.dispatchEvent(new CustomEvent(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, { detail }));
}
