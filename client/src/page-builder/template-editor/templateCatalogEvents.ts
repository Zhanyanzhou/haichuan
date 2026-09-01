export const DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT =
  "haichuan:dynamic-template-server-changed";

export function notifyDynamicTemplateCatalogChanged() {
  window.dispatchEvent(new Event(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT));
}
