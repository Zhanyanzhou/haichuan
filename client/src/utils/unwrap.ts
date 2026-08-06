/**
 * 统一 API 响应解包工具
 * 
 * mockRes 层: { data: { code, data, message } }
 * axios 层:   { data: { code, data, message } }
 * 
 * 无论如何调用，统一返回内部的 data 字段
 */

export interface ApiEnvelope<T = any> {
  code: number;
  data: T;
  message: string;
  timestamp?: string;
}

/** 从 API 响应中解包数据，自动处理 mockRes 和 axios 的包装差异 */
export function unwrapResponse<T = any>(response: any): T {
  if (!response) return null as any;
  
  // response.data 可能是 { code, data, message }（mockRes 或 axios 返回）
  // response.data.data 才是真正的业务数据
  if (response.data?.data !== undefined) {
    return response.data.data as T;
  }
  if (response.data !== undefined) {
    return response.data as T;
  }
  return response as T;
}

/** 从 API 响应中解包列表数据，确保返回数组 */
export function unwrapList<T = any>(response: any): T[] {
  const data = unwrapResponse<any>(response);
  if (Array.isArray(data)) return data as T[];
  if (data?.list && Array.isArray(data.list)) return data.list as T[];
  return [];
}
