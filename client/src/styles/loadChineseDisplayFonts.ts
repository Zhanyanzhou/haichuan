let scheduled = false;

/** 首页在主视觉就绪后调用，其他路由沿用文档 load 后的空闲加载。 */
export function scheduleChineseDisplayFonts() {
  if (scheduled) return;
  scheduled = true;

  const schedule = () => {
    const load = () => {
      void import("@fontsource/noto-serif-sc/300.css").catch(() => undefined);
      void import("@fontsource/noto-serif-sc/400.css").catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(load, { timeout: 2000 });
    } else {
      window.setTimeout(load, 1000);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}
