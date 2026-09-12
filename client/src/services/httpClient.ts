import axios, {
  getAdapter,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { notifyRequestError } from "@/services/requestErrorEvents";
import { useAuthStore } from "@/store/authStore";
import {
  useCustomerAuthStore,
  type CustomerAccount,
} from "@/store/customerAuthStore";
import type { ApiResponse, User } from "@/types";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";
import { buildAdminLoginPath } from "@/utils/adminReturnPath";

declare module "axios" {
  interface AxiosRequestConfig {
    /** 调用方已经提供就地 loading/error/retry 状态时，不再叠加全局错误浮层。 */
    suppressGlobalError?: boolean;
    /** 同一浏览器可同时持有后台与客户 Cookie，受控资源必须显式选择身份域。 */
    sessionDomain?: "admin" | "customer";
    /** 显式刷新必须读取新状态时，可关闭进行中的相同 GET 合并。 */
    dedupe?: boolean;
    _sessionRetry?: boolean;
  }

  interface InternalAxiosRequestConfig {
    suppressGlobalError?: boolean;
    sessionDomain?: "admin" | "customer";
    dedupe?: boolean;
    _sessionRetry?: boolean;
  }
}

export type NormalizedRequestError = Error & {
  status?: number;
  errorCode?: string;
};

// Vite 浏览器构建会注入 env；Playwright 的 Node 侧静态合同可能直接加载本模块，
// 该环境没有注入对象，因此必须保持类型边界并安全降级到同源 /api。
const clientEnv = (
  import.meta as ImportMeta & { readonly env?: ImportMetaEnv }
).env;

const api = axios.create({
  baseURL: clientEnv?.VITE_API_BASE_URL || "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
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
  if ((config.method || "get").toLowerCase() !== "get" || config.dedupe === false) {
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
  useCustomerAuthStore.getState().markAnonymous();
}

export function customerAuthHeaders() {
  return { "X-Session-Domain": "customer" };
}

export function requestStatus(error: unknown): number | undefined {
  return (error as NormalizedRequestError | undefined)?.status;
}

export function requestErrorCode(error: unknown): string | undefined {
  return (error as NormalizedRequestError | undefined)?.errorCode;
}

const apiBaseUrl = (clientEnv?.VITE_API_BASE_URL || "/api").replace(
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
  const method = (config.method || "get").toLowerCase();
  // axios 实例默认使用 application/json；FormData 必须移除该默认值，
  // 由浏览器写入包含随机 boundary 的 multipart Content-Type。
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  if (
    !["get", "head", "options"].includes(method) &&
    !config.headers["X-CSRF-Token"]
  ) {
    const csrf = readCookie("hc_csrf");
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

const sessionClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let adminRefresh: Promise<void> | null = null;
let customerRefresh: Promise<void> | null = null;

function responsePayload<T>(body: unknown): T {
  const envelope = body as { data?: T } | undefined;
  return (envelope && "data" in envelope ? envelope.data : body) as T;
}

function requestHeader(
  config: InternalAxiosRequestConfig | undefined,
  name: string,
): string {
  const headers = config?.headers;
  if (!headers) return "";
  return String(
    headers.get(name) ?? headers[name] ?? headers[name.toLowerCase()] ?? "",
  );
}

function requestDomain(
  config: InternalAxiosRequestConfig | undefined,
): "admin" | "customer" {
  if (config?.sessionDomain === "customer") return "customer";
  return requestHeader(config, "X-Session-Domain") === "customer"
    ? "customer"
    : "admin";
}

function isSessionBootstrapRequest(url: string): boolean {
  return [
    "/auth/login",
    "/auth/session/refresh",
    "/auth/session/logout",
    "/customers/login",
    "/customers/register",
    "/customers/session/refresh",
    "/customers/session/logout",
    "/customers/wechat/bind",
  ].some((path) => url.endsWith(path));
}

async function refreshSession(domain: "admin" | "customer"): Promise<void> {
  const running = domain === "customer" ? customerRefresh : adminRefresh;
  if (running) return running;
  const path = domain === "customer"
    ? "/customers/session/refresh"
    : "/auth/session/refresh";
  const pending = sessionClient
    .post(path, undefined, {
      headers: {
        "X-Session-Mode": "cookie",
        ...(domain === "customer" ? customerAuthHeaders() : {}),
        ...(readCookie("hc_csrf") ? { "X-CSRF-Token": readCookie("hc_csrf")! } : {}),
      },
    })
    .then((response) => {
      if (domain === "customer") {
        const payload = responsePayload<{ customer: CustomerAccount }>(
          response.data,
        );
        if (payload?.customer) useCustomerAuthStore.getState().setAuth(payload.customer);
      } else {
        const payload = responsePayload<{ user: User }>(response.data);
        if (payload?.user) useAuthStore.getState().setAuth(payload.user);
      }
    });
  if (domain === "customer") customerRefresh = pending;
  else adminRefresh = pending;
  try {
    await pending;
  } finally {
    if (domain === "customer") customerRefresh = null;
    else adminRefresh = null;
  }
}

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
  async (caught: unknown) => {
    if (!axios.isAxiosError(caught)) return Promise.reject(caught);
    const error = caught as AxiosError<{ message?: string; errorCode?: string }>;
    const suppressGlobalError = Boolean(error.config?.suppressGlobalError);
    const requestUrl = String(error.config?.url || "");
    if (
      error.response?.status === 401 &&
      error.config &&
      !error.config._sessionRetry &&
      !isSessionBootstrapRequest(requestUrl)
    ) {
      const domain = requestDomain(error.config);
      try {
        await refreshSession(domain);
        error.config._sessionRetry = true;
        return api.request(error.config);
      } catch {
        if (domain === "customer") clearCustomerSession();
        else useAuthStore.getState().logout();

        if (
          domain === "admin" &&
          typeof window !== "undefined" &&
          window.location.pathname.startsWith("/admin") &&
          !window.location.pathname.includes("/admin/login")
        ) {
          const returnTo =
            window.location.pathname + window.location.search + window.location.hash;
          window.location.replace(buildAdminLoginPath(returnTo));
        } else if (
          domain === "customer" &&
          typeof window !== "undefined" &&
          /^\/(cart|checkout|partner)(\/|$)/.test(window.location.pathname)
        ) {
          const returnTo = window.location.pathname + window.location.search;
          window.location.href = `/customer?returnTo=${encodeURIComponent(returnTo)}`;
        }
      }
    } else if (error.response?.status === 401) {
      const domain = requestDomain(error.config);
      if (domain === "customer") clearCustomerSession();
      else useAuthStore.getState().logout();
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
    normalized.errorCode = error.response?.data?.errorCode;
    return Promise.reject(normalized);
  },
);

export function getRequestErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  return message || fallback;
}

export default api;
