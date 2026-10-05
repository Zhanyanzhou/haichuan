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
    }
  | {
      kind: "removed";
      identity: {
        templateId: string;
      };
    };

export function notifyDynamicTemplateCatalogChanged(
  detail?: DynamicTemplateCatalogChangeDetail,
) {
  window.dispatchEvent(new CustomEvent(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, { detail }));
}

export function notifyDynamicTemplateRemovedFromCatalog(templateId: string) {
  notifyDynamicTemplateCatalogChanged({
    kind: "removed",
    identity: { templateId },
  });
}

export const PAGE_TEMPLATE_LIBRARY_HANDOFF_EVENT =
  "haichuan:page-template-library-handoff";

export type PageTemplateLibraryHandoff = {
  templateId: string;
  version: number;
  name: string;
};

export function notifyPageTemplateLibraryHandoff(detail: PageTemplateLibraryHandoff) {
  window.dispatchEvent(new CustomEvent(PAGE_TEMPLATE_LIBRARY_HANDOFF_EVENT, { detail }));
}

export const PAGE_TEMPLATE_INSERTED_EVENT = "haichuan:page-template-inserted";

export type PageTemplateInserted = {
  templateId: string;
  version: number;
};

export function notifyPageTemplateInserted(detail: PageTemplateInserted) {
  window.dispatchEvent(new CustomEvent(PAGE_TEMPLATE_INSERTED_EVENT, { detail }));
}
