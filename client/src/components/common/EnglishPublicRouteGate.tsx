import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { PUBLIC_ENGLISH_ROUTES_ENABLED } from "@/i18n/publicLocale";

function setRobotsNoIndex() {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  const meta = existing ?? document.createElement("meta");
  if (!existing) {
    meta.name = "robots";
    document.head.appendChild(meta);
  }
  meta.content = "noindex, nofollow";
}

/**
 * 英文内容未形成同语言发布事实前，/en 只返回明确的 unavailable 状态。
 * 这里不加载中文 PublicLayout，因此不会把中文 PageDocument 或 SiteSettings 当英文回退。
 */
export default function EnglishPublicRouteGate() {
  useEffect(() => {
    document.documentElement.lang = "en";
    if (!PUBLIC_ENGLISH_ROUTES_ENABLED) {
      document.title = "English site unavailable";
      setRobotsNoIndex();
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
    }

    return () => {
      document.documentElement.lang = "zh-CN";
    };
  }, []);

  if (PUBLIC_ENGLISH_ROUTES_ENABLED) return <Outlet />;

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
