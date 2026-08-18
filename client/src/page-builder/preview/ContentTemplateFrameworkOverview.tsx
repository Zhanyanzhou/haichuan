import {
  CONTENT_TEMPLATE_REGISTRY,
  getContentTemplatePreview,
  type ContentTemplateSkeletonRole,
} from "../generated/contentTemplates.generated";
import ContentTemplateSkeletonPreview from "./ContentTemplateSkeletonPreview";
import "./contentTemplateFrameworkOverview.css";

const ROLE_LABEL: Record<ContentTemplateSkeletonRole, string> = {
  media: "图片",
  mainMedia: "主图",
  detailMedia: "细节图",
  copy: "文字",
  action: "行动位",
  marker: "编号/状态",
  timeline: "流程",
  list: "列表",
  card: "卡片",
  quote: "引述",
  form: "表单",
};

const CATEGORY_ORDER = ["视觉展示", "图文内容", "商品展示", "导航入口", "服务信息", "活动内容"] as const;

function orderText(order: readonly ContentTemplateSkeletonRole[]) {
  return order.map((role) => ROLE_LABEL[role]).join(" → ");
}

/** 同源只读总览：用于一次比较全部 23 个模板的桌面与手机骨架。 */
export default function ContentTemplateFrameworkOverview() {
  return (
    <div className="hc-template-overview" data-template-overview="23">
      <header className="hc-template-overview__header">
        <p>内容模板 · 结构评审</p>
        <h2>23 个基础框架总览</h2>
        <span>骨架完成，不代表功能完成</span>
      </header>
      {CATEGORY_ORDER.map((category) => {
        const templates = CONTENT_TEMPLATE_REGISTRY.filter((template) => template.category === category);
        return (
          <section key={category} className="hc-template-overview__group" aria-label={category}>
            <h3>{category}<small>{templates.length} 个</small></h3>
            <div className="hc-template-overview__grid">
              {templates.map((template) => {
                const preview = getContentTemplatePreview(template.moduleType);
                if (!preview) return null;
                return (
                  <article key={template.key} className={`hc-template-overview__card hc-template-overview__card--${preview.visualRole}`} data-template-key={template.key}>
                    <div className="hc-template-overview__title">
                      <div><strong>{template.displayName}</strong><span>{preview.purpose}</span></div>
                      <code>{template.moduleType}</code>
                    </div>
                    <div className="hc-template-overview__previews">
                      <figure><figcaption>桌面 · {preview.visualRole === "primary-stage" ? "最高舞台" : preview.visualRole === "feature-stage" ? "主章节" : "辅助章节"}</figcaption><ContentTemplateSkeletonPreview moduleType={template.moduleType} density="overview" /></figure>
                      <figure><figcaption>手机</figcaption><ContentTemplateSkeletonPreview moduleType={template.moduleType} viewport="mobile" density="overview" /></figure>
                    </div>
                    <dl>
                      <div><dt>桌面结构</dt><dd>{orderText(preview.desktop.order)}</dd></div>
                      <div><dt>手机顺序</dt><dd>{orderText(preview.mobile.order)}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
