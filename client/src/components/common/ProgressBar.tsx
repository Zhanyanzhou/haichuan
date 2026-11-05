/** 由路由加载占位控制生命周期，下载时长未知。 */
export default function ProgressBar() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] bg-brand-gold motion-safe:animate-pulse"
      data-testid="route-progress"
      aria-hidden="true"
    />
  );
}
