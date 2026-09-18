export function publishedCatalogIdentity(templates: Array<{
  templateId: string;
  version: number;
  definitionChecksum: string;
}>) {
  return templates
    .map((item) => `${item.templateId}:${item.version}:${item.definitionChecksum}`)
    .sort()
    .join("|");
}

export function dropPublishedTemplatesById<T extends { templateId: string }>(
  templates: T[],
  templateId: string,
): T[] {
  return templates.filter((item) => item.templateId !== templateId);
}

export function dropCatalogItemsByTemplateId<T extends { template: { templateId: string } }>(
  items: T[],
  templateId: string,
): T[] {
  return items.filter((item) => item.template.templateId !== templateId);
}
