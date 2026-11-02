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

function useSettingsResource(
  enabled: boolean,
  source: "site" | "contact",
): PublicSiteSettingsResource {
  const [requestVersion, setRequestVersion] = useState(0);
  const [resource, setResource] = useState<PublicSiteSettingsResource>({
    settings: null,
    status: enabled ? "loading" : "loaded",
  });
  const retry = useCallback(() => {
    if (!enabled) return;
    setResource({ settings: null, status: "loading" });
    setRequestVersion((current) => current + 1);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setResource({ settings: null, status: "loading" });
    const request = source === "contact"
      ? settingsApi.getPublicContact()
      : settingsApi.getPublicSettings();
    request
      .then((response) => {
        if (!cancelled) {
          setResource({
            settings: unwrapResponse<PublicSiteSettings>(response),
            status: "loaded",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setResource({ settings: null, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, requestVersion, source]);

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
