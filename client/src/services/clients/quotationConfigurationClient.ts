import type { QuoteChannel, WaxType } from "@/types";
import api from "../httpClient";

export type PartnerPriceAgreementResource = {
  id: number;
  customerId: number;
  version: number;
  currency: string;
  redWaxRate: number | string;
  purpleWaxRate: number | string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  reason: string;
  createdAt: string;
};

export type QuotationFeeRuleResource = {
  id: number;
  code: string;
  version: number;
  channel: QuoteChannel;
  waxType?: WaxType | null;
  calculationMethod: "FIXED" | "PER_GRAM" | "PER_ORDER";
  unitAmount: number | string;
  currency: string;
  enabled: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  displayText: string;
  reason?: string | null;
};

export type TradeResourceBucketResource = {
  id: number;
  channel: "CUSTOM" | "PARTNER_WAX";
  kind: "CAPACITY" | "MATERIAL";
  code: string;
  bucketKey: string;
  displayName: string;
  unit: string;
  availableQuantity: number | string;
  reservedQuantity: number | string;
  version: number;
  isActive: boolean;
  bucketStart?: string | null;
  bucketEnd?: string | null;
};

export type CooperationDesignFileResource = {
  id: number;
  customerId: number;
  productId?: number | null;
  referenceNo: string;
  currentVersion: number;
  versions?: Array<{
    id: number;
    version: number;
    status: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "SUPERSEDED" | "REJECTED";
    redWaxWeight?: number | string | null;
    purpleWaxWeight?: number | string | null;
    confirmedAt?: string | null;
    fileName?: string | null;
    byteSize?: number;
    checksumSha256?: string;
    downloadUrl?: string;
  }>;
};

export type CreatePartnerPriceAgreementInput = {
  customerId: number;
  redWaxRate: number;
  purpleWaxRate: number;
  effectiveFrom: string;
  effectiveUntil?: string;
  reason: string;
};

export type CreateQuotationFeeRuleInput = {
  code: string;
  channel: QuoteChannel;
  waxType?: WaxType;
  calculationMethod: "FIXED" | "PER_GRAM" | "PER_ORDER";
  unitAmount: number;
  enabled?: boolean;
  displayText: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  reason?: string;
};

export type CreateTradeResourceBucketInput = {
  channel: "CUSTOM" | "PARTNER_WAX";
  kind: "CAPACITY" | "MATERIAL";
  code: string;
  bucketKey: string;
  displayName: string;
  unit: string;
  bucketStart?: string;
  bucketEnd?: string;
  availableQuantity: number;
};

export const quotationConfigurationApi = {
  listPartnerPrices: (customerId: number) =>
    api.get(`/quotation-configuration/partner-prices/${customerId}`),
  createPartnerPrice: (data: CreatePartnerPriceAgreementInput) =>
    api.post("/quotation-configuration/partner-prices", data),
  listFeeRules: () => api.get("/quotation-configuration/fee-rules"),
  createFeeRule: (data: CreateQuotationFeeRuleInput) =>
    api.post("/quotation-configuration/fee-rules", data),
  listResourceBuckets: () =>
    api.get("/quotation-configuration/resource-buckets"),
  createResourceBucket: (data: CreateTradeResourceBucketInput) =>
    api.post("/quotation-configuration/resource-buckets", data),
  updateResourceBucket: (
    id: number,
    data: { expectedVersion: number; availableQuantity?: number; isActive?: boolean },
  ) => api.put(`/quotation-configuration/resource-buckets/${id}`, data),
  listDesignFiles: (customerId: number) =>
    api.get(`/cooperation-design-files/customer/${customerId}`),
  createDesignFile: (data: {
    customerId: number;
    productId?: number;
    referenceNo: string;
  }) => api.post("/cooperation-design-files", data),
  createDesignFileVersion: (
    fileId: number,
    data: {
      mediaAssetId: number;
      checksumSha256?: string;
      targetGoldWeight?: number;
      redWaxWeight?: number;
      purpleWaxWeight?: number;
    },
  ) => api.post(`/cooperation-design-files/${fileId}/versions`, data),
  createDesignFileVersionFromUpload: (
    fileId: number,
    file: File,
    data: {
      targetGoldWeight?: number;
      redWaxWeight?: number;
      purpleWaxWeight?: number;
    },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) formData.append(key, String(value));
    }
    return api.post(`/cooperation-design-files/${fileId}/versions/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },
};
