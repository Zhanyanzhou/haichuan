import type { Order, Quotation } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import api, { customerAuthHeaders } from "../httpClient";
import type { CooperationDesignFileResource } from "./quotationConfigurationClient";

export type CustomerQuotationPage = {
  list: Quotation[];
  total: number;
  page: number;
  pageSize: number;
};

export type ConfirmQuotationOrderInput = {
  quotationVersion: number;
  addressId?: number;
  address?: string;
};

export type ConfirmQuotationOrderResult = {
  order: Pick<
    Order,
    "id" | "orderNo" | "status" | "finalAmount" | "quoteChannel"
  >;
};

type CustomerCooperationDesignFileVersionResource = Omit<
  NonNullable<CooperationDesignFileResource["versions"]>[number],
  "status"
> & {
  status: "SUBMITTED" | "CONFIRMED";
};

export type CustomerCooperationDesignFileResource = Omit<
  CooperationDesignFileResource,
  "customerId" | "versions"
> & {
  versions: CustomerCooperationDesignFileVersionResource[];
};

const DESIGN_FILE_VERSION_STATUSES = new Set([
  "SUBMITTED",
  "CONFIRMED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCustomerDesignFileVersion(value: unknown) {
  return isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.version === "number" &&
    typeof value.status === "string" &&
    DESIGN_FILE_VERSION_STATUSES.has(value.status);
}

function isCustomerDesignFile(value: unknown): value is CustomerCooperationDesignFileResource {
  return isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.referenceNo === "string" &&
    typeof value.currentVersion === "number" &&
    Array.isArray(value.versions) &&
    value.versions.every(isCustomerDesignFileVersion);
}

/**
 * 客户 3D 文件接口的正式运行时边界：服务端直接返回数组，不接受分页对象。
 * 合同不匹配时显式失败，让页面进入不可确认的错误态，而不是把异常结构当成空列表。
 */
export function parseCustomerDesignFilesResponse(
  response: unknown,
): CustomerCooperationDesignFileResource[] {
  const payload = unwrapResponse<unknown>(response);
  if (!Array.isArray(payload) || !payload.every(isCustomerDesignFile)) {
    throw new TypeError("CUSTOMER_DESIGN_FILES_RESPONSE_INVALID");
  }
  return payload;
}

/**
 * 客户报价域使用客户会话，且所有写入口由服务端资格、版本与交易门禁最终裁决。
 * Idempotency-Key 由调用组件按“报价 + 版本”复用，避免重试产生重复订单。
 */
export const customerQuotationApi = {
  list: (params: { page?: number; pageSize?: number } = {}) =>
    api.get("/customers/me/quotations", {
      params,
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  detail: (id: number) =>
    api.get(`/customers/me/quotations/${id}`, {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
      dedupe: false,
    }),
  listDesignFiles: () =>
    api.get("/customers/me/cooperation-design-files", {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
  downloadDesignFile: (fileId: number, version: number) =>
    api.get(
      `/customers/me/cooperation-design-files/${fileId}/versions/${version}/content`,
      {
        headers: customerAuthHeaders(),
        responseType: "blob",
        suppressGlobalError: true,
        dedupe: false,
      },
    ),
  confirmAndOrder: (
    id: number,
    data: ConfirmQuotationOrderInput,
    idempotencyKey: string,
  ) =>
    api.post(`/customers/me/quotations/${id}/confirm-and-order`, data, {
      headers: {
        ...customerAuthHeaders(),
        "Idempotency-Key": idempotencyKey,
      },
      suppressGlobalError: true,
    }),
  confirmDesignFileVersion: (fileId: number, version: number) =>
    api.post(
      `/customers/me/cooperation-design-files/${fileId}/versions/${version}/confirm`,
      {},
      {
        headers: customerAuthHeaders(),
        suppressGlobalError: true,
      },
    ),
};
