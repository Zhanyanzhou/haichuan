export const TEMPLATE_VERSION_HISTORY_POLICY_PATTERN = /\bdata-template-version-history-policy\s*=\s*["']read-only-version-pinned["']/;

export const LEGACY_TEMPLATE_CLIENT_PATTERN = /system-content-templates|personal-content-templates|SystemContentTemplateCurrent|PersonalContentTemplate|systemContentTemplateApi|personalContentTemplateApi/;

export const LEGACY_TEMPLATE_SERVER_SERVICE_PATTERN = /(?:getSystemContentTemplates|getSystemContentTemplateHistory|getSystemContentTemplate|getPersonalContentTemplates|overwriteSystemContentTemplate|rollbackSystemContentTemplate|createPersonalContentTemplate|updatePersonalContentTemplate|deletePersonalContentTemplate)\s*\(|this\s*\.\s*prisma\s*\.\s*personalContentTemplate\s*\./;

export const LEGACY_TEMPLATE_SERVER_ROUTE_PATTERN = /@(?:Get|Post|Patch|Put|Delete)\s*\(\s*["'](?:system-content-templates|personal-content-templates)(?:\/[^"']*)?["']/;

export const DYNAMIC_TEMPLATE_CATALOG_PATTERN = /@Get\s*\(\s*["']catalog["']\s*\)[\s\S]*?this\s*\.\s*service\s*\.\s*listPublished\s*\(\s*\)[\s\S]*?this\s*\.\s*service\s*\.\s*listMine\s*\(\s*req\s*\.\s*user\s*\.\s*id\s*\)/;

export const DYNAMIC_TEMPLATE_PUBLISH_ROUTE_PATTERN = /@Post\s*\(\s*["']:templateId\/publish["']\s*\)[\s\S]*?return\s+this\s*\.\s*service\s*\.\s*publish\s*\(/;

export const DYNAMIC_TEMPLATE_PUBLISH_CALL_PATTERN = /dynamicTemplateApi\s*\.\s*publish\s*\(/;

export const DYNAMIC_TEMPLATE_ACTIVATION_CALL_PATTERN = /dynamicTemplateApi\s*\.\s*(?:getActivationImpact|activate)\s*\(/;

export function isRuntimeTypeScriptSource(fileName) {
  return /\.(?:ts|tsx)$/.test(fileName)
    && !/\.d\.ts$|\.(?:spec|test)\.(?:ts|tsx)$/.test(fileName);
}

export function findMatchingSourcePaths(files, pattern) {
  if (pattern.global || pattern.sticky) {
    throw new TypeError("Gate D source patterns must not use stateful flags");
  }
  return files
    .filter((file) => pattern.test(file.source))
    .map((file) => file.path);
}
