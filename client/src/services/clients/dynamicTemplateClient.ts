import type { TemplateDefinitionV2 } from "@/page-builder/template-definition";
import {
  CONTENT_TEMPLATE_REGISTRY,
  getContentTemplateContract,
  sanitizeContentTemplateLayoutData,
} from "@/page-builder/generated/contentTemplates.generated";
import type { SystemContentTemplateCurrent } from "./systemContentTemplateClient";
import api, { requestStatus } from "../httpClient";
import { mockDelay, USE_MOCK } from "../mockData";
import { mockResponse } from "../mockResponse";
import { unwrapResponse } from "@/utils/unwrap";

export interface DynamicTemplateDraftResource {
  id: number;
  baseVersion: number | null;
  revision: number;
  definition: TemplateDefinitionV2;
  definitionChecksum: string;
  versionNote: string | null;
  updatedAt: string;
}

export interface DynamicTemplateResource {
  id: number;
  templateId: string;
  ownerId: number | null;
  sourceType: "SYSTEM" | "CUSTOM";
  visibility: "PRIVATE" | "STAFF";
  status: "ACTIVE" | "ARCHIVED";
  name: string;
  category: string;
  purpose: string;
  layoutType: string;
  description: string | null;
  slotSummary: string;
  recommendedFor: string[];
  tags: string[];
  definitionSchemaVersion: number;
  publishedVersion: number;
  sourceReference: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  draft: DynamicTemplateDraftResource | null;
}

export interface PublishedDynamicTemplateResource {
  templateId: string;
  sourceReference: string | null;
  name: string;
  category: string;
  purpose: string;
  layoutType: string;
  description: string | null;
  slotSummary: string;
  recommendedFor: string[];
  tags: string[];
  version: number;
  schemaVersion: number;
  definition: TemplateDefinitionV2;
  definitionChecksum: string;
  versionNote: string | null;
  publishedAt: string;
}

export interface DynamicTemplateVersionResource {
  id: number;
  dynamicTemplateId: number;
  version: number;
  schemaVersion: number;
  definition: TemplateDefinitionV2;
  definitionChecksum: string;
  versionNote: string | null;
  publishedAt: string;
}

export interface DynamicTemplatePublishResultResource {
  templateId: string;
  version: number;
  published: DynamicTemplateVersionResource;
  draft: DynamicTemplateDraftResource;
}

