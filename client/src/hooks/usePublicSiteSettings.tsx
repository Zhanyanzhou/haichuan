import {
  createContext,
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
};

const PublicSiteSettingsContext = createContext<PublicSiteSettingsResource | null>(null);

export function usePublicSiteSettingsResource(
  enabled = true,
): PublicSiteSettingsResource {
  const [resource, setResource] = useState<PublicSiteSettingsResource>({
    settings: null,
    status: enabled ? "loading" : "loaded",
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setResource({ settings: null, status: "loading" });
    settingsApi.getPublicSettings()
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
  }, [enabled]);

  return resource;
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
