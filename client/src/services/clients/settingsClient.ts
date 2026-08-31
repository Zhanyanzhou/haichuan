import { USE_MOCK, mockDelay } from "../mockData";
import api from "../httpClient";
import { mockResponse } from "../mockResponse";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";

interface SettingsUpdateInput {
  siteName?: string;
  siteDescription?: string;
  logo?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  storeName?: string;
  businessHours?: string;
  storeMapUrl?: string;
  paymentMethods?: string[];
  logisticsCompanies?: string[];
}

interface SettingsLogQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  module?: string;
}

export const settingsApi = {
  getPublicSettings: async (
    locale: PublicContentLocale = getBrowserPublicContentLocale(),
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      if (locale === "en") {
        return mockResponse(null);
      }
      // 联系信息以后台 SiteSettings 为唯一真实来源；mock 默认返回空，不编造电话/邮箱/地址。
      // 测试需要具体值时在测试内拦截此接口注入。
      return mockResponse({
        siteName: "海川珠宝",
        seoTitle: "海川珠宝",
        seoDescription: "浏览珠宝作品，了解定制与顾问服务。",
        contactPhone: "",
        contactEmail: "",
        contactAddress: "",
        storeName: "",
        businessHours: "",
        storeMapUrl: "",
      });
    }
    return api.get("/settings/public", {
      params: { locale },
      suppressGlobalError: true,
    });
  },
  getSettings: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({
        siteName: "海川珠宝",
        siteDesc: "珠宝作品与顾问服务",
        logo: "",
        autoBackup: true,
        backupTime: "03:00",
      });
    }
    return api.get("/settings");
  },
  updateSettings: async (data: SettingsUpdateInput) => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockResponse(data);
    }
    return api.put("/settings", data);
  },
  getLogs: async (params?: SettingsLogQuery) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockResponse({ list: [], total: 0, page: 1, pageSize: 30 });
    }
    return api.get("/settings/logs", { params });
  },
  getBackupStatus: () => api.get("/settings/backup"),
  getFlags: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
        partnerApplicationsWriteEnabled: false,
        analyticsDashboardEnabled: true,
      });
    }
    // 前台能力 Store 已提供 fail-closed 降级；避免与页面就地状态叠加无恢复价值的全局错误浮层。
    return api.get("/settings/flags", { suppressGlobalError: true });
  },
};
