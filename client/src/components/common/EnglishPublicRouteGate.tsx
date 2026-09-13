import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { PublicPageFallback } from "@/page-builder/runtime/PublishedPageDecoration";
import {
  usePublishedPageDocument,
  type PublishedPageDocumentResource,
} from "@/page-builder/runtime/usePublishedPageDocument";

const ENGLISH_PAGE_KEY_BY_PATH = {
  "/": "home",
  "/products": "products",
  "/about": "about",
  "/custom": "custom",
} as const;

type EnglishPageKey = (typeof ENGLISH_PAGE_KEY_BY_PATH)[keyof typeof ENGLISH_PAGE_KEY_BY_PATH];

const ENGLISH_PAGE_LABELS: Record<EnglishPageKey, string> = {
  home: "English home",
  products: "Products",
  about: "About",
  custom: "Custom",
};

export type EnglishPublicRouteOutletContext = {
  englishPublication: {
    pageKey: EnglishPageKey;
    documentResource: PublishedPageDocumentResource;
  };
};

const ROBOTS_PREVIOUS_CONTENT_ATTRIBUTE = "data-english-gate-previous-content";
const ROBOTS_CREATED_ATTRIBUTE = "data-english-gate-created";

function setRobotsNoIndex() {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  const meta = existing ?? document.createElement("meta");
  if (!existing) {
    meta.name = "robots";
    meta.setAttribute(ROBOTS_CREATED_ATTRIBUTE, "true");
    document.head.appendChild(meta);
  } else if (!meta.hasAttribute(ROBOTS_PREVIOUS_CONTENT_ATTRIBUTE)) {
    meta.setAttribute(ROBOTS_PREVIOUS_CONTENT_ATTRIBUTE, meta.content);
  }
  meta.content = "noindex, nofollow";
}

function restoreRobotsMetadata() {
  const meta = document.head.querySelector<HTMLMetaElement>(
    `meta[name="robots"][${ROBOTS_CREATED_ATTRIBUTE}], meta[name="robots"][${ROBOTS_PREVIOUS_CONTENT_ATTRIBUTE}]`,
  );
  if (!meta) return;
  if (meta.hasAttribute(ROBOTS_CREATED_ATTRIBUTE)) {
    meta.remove();
    return;
  }
  meta.content = meta.getAttribute(ROBOTS_PREVIOUS_CONTENT_ATTRIBUTE) ?? "";
  meta.removeAttribute(ROBOTS_PREVIOUS_CONTENT_ATTRIBUTE);
}

function resolveSupportedEnglishPageKey(pathname: string): EnglishPageKey | undefined {
  const normalized = pathname.trim().replace(/\/+$/, "") || "/";
  if (!/^\/en(?:\/|$)/i.test(normalized)) return undefined;
  const contentPath = normalized.replace(/^\/en/i, "") || "/";
  return ENGLISH_PAGE_KEY_BY_PATH[
    contentPath.toLowerCase() as keyof typeof ENGLISH_PAGE_KEY_BY_PATH
  ];
}

/**
 * 英文内容未形成同语言发布事实前，/en 只返回明确的 unavailable 状态。
 * 这里不加载中文 PublicLayout，因此不会把中文 PageDocument 或 SiteSettings 当英文回退。
 */
export default function EnglishPublicRouteGate() {
  const { pathname } = useLocation();
  const pageKey = resolveSupportedEnglishPageKey(pathname);
  const documentResource = usePublishedPageDocument(pageKey, "en");
  const published = Boolean(pageKey && documentResource.status === "published");

  useEffect(() => {
    document.documentElement.lang = "en";
    if (!published) {
      document.title = "English site unavailable";
      setRobotsNoIndex();
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
    } else {
      restoreRobotsMetadata();
    }

    return () => {
      restoreRobotsMetadata();
      document.documentElement.lang = "zh-CN";
    };
  }, [published]);

  if (pageKey && published) {
    return (
      <Outlet
        context={{
          englishPublication: { pageKey, documentResource },
        } satisfies EnglishPublicRouteOutletContext}
      />
    );
  }

  if (pageKey && ["idle", "loading"].includes(documentResource.status)) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-brand-bg px-6 text-brand-muted"
        data-public-locale="en"
        data-locale-availability="checking"
        role="status"
      >
        Checking English page availability…
      </main>
    );
  }

  if (pageKey) {
    const label = ENGLISH_PAGE_LABELS[pageKey];
    return (
      <main data-public-locale="en" data-locale-availability="unavailable">
        <PublicPageFallback
          pageKey={pageKey}
          pageLabel={label}
          status={documentResource.status === "error" ? "error" : documentResource.status === "invalid" ? "invalid" : "unpublished"}
          content={{
            eyebrow: "HAICHUAN JEWELRY",
            title: `${label} is not published`,
            description: "This language version is unavailable until an approved English page is published.",
            primaryAction: { label: "Visit the Chinese site", href: "/" },
          }}
          onRetry={documentResource.status === "error"
            ? () => void documentResource.refresh(true)
            : undefined}
          locale="en"
        />
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-brand-bg px-6 text-brand-text"
      data-public-locale="en"
      data-locale-availability="unavailable"
    >
      <section className="max-w-xl text-center" aria-labelledby="english-site-title">
        <p className="mb-4 text-sm uppercase tracking-[0.28em] text-brand-muted">
          Haichuan Jewelry
        </p>
        <h1 id="english-site-title" className="text-3xl font-medium sm:text-4xl">
          English site is not published yet
        </h1>
        <p className="mt-5 leading-7 text-brand-muted">
          The English content is under review. No Chinese content is shown here as a translation.
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center justify-center border border-brand-line px-6 py-3 text-sm"
          to="/"
        >
          Visit the Chinese site
        </Link>
      </section>
    </main>
  );
}
