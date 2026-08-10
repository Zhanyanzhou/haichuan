/**
 * PageOutline.tsx — 页面结构树面板
 * 显示当前页面 Block 列表，支持点击选中、拖拽排序
 */
import { useEditorStore } from "./editorStore";

export default function PageOutline() {
  const pageData = useEditorStore((s) => s.pageData);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const setPageData = useEditorStore((s) => s.setPageData);
  const setSelectedItem = useEditorStore((s) => s.setSelectedItem);

  const blocks: any[] = pageData?.content ?? [];

  /** 选中 Block */
  const handleSelect = (block: any) => {
    setSelectedItem(block.props?.id ?? null, block.type ?? null);
  };

  /** 上移 */
  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const arr = [...blocks];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    setPageData({ ...pageData, content: arr });
  };

  /** 下移 */
  const moveDown = (idx: number) => {
    if (idx >= blocks.length - 1) return;
    const arr = [...blocks];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    setPageData({ ...pageData, content: arr });
  };

  /** 删除 */
  const remove = (idx: number) => {
    const arr = blocks.filter((_, i) => i !== idx);
    setPageData({ ...pageData, content: arr });
    setSelectedItem(null, null);
  };

  /** 复制 */
  const duplicate = (idx: number) => {
    const src = blocks[idx];
    const clone = {
      ...src,
      props: { ...src.props, id: `${src.type}-${Date.now()}` },
    };
    const arr = [...blocks];
    arr.splice(idx + 1, 0, clone);
    setPageData({ ...pageData, content: arr });
  };

  return (
    <div
      className="flex flex-col h-full bg-white border-l border-gray-200"
      style={{ width: 200 }}
    >
      <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100 flex-shrink-0">
        页面结构
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {blocks.map((block: any, idx: number) => {
          const id = block.props?.id ?? `${idx}`;
          const isSelected = selectedItemId === id;
          return (
            <div
              key={id}
              className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                isSelected
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => handleSelect(block)}
            >
              <span className="text-gray-400 w-4 text-center flex-shrink-0">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 truncate">{block.type}</span>
              {/* 悬停操作按钮 */}
              <span className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                <button
                  className="px-1 text-gray-400 hover:text-blue-500"
                  title="上移"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveUp(idx);
                  }}
                >
                  ↑
                </button>
                <button
                  className="px-1 text-gray-400 hover:text-blue-500"
                  title="下移"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveDown(idx);
                  }}
                >
                  ↓
                </button>
                <button
                  className="px-1 text-gray-400 hover:text-green-500"
                  title="复制"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(idx);
                  }}
                >
                  ⧉
                </button>
                <button
                  className="px-1 text-gray-400 hover:text-red-500"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(idx);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          );
        })}
        {blocks.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-8">
            暂无模块，从左侧模块库添加
          </div>
        )}
      </div>
    </div>
  );
}