export interface TemplateCatalogPersonalCompatibilityResource {
  id: number;
  name: string;
  moduleType: string;
  contractKey: string;
  contractVersion: number;
  layoutData: Record<string, unknown>;
  revision: number;
  contentDefaults: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type TemplateCatalogItemResource =
  | { kind: "published"; template: PublishedDynamicTemplateResource }
  | { kind: "editable"; template: DynamicTemplateResource }
  | { kind: "system-compatibility"; template: SystemContentTemplateCurrent }
  | { kind: "personal-compatibility"; template: TemplateCatalogPersonalCompatibilityResource };

export interface TemplateCatalogResource {
  items: TemplateCatalogItemResource[];
  source?: "unified" | "legacy-endpoints";
}

const mockTemplates: DynamicTemplateResource[] = [];

function mockSystemCatalogItems(): TemplateCatalogItemResource[] {
  return CONTENT_TEMPLATE_REGISTRY.map((item) => {
    const contract = getContentTemplateContract(item.moduleType);
    const layoutData = sanitizeContentTemplateLayoutData(item.moduleType, { version: 2 });
    if (!contract || !layoutData) throw new Error(`系统母模板合同无效：${item.moduleType}`);
    return {
      kind: "system-compatibility" as const,
      template: {
        contractKey: contract.key,
        moduleType: item.moduleType,
        displayName: contract.displayName,
        contractVersion: contract.version,
        activeVersion: 0,
        layoutData,
        source: "code" as const,
        changeNote: null,
        updatedAt: null,
      },
    };
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function unavailableMockWrite(): never {
  throw new Error("Mock 模式不模拟模板数据库写入；请使用测试内确定性接口夹具");
}

async function listLegacyCatalog(): Promise<TemplateCatalogResource> {
  // 兼容尚未重启、还没有统一 catalog 路由的本地后端。数据仍来自真实服务端接口，
  // 不使用客户端注册表补造目录；后端升级后会自动回到统一目录接口。
  const [published, editable, systemCompatibility, personalCompatibility] = await Promise.all([
    api.get("/page-modules/dynamic-templates/published", { suppressGlobalError: true })
      .then((response) => unwrapResponse<PublishedDynamicTemplateResource[]>(response))
      .catch(() => []),
    api.get("/page-modules/dynamic-templates/mine", { suppressGlobalError: true })
      .then((response) => unwrapResponse<DynamicTemplateResource[]>(response))
      .catch(() => []),
    api.get("/page-modules/system-content-templates", { suppressGlobalError: true })
      .then((response) => unwrapResponse<SystemContentTemplateCurrent[]>(response)),
    api.get("/page-modules/personal-content-templates", { suppressGlobalError: true })
      .then((response) => unwrapResponse<TemplateCatalogPersonalCompatibilityResource[]>(response))
      .catch(() => []),
  ]);
  return {
    source: "legacy-endpoints",
    items: [
      ...(Array.isArray(published) ? published : []).map((template) => ({
        kind: "published" as const,
        template,
      })),
      ...(Array.isArray(editable) ? editable : []).map((template) => ({
        kind: "editable" as const,
        template,
      })),
      ...(Array.isArray(systemCompatibility) ? systemCompatibility : []).map((template) => ({
        kind: "system-compatibility" as const,
        template,
      })),
      ...(Array.isArray(personalCompatibility) ? personalCompatibility : []).map((template) => ({
        kind: "personal-compatibility" as const,
        template,
      })),
    ],
  };
}

export const dynamicTemplateApi = {
  listCatalog: async () => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse({
        items: [
          ...mockSystemCatalogItems(),
          ...mockTemplates.map((template) => ({ kind: "editable" as const, template: clone(template) })),
        ],
      } satisfies TemplateCatalogResource);
    }
    try {
      return await api.get("/page-modules/dynamic-templates/catalog", { suppressGlobalError: true });
    } catch (error) {
      if (requestStatus(error) !== 404) throw error;
      return mockResponse(await listLegacyCatalog());
    }
  },
  getPublishedVersion: async (templateId: string, version: number) => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse(null as PublishedDynamicTemplateResource | null);
    }
    return api.get(`/page-modules/dynamic-templates/published/${encodeURIComponent(templateId)}/versions/${version}`, {
      suppressGlobalError: true,
    });
  },
  getDraft: async (templateId: string) => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse(clone(mockTemplates.find((item) => item.templateId === templateId) ?? null));
    }
    return api.get(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/draft`, {
      suppressGlobalError: true,
    });
  },
  create: async (data: {
    definition: TemplateDefinitionV2;
    versionNote?: string;
    sourceReference?: string;
  }) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post("/page-modules/dynamic-templates", data, { suppressGlobalError: true });
  },
  updateDraft: async (
    templateId: string,
    data: { expectedRevision: number; definition: TemplateDefinitionV2; versionNote?: string },
  ) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.patch(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/draft`, data, {
      suppressGlobalError: true,
    });
  },
  saveAs: async (templateId: string, data: { name: string; versionNote?: string }) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/save-as`, data, {
      suppressGlobalError: true,
    });
  },
  publish: async (
    templateId: string,
    data: { expectedRevision: number; versionNote?: string },
  ) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post(
      `/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/publish`,
      data,
      { suppressGlobalError: true },
    );
  },
  listVersions: async (templateId: string) => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse([] as DynamicTemplateVersionResource[]);
    }
    return api.get(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/versions`, {
      suppressGlobalError: true,
    });
  },
  archive: async (templateId: string) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/archive`, undefined, {
      suppressGlobalError: true,
    });
  },
  restore: async (templateId: string) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/restore`, undefined, {
      suppressGlobalError: true,
    });
  },
};
