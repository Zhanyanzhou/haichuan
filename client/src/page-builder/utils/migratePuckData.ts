import type { PuckDocument } from "../types";

/**
 * 保留现有调用签名，但不再转换或恢复任何已删除固定模板。
 * 旧类型会由当前合同校验和 Renderer 失败关闭。
 */
export function migratePuckData<T extends PuckDocument>(data: T): T {
  return data;
}
