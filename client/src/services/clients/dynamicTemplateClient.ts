import type { TemplateDefinitionV2 } from "@/page-builder/template-definition";
import type { ApiResponse } from "@/types";
import api from "../httpClient";
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

/** 只复制此精确草稿快照；服务端不接受将该身份用于导入修改后的历史内容。 */
export interface DynamicTemplateCopySource {
  templateId: string;
  revision: number;
  definitionChecksum: string;
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
  canDelete?: boolean;
  deleteBlockers?: Array<{
    code: string;
    message: string;
  }>;
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

export interface PublishedDynamicTemplateVersionResource extends DynamicTemplateVersionResource {
  templateId: string;
}

export type DynamicTemplateVersionSummaryResource = Omit<
  DynamicTemplateVersionResource,
  "definition"
>;

export interface DynamicTemplateVersionPageResource {
  items: DynamicTemplateVersionSummaryResource[];
  nextBeforeVersion: number | null;
}

export interface DynamicTemplatePublishResultResource {
  templateId: string;
  version: number;
  published: DynamicTemplateVersionResource;
  draft: DynamicTemplateDraftResource | null;
  outcome: "published" | "already-published";
}

export interface DynamicTemplateArchiveDraftIdentity {
  expectedRevision: number;
  expectedChecksum: string;
}

export type DynamicTemplateArchiveRequest = DynamicTemplateArchiveDraftIdentity;

export type TemplateCatalogItemResource =
  | { kind: "published"; template: PublishedDynamicTemplateResource }
  | { kind: "editable"; template: DynamicTemplateResource };

export interface TemplateCatalogResource {
  items: TemplateCatalogItemResource[];
  source?: "unified";
}

const mockTemplates: DynamicTemplateResource[] = [];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function unavailableMockWrite(): never {
  throw new Error("Mock 模式不模拟模板数据库写入；请使用测试内确定性接口夹具");
}

export const dynamicTemplateApi = {
  listCatalog: async (options: { dedupe?: boolean } = {}) => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse({
        items: mockTemplates.map((template) => ({ kind: "editable" as const, template: clone(template) })),
      } satisfies TemplateCatalogResource);
    }
    return api.get("/page-modules/dynamic-templates/catalog", {
      suppressGlobalError: true,
      dedupe: options.dedupe,
    });
  },
  getPublishedVersion: async (templateId: string, version: number) => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse(null as PublishedDynamicTemplateVersionResource | null);
    }
    return api.get<ApiResponse<PublishedDynamicTemplateVersionResource>>(
      `/page-modules/dynamic-templates/published/${encodeURIComponent(templateId)}/versions/${version}`,
      { suppressGlobalError: true },
    );
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
  createDraftFromPublished: async (templateId: string, data: {
    expectedVersion: number;
    expectedChecksum: string;
  }) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post<ApiResponse<DynamicTemplateResource>>(
      `/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/draft/from-published`,
      data,
      { suppressGlobalError: true },
    );
  },
  create: async (data: {
    copySource?: DynamicTemplateCopySource;
    definition: TemplateDefinitionV2;
    versionNote?: string;
  }) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post("/page-modules/dynamic-templates", data, { suppressGlobalError: true });
  },
  updateDraft: async (
    templateId: string,
    data: {
      expectedRevision: number;
      definition: TemplateDefinitionV2;
      versionNote?: string;
      restoreFromVersion?: number;
      restoreFromChecksum?: string;
    },
  ) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.patch(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/draft`, data, {
      suppressGlobalError: true,
    });
  },
  publish: async (
    templateId: string,
    data: {
      expectedRevision: number;
      expectedChecksum: string;
      targetVersion: number;
      versionNote?: string;
    },
  ) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post<ApiResponse<DynamicTemplatePublishResultResource>>(
      `/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/publish`,
      data,
      { suppressGlobalError: true },
    );
  },
  listVersions: async (
    templateId: string,
    options: { beforeVersion?: number; limit?: number } = {},
  ) => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockResponse({ items: [], nextBeforeVersion: null } satisfies DynamicTemplateVersionPageResource);
    }
    return api.get(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/versions`, {
      suppressGlobalError: true,
      params: options,
    });
  },
  archive: async (templateId: string, data: DynamicTemplateArchiveRequest) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/archive`, data, {
      suppressGlobalError: true,
    });
  },
  restore: async (templateId: string) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.post(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/restore`, undefined, {
      suppressGlobalError: true,
    });
  },
  deleteDraft: async (templateId: string) => {
    if (USE_MOCK) unavailableMockWrite();
    return api.delete(`/page-modules/dynamic-templates/${encodeURIComponent(templateId)}`, {
      suppressGlobalError: true,
    });
  },
};
