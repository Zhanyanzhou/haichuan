/**
 * StaleDocumentNotice — 公开端"旧快照"轻提示。
 *
 * 2026-08-21：前台刷新已发布文档失败时会保留最后一次有效快照（stale）。
 * 此前该状态不向访客暴露，发布后前台可能长时间显示旧内容而无人察觉。
 * 现在 stale 期间在右下角给一个不打断浏览的刷新入口；刷新成功后 stale
 * 自动清零，提示随之消失。SSE 断线轮询兜底见 usePagePublishStream。
 */
export default function StaleDocumentNotice({
  visible,
  onRefresh,
}: {
  visible: boolean;
  onRefresh: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 90,
        border: "1px solid #DDE1E2",
        background: "rgba(255, 255, 255, 0.96)",
        color: "#5F6568",
        fontSize: 12,
        lineHeight: 1.4,
        padding: "8px 14px",
        borderRadius: 999,
        boxShadow: "0 4px 16px rgba(24, 26, 27, 0.08)",
        cursor: "pointer",
      }}
    >
      内容可能不是最新，点击刷新
    </button>
  );
}
