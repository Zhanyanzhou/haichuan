export default function RouteLoading() {
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
      <span className="sr-only">页面加载中</span>
    </div>
  );
}
