import { getBrowserPublicContentLocale } from "@/i18n/publicLocale";

export default function RouteLoading() {
  const english = getBrowserPublicContentLocale() === "en";

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-brand-bg"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-10 w-10 animate-spin rounded-full border-4 border-brand-line border-t-brand-text"
        aria-hidden="true"
      />
      <span className="sr-only">{english ? "Loading page" : "页面加载中"}</span>
    </div>
  );
}
