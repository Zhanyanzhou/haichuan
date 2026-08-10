/**
 * PropertyInspector.tsx — 属性配置面板
 * 未选中 Block → 显示页面设置
 * 选中 Block → 显示该 Block 的配置字段（由 Puck Fields 引擎驱动）
 */
import { useEditorStore } from "./editorStore";

export default function PropertyInspector() {
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const selectedItemType = useEditorStore((s) => s.selectedItemType);
  const pageData = useEditorStore((s) => s.pageData);

  if (!selectedItemId || !selectedItemType) {
    /* ── 未选中：显示页面设置 ── */
    return (
      <div
        className="flex flex-col h-full bg-white border-l border-gray-200"
        style={{ width: 280 }}
      >
        <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100 flex-shrink-0">
          页面设置
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">页面标题</label>
            <input
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              defaultValue="首页"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">页面描述</label>
            <textarea
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              rows={3}
              defaultValue=""
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SEO 标题</label>
            <input
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
              defaultValue=""
            />
          </div>
          <hr className="border-gray-100" />
          <div className="text-xs text-gray-400">
            模块数量：{pageData?.content?.length ?? 0}
          </div>
        </div>
      </div>
    );
  }

  /* ── 选中 Block：显示属性 ── */
  return (
    <div
      className="flex flex-col h-full bg-white border-l border-gray-200"
      style={{ width: 280 }}
    >
      <div className="px-3 py-2 text-xs font-medium text-gray-700 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
        <span>模块配置</span>
        <span className="text-gray-400 font-normal">{selectedItemType}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Puck Fields 引擎渲染区域 — 由 Puck 内部接管 */}
        <div id="puck-fields-portal" className="p-3" />
      </div>
    </div>
  );
}
