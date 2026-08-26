import axios, { getAdapter } from "axios";
import { notifyRequestError } from "@/services/requestErrorEvents";
import { useAuthStore } from "@/store/authStore";
import type { ApiResponse } from "@/types";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";

declare module "axios" {
  interface AxiosRequestConfig {
    /** 调用方已经提供就地 loading/error/retry 状态时，不再叠加全局错误浮层。 */
    suppressGlobalError?: boolean;
  }

  interface InternalAxiosRequestConfig {
    suppressGlobalError?: boolean;
  }
}

export type NormalizedRequestError = Error & { status?: number };

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }
  return undefined;
}

// 并发中的相同幂等 GET 共享同一请求，完成后立即忘记；不做 TTL 缓存。
const inflightGets = new Map<string, Promise<unknown>>();
const baseAdapter = getAdapter(api.defaults.adapter);
api.defaults.adapter = async (config) => {
  if ((config.method || "get").toLowerCase() !== "get") {
    return baseAdapter(config);
  }
  const key = `${config.url}|${JSON.stringify(config.params ?? {})}`;
  const hit = inflightGets.get(key);
  if (hit) return hit as never;
  const pending = Promise.resolve(baseAdapter(config)).finally(() =>
    inflightGets.delete(key),
  );
  inflightGets.set(key, pending);
  return pending as never;
};

export function clearCustomerSession() {
  localStorage.removeItem("customerToken");
  localStorage.removeItem("customer");
}

export function customerAuthHeaders() {
  const token = localStorage.getItem("customerToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function requestStatus(error: unknown): number | undefined {
  return (error as NormalizedRequestError | undefined)?.status;
}

const apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

function localizedPublicStreamUrl(path: string, locale: PublicContentLocale) {
  return `${apiBaseUrl}${path}?locale=${encodeURIComponent(locale)}`;
}

export function publicProductStreamUrl(
  locale: PublicContentLocale = getBrowserPublicContentLocale(),
) {
  return localizedPublicStreamUrl("/products/catalog/stream", locale);
}

export function publicPageDocumentStreamUrl(
  locale: PublicContentLocale = getBrowserPublicContentLocale(),
) {
  return localizedPublicStreamUrl("/page-modules/document/stream", locale);
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const method = (config.method || "get").toLowerCase();
  if (
    !["get", "head", "options"].includes(method) &&
    !config.headers["X-CSRF-Token"]
  ) {
    const csrf = readCookie("hc_admin_csrf") || readCookie("hc_customer_csrf");
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse<unknown>;
    if (data && typeof data.code === "number" && data.code !== 200) {
      if (!response.config.suppressGlobalError) {
        notifyRequestError(data.message || "请求失败");
      }
      return Promise.reject(new Error(data.message || "Request failed"));
    }
    return response;
  },
  (error) => {
    const suppressGlobalError = Boolean(error.config?.suppressGlobalError);
    if (error.response?.status === 401) {
      const customerToken = localStorage.getItem("customerToken");
      const requestAuthorization = String(
        error.config?.headers?.Authorization || "",
      );
      const isCustomerRequest = Boolean(
        customerToken && requestAuthorization === `Bearer ${customerToken}`,
      );
      if (isCustomerRequest) clearCustomerSession();
      else useAuthStore.getState().logout();

      if (
        !isCustomerRequest &&
        window.location.pathname.startsWith("/admin") &&
        !window.location.pathname.includes("/admin/login")
      ) {
        window.location.href = "/admin/login";
      } else if (
        isCustomerRequest &&
        /^\/(cart|checkout|partner)(\/|$)/.test(window.location.pathname)
      ) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/customer?returnTo=${encodeURIComponent(returnTo)}`;
      }
    } else if (!suppressGlobalError && error.response?.status === 403) {
      notifyRequestError("没有权限执行此操作");
    } else if (!suppressGlobalError && error.response?.status === 429) {
      notifyRequestError("操作过于频繁，请稍后再试");
    } else if (
      !suppressGlobalError &&
      error.response?.status &&
      error.response.status >= 500
    ) {
      notifyRequestError("服务器繁忙，请稍后再试");
    }
    const message =
      error.response?.data?.message || error.message || "网络错误";
    const normalized = new Error(message) as NormalizedRequestError;
    normalized.status = error.response?.status;
    return Promise.reject(normalized);
  },
);

export default api;
