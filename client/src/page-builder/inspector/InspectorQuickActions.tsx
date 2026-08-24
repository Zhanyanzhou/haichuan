import {
  AppstoreOutlined,
  EditOutlined,
  LayoutOutlined,
  RollbackOutlined,
} from "@ant-design/icons";

type InspectorObjectKind =
  | "module"
  | "media"
  | "video"
  | "text"
  | "action"
  | "product"
  | "collection"
  | "structured";

interface InspectorQuickActionsProps {
  objectKind: InspectorObjectKind;
  selectedObjectLabel: string;
  canEditDesign: boolean;
  isObjectScope: boolean;
  onEditContent: () => void;
  onEditDesign: () => void;
  onReturnToModule?: () => void;
}

const CONTENT_ACTION: Record<InspectorObjectKind, string> = {
  module: "编辑模块内容",
  media: "更换图片与编辑替代文字",
  video: "编辑视频、封面与播放行为",
  text: "编辑文字内容",
  action: "编辑行动文案与去向",
  product: "选择商品与业务内容",
  collection: "编辑集合条目",
  structured: "编辑对象内容",
};

const DESIGN_ACTION: Record<InspectorObjectKind, string> = {
  module: "调整模块布局与样式",
  media: "调整图片构图与布局",
  video: "调整封面构图与布局",
  text: "调整文字排版与位置",
  action: "调整行动文字排版",
  product: "调整商品区域展示",
  collection: "调整集合布局",
  structured: "调整对象布局",
};

/** 不写数据，只把常用任务路由到稳定的内容/设计页。 */
export default function InspectorQuickActions({
  objectKind,
  selectedObjectLabel,
  canEditDesign,
  isObjectScope,
  onEditContent,
  onEditDesign,
  onReturnToModule,
}: InspectorQuickActionsProps) {
  return (
    <section
      className="homepage-editor__quick-actions"
      aria-label={`${selectedObjectLabel}快捷操作`}
      data-inspector-quick-actions={objectKind}
    >
      <header>
        <AppstoreOutlined aria-hidden="true" />
        <div>
          <strong>{selectedObjectLabel}</strong>
          <span>选择任务，右栏会保持当前对象不变。</span>
        </div>
      </header>
      <div>
        <button type="button" onClick={onEditContent}>
          <EditOutlined aria-hidden="true" />
          <span>{CONTENT_ACTION[objectKind]}</span>
        </button>
        <button
          type="button"
          disabled={!canEditDesign}
          aria-describedby={!canEditDesign ? "inspector-design-unavailable" : undefined}
          onClick={onEditDesign}
        >
          <LayoutOutlined aria-hidden="true" />
          <span>{canEditDesign ? DESIGN_ACTION[objectKind] : "当前对象没有设计能力"}</span>
        </button>
        {!canEditDesign ? (
          <small id="inspector-design-unavailable">设计能力由当前模板合同决定。</small>
        ) : null}
        {isObjectScope && onReturnToModule ? (
          <button type="button" className="is-secondary" onClick={onReturnToModule}>
            <RollbackOutlined aria-hidden="true" />
            <span>返回模块级</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
