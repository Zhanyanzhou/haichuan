/**
 * 统一 API 响应解包工具
 * 
 * mockRes 层: { data: { code, data, message } }
 * axios 层:   { data: { code, data, message } }
 * 
 * 无论如何调用，统一返回内部的 data 字段
 */

export interface ApiEnvelope<T = unknown> {
  code: number;
  data: T;
  message: string;
  timestamp?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 从 API 响应中解包数据，自动处理 mockRes 和 axios 的包装差异 */
export function unwrapResponse<T = unknown>(response: unknown): T {
  if (!response) return null as T;
  
  // response.data 可能是 { code, data, message }（mockRes 或 axios 返回）
  // response.data.data 才是真正的业务数据
  if (isRecord(response) && response.data !== undefined) {
    const responseData = response.data;
    if (isRecord(responseData) && responseData.data !== undefined) {
      return responseData.data as T;
    }
    return responseData as T;
  }
  return response as T;
}

/** 从 API 响应中解包列表数据，确保返回数组 */
export function unwrapList<T = unknown>(response: unknown): T[] {
  const data = unwrapResponse<unknown>(response);
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data) && Array.isArray(data.list)) return data.list as T[];
  return [];
}
