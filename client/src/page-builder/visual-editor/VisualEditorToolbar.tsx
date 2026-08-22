import { InfoCircleOutlined } from "@ant-design/icons";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import { useVisualEditorSession } from "./visualEditorSession";

const NODE_LABELS: Record<string, string> = {
  desktopImage: "桌面主图",
  mobileImage: "移动端主图",
  image: "主图",
  mainImage: "主海报",
  detailImage: "细节海报",
  bgImage: "背景图",
  title: "标题",
  eyebrow: "眉题",
  subtitle: "副标题",
  description: "说明",
  actionText: "行动文字",
  buttonText: "主按钮",
  copy: "文案",
  action: "行动区域",
};

export default function VisualEditorToolbar({
  blockId,
  moduleType,
  panelMode = "content",
  onRequestDesign,
}: {
  blockId: string;
  moduleType: string;
  panelMode?: "content" | "design";
  onRequestDesign?: (mode: "adjust-layout" | "adjust-media") => void;
}) {
  const selection = useVisualEditorSession((state) => state.selection);
  const mode = useVisualEditorSession((state) => state.mode);
  const setMode = useVisualEditorSession((state) => state.setMode);
  const current = selection?.blockId === blockId ? selection : null;
  const capabilities = getContentTemplateContract(moduleType)?.editorCapabilities.layoutOverrides;
  const canAdjustMedia = Boolean(
    current?.kind === "media" && capabilities?.slots?.some((slot) => slot.roleId === current.nodeId),
  );
  const canAdjustLayout = Boolean(
    current && (
      capabilities?.slots?.some((slot) => slot.roleId === current.nodeId) ||
      capabilities?.textRoles?.some((role) => role.roleId === current.nodeId)
    ),
  );

  return (
    <div
      className="homepage-editor__visual-toolbar"
      data-has-selection={current ? "true" : "false"}
      aria-label="画布直接编辑"
    >
      <div>
        <InfoCircleOutlined aria-hidden="true" />
        <strong>
          {current
            ? `${mode === "select" ? "已选择" : "正在调整"}：${NODE_LABELS[current.nodeId] ?? current.nodeId}`
            : panelMode === "design"
              ? "在画布中点选对象，再明确选择调整方式"
              : "在画布点选对象，面板只显示它的内容"}
        </strong>
      </div>
      {current && panelMode === "content" && canAdjustMedia && onRequestDesign ? (
        <div role="group" aria-label="图片设计入口">
          <button
            type="button"
            onClick={() => onRequestDesign("adjust-media")}
          >
            调整构图
          </button>
        </div>
      ) : null}
      {current && panelMode === "design" ? (
        <div role="group" aria-label="当前对象调整方式">
          {canAdjustLayout ? (
            <button
              type="button"
              className={mode === "adjust-layout" ? "is-active" : ""}
              aria-pressed={mode === "adjust-layout"}
              onClick={() => setMode("adjust-layout")}
            >
              调整区域
            </button>
          ) : null}
          {canAdjustMedia ? (
            <button
              type="button"
              className={mode === "adjust-media" ? "is-active" : ""}
              aria-pressed={mode === "adjust-media"}
              onClick={() => setMode("adjust-media")}
            >
              调整图片构图
            </button>
          ) : null}
        </div>
      ) : null}
      {mode === "adjust-media" && canAdjustMedia ? (
        <p role="status">在画布中拖动图片调整焦点；按 Esc 退出调整。</p>
      ) : null}
      {mode === "adjust-layout" && canAdjustLayout ? (
        <p role="status">拖动对象改变位置，拖动右下角调整大小；方向键移动，Alt + 方向键调整大小，Esc 退出。</p>
      ) : null}
    </div>
  );
}
