function clampScroll(value: number, max: number) {
  return Math.min(Math.max(0, max), Math.max(0, value));
}

/** 滚轮落点内部若已有可滚动区域，留给它自己处理。 */
export function wheelTargetCanScroll(target: Element, deltaY: number, deltaX: number) {
  let node: Element | null = target;
  while (node && node !== node.ownerDocument.body && node !== node.ownerDocument.documentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style) {
      const canY = (style.overflowY === "auto" || style.overflowY === "scroll")
        && node.scrollHeight > node.clientHeight + 1;
      const canX = (style.overflowX === "auto" || style.overflowX === "scroll")
        && node.scrollWidth > node.clientWidth + 1;
      if (
        (canY && ((deltaY < 0 && node.scrollTop > 0) || (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1)))
        || (canX && ((deltaX < 0 && node.scrollLeft > 0) || (deltaX > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1)))
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * 把滚轮平移到指定滚动容器。
 * 同源 iframe 会吃掉滚轮；overflow:hidden 的画布也不会自己滚，但 scrollTop/scrollLeft 仍然有效。
 * 返回 true 表示已经移动并阻止了默认行为。Ctrl 滚轮留给浏览器缩放。
 */
export function applyWheelToScroller(scroller: HTMLElement, event: WheelEvent) {
  if (event.ctrlKey) return false;
  const target = event.target;
  if (target instanceof Element && wheelTargetCanScroll(target, event.deltaY, event.deltaX)) {
    return false;
  }
  const pixel = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? scroller.clientHeight
      : 1;
  const pageX = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
    ? scroller.clientWidth
    : pixel;
  const nextTop = clampScroll(
    scroller.scrollTop + event.deltaY * pixel,
    scroller.scrollHeight - scroller.clientHeight,
  );
  const nextLeft = clampScroll(
    scroller.scrollLeft + event.deltaX * pageX,
    scroller.scrollWidth - scroller.clientWidth,
  );
  if (nextTop === scroller.scrollTop && nextLeft === scroller.scrollLeft) return false;
  scroller.scrollTop = nextTop;
  scroller.scrollLeft = nextLeft;
  event.preventDefault();
  return true;
}

export function bindWheelToScroller(target: Document | HTMLElement, scroller: HTMLElement) {
  const onWheel = (event: WheelEvent) => {
    applyWheelToScroller(scroller, event);
  };
  target.addEventListener("wheel", onWheel, { capture: true, passive: false });
  return () => target.removeEventListener("wheel", onWheel, { capture: true });
}
