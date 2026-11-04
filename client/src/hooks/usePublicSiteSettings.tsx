import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

export type PublicSiteSettings = Record<string, unknown> & {
  siteName?: string;
  logo?: string;
  contactPhone?: string;
  contactWechat?: string;
  contactWechatQrCode?: string;
  contactEmail?: string;
  contactAddress?: string;
  businessHours?: string;
  storeName?: string;
  storeMapUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  siteDescription?: string;
};

export type PublicSiteSettingsResource = {
  settings: PublicSiteSettings | null;
  status: "loading" | "loaded" | "error";
  retry?: () => void;
};

const PublicSiteSettingsContext = createContext<PublicSiteSettingsResource | null>(null);

type SettingsRequest = {
  version: number;
  preserve: boolean;
};

const contactPreviewListeners = new Set<() => void>();

/** 店铺资料保存后刷新编辑画布里的联系信息，不清空当前预览。 */
export function refreshPublicContactPreview() {
  contactPreviewListeners.forEach((listener) => listener());
}

function useSettingsResource(
  enabled: boolean,
  source: "site" | "contact",
): PublicSiteSettingsResource {
  const [request, setRequest] = useState<SettingsRequest>({ version: 0, preserve: false });
  const [resource, setResource] = useState<PublicSiteSettingsResource>({
    settings: null,
    status: enabled ? "loading" : "loaded",
  });
  const retry = useCallback(() => {
    if (!enabled) return;
    setResource({ settings: null, status: "loading" });
    setRequest((current) => ({ version: current.version + 1, preserve: false }));
  }, [enabled]);

  useEffect(() => {
    if (source !== "contact" || !enabled) return;
    const listener = () => {
      setRequest((current) => ({ version: current.version + 1, preserve: true }));
    };
    contactPreviewListeners.add(listener);
    return () => {
      contactPreviewListeners.delete(listener);
    };
  }, [enabled, source]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const preserve = request.preserve;
    if (!preserve) {
      setResource({ settings: null, status: "loading" });
    }
    const pending = source === "contact"
      ? settingsApi.getPublicContact()
      : settingsApi.getPublicSettings();
    pending
      .then((response) => {
        if (cancelled) return;
        setResource({
          settings: unwrapResponse<PublicSiteSettings>(response),
          status: "loaded",
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (preserve) {
          setResource((current) => (
            current.settings ? current : { settings: null, status: "error" }
          ));
          return;
        }
        setResource({ settings: null, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, request, source]);

  return { ...resource, retry };
}

export function usePublicSiteSettingsResource(
  enabled = true,
): PublicSiteSettingsResource {
  return useSettingsResource(enabled, "site");
}

/** 联系页单独读取已保存的电话、微信、二维码、邮箱、地址和营业时间。 */
export function usePublicContactResource(
  enabled = true,
): PublicSiteSettingsResource {
  return useSettingsResource(enabled, "contact");
}

export function PublicSiteSettingsProvider({
  resource,
  children,
}: {
  resource: PublicSiteSettingsResource;
  children: ReactNode;
}) {
  return (
    <PublicSiteSettingsContext.Provider value={resource}>
      {children}
    </PublicSiteSettingsContext.Provider>
  );
}

/** 完整公开壳层共享同一快照；独立预览或组件测试仍可安全回源。 */
export function usePublicSiteSettings(enabled = true) {
  const inherited = useContext(PublicSiteSettingsContext);
  const standalone = usePublicSiteSettingsResource(!inherited && enabled);
  return inherited ?? standalone;
}
