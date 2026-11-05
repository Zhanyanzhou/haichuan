import { dynamicTemplateApi, type PublishedDynamicTemplateResource, type PublishedDynamicTemplateSummaryResource } from "@/services/clients/dynamicTemplateClient";
import { currentSessionEpoch, isCurrentSessionEpoch, StaleSessionResponseError } from "@/services/sessionEpoch";
import { unwrapResponse } from "@/utils/unwrap";

export class CatalogDefinitionIdentityError extends Error {
  constructor() { super("模板目录已变化，请刷新目录后重试"); }
}

// 旧世代正在完成请求时，新目录与升级检查共用并发预算；刷新不能叠加请求峰值。
const definitionReadQueue: Array<{ owner: symbol; key: string; start: () => void }> = [];
let runningDefinitionReads = 0;

/** 每个目录世代独立持有缓存；精确版本共用在途请求，全局最多三个定义读取。 */
export function createPublishedCatalogDefinitionLoader() {
  const epoch = currentSessionEpoch("admin");
  const pending = new Map<string, Promise<PublishedDynamicTemplateResource>>();
  const owner = Symbol();
  let active = true;
  const assertCurrent = () => {
    if (!active || !isCurrentSessionEpoch("admin", epoch)) throw new StaleSessionResponseError("admin");
  };
  const prioritize = (key: string) => {
    const index = definitionReadQueue.findIndex((job) => job.owner === owner && job.key === key);
    if (index > 0) definitionReadQueue.unshift(...definitionReadQueue.splice(index, 1));
  };
  const schedule = <T>(key: string, urgent: boolean, read: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const start = () => {
      runningDefinitionReads += 1;
      Promise.resolve().then(() => { assertCurrent(); return read(); }).then(resolve, reject).finally(() => {
        runningDefinitionReads -= 1;
        definitionReadQueue.shift()?.start();
      });
    };
    if (runningDefinitionReads < 3) start();
    else if (urgent) definitionReadQueue.unshift({ owner, key, start });
    else definitionReadQueue.push({ owner, key, start });
  });
  return {
    isActive() { return active && isCurrentSessionEpoch("admin", epoch); },
    dispose() { active = false; pending.clear(); },
    read(summary: PublishedDynamicTemplateSummaryResource, urgent = false) {
      try { assertCurrent(); } catch (error) { return Promise.reject(error); }
      const key = `${summary.templateId}@${summary.version}:${summary.definitionChecksum}`;
      const existing = pending.get(key);
      if (existing) { if (urgent) prioritize(key); return existing; }
      const request = schedule(key, urgent, async () => {
        if (summary.definition) return summary as PublishedDynamicTemplateResource;
        const response = unwrapResponse<{
          templateId: string; version: number; schemaVersion: number;
          definitionChecksum: string; definition: PublishedDynamicTemplateResource["definition"];
          status?: string;
        }>(await dynamicTemplateApi.getPublishedVersion(summary.templateId, summary.version));
        assertCurrent();
        if (!response?.definition || response.templateId !== summary.templateId
          || response.version !== summary.version || response.schemaVersion !== summary.schemaVersion
          || response.definitionChecksum !== summary.definitionChecksum || response.status === "ARCHIVED") {
          throw new CatalogDefinitionIdentityError();
        }
        return { ...summary, definition: response.definition } as PublishedDynamicTemplateResource;
      }).catch((error) => { if (pending.get(key) === request) pending.delete(key); throw error; });
      pending.set(key, request);
      return request;
    },
  };
}

export type PublishedCatalogDefinitionLoader = ReturnType<typeof createPublishedCatalogDefinitionLoader>;
