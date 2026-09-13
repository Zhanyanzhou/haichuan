/**
 * PageSettingsDrawer.tsx — 页面展示设置抽屉。
 * 编辑可选的内部内容责任与公开 SEO；素材授权只在页面素材库集中维护。
 * 未完成的资料可以保存为草稿；正式发布由服务端统一校验。
 */
import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Drawer, Input } from "antd";
import MediaPickerField from "@/page-builder/fields/MediaPickerField";
import {
  CONTENT_TEMPLATE_PAGE_METADATA,
  getPageDocumentMediaReferences,
} from "@/page-builder/generated/contentTemplates.generated";
import { getDynamicTemplateDocumentMediaReferences } from "@/page-builder/dynamic-template-instance";
import type { PuckProps } from "@/page-builder/types";
import {
  isPagePublishIssue,
  type PublishValidationIssue,
  type PublishValidationStatus,
} from "@/page-builder/inspector/publishValidation";

export default function PageSettingsDrawer({
  open,
  pageKey,
  metadata,
  puckData,
  publishIssues,
  validationStatus,
  focusField,
  onRetryValidation,
  onClose,
  onSave,
}: {
  open: boolean;
  pageKey: string;
  metadata: PuckProps;
  puckData: unknown;
  publishIssues: PublishValidationIssue[];
  validationStatus: PublishValidationStatus;
  focusField?: string | null;
  onRetryValidation: () => void;
  onClose: () => void;
  onSave: (next: {
    seoTitle?: string;
    seoDescription?: string;
    ogImage?: string;
    contentOwner?: string;
  }) => Promise<boolean>;
}) {
  const { modal } = AntdApp.useApp();
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [contentOwner, setContentOwner] = useState("");
  const [saving, setSaving] = useState(false);
  const [baselineSignature, setBaselineSignature] = useState("");
  const pagePublishIssues = publishIssues.filter(
    (issue) => issue.severity !== "info" && isPagePublishIssue(issue),
  );

  useEffect(() => {
    if (open) {
      const nextSeoTitle = typeof metadata?.seoTitle === "string" ? metadata.seoTitle : "";
      const nextSeoDescription = typeof metadata?.seoDescription === "string" ? metadata.seoDescription : "";
      const nextOgImage = typeof metadata?.ogImage === "string" ? metadata.ogImage : "";
      const nextContentOwner = typeof metadata?.contentOwner === "string" ? metadata.contentOwner : "";
      setSeoTitle(nextSeoTitle);
      setSeoDescription(nextSeoDescription);
      setOgImage(nextOgImage);
      setContentOwner(nextContentOwner);
      setBaselineSignature(JSON.stringify({
        seoTitle: nextSeoTitle,
        seoDescription: nextSeoDescription,
        ogImage: nextOgImage,
        contentOwner: nextContentOwner,
      }));
    }
  }, [open, metadata]);

  useEffect(() => {
    if (!open || !focusField) return;
    const fieldKey = focusField.includes("mediaRights")
      ? "mediaRights"
      : focusField.split(".").pop();
    if (!fieldKey) return;
    const focusTarget = () => {
      const field = document.querySelector<HTMLElement>(
        `.homepage-editor__page-settings-drawer [data-page-settings-field="${CSS.escape(fieldKey)}"]`,
      );
      if (!field) return;
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      (field.matches("input, textarea, button, [tabindex]")
        ? field
        : field.querySelector<HTMLElement>("input, textarea, button, [tabindex]"))?.focus();
    };
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(focusTarget));
    return () => window.cancelAnimationFrame(frame);
  }, [focusField, open]);

  const mediaReferences = useMemo(() => {
    const seenUrls = new Set<string>();
    return [
      ...getPageDocumentMediaReferences(puckData, { ogImage }, pageKey),
      ...getDynamicTemplateDocumentMediaReferences(puckData, pageKey),
    ].filter((reference) => {
      if (seenUrls.has(reference.url)) return false;
      seenUrls.add(reference.url);
      return true;
    });
  }, [ogImage, pageKey, puckData]);
  const currentSignature = useMemo(() => JSON.stringify({
    seoTitle,
    seoDescription,
    ogImage,
    contentOwner,
  }), [contentOwner, ogImage, seoDescription, seoTitle]);
  const dirty = Boolean(baselineSignature) && currentSignature !== baselineSignature;

  const requestClose = () => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    modal.confirm({
      title: "放弃未保存的页面设置？",
      content: "页面设置中的修改尚未保存。继续关闭会丢失这些输入。",
      okText: "放弃修改",
      okButtonProps: { danger: true },
      cancelText: "继续编辑",
      onOk: onClose,
    });
  };
  const saveSettings = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        seoTitle: seoTitle.trim(),
        seoDescription: seoDescription.trim(),
        ogImage: ogImage.trim(),
        contentOwner: contentOwner.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="页面展示设置"
      placement="right"
      width="min(520px, 100vw)"
      open={open}
      className="homepage-editor__page-settings-drawer"
      onClose={requestClose}
      closable={!saving}
      keyboard={!saving}
      maskClosable={!saving}
      extra={
        <Button
          type="primary"
          size="small"
          loading={saving}
          disabled={saving}
          onClick={() => void saveSettings()}
        >
          保存整页草稿
        </Button>
      }
    >
      <fieldset
        disabled={saving}
        aria-busy={saving}
        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
      >
        <div className="homepage-editor__page-settings">
        {validationStatus === "unverified" ? (
          <section className="homepage-editor__page-settings-validation" role="status">
            <strong>Mock 模式未连接服务端发布检查</strong>
            <span>可验证页面设置交互，但不能据此判断真实发布资格。</span>
          </section>
        ) : validationStatus === "unavailable" ? (
          <section className="homepage-editor__page-settings-validation is-error" role="alert">
            <strong>发布资格检查暂时不可用</strong>
            <span>草稿内容已保留，但当前结果不能作为发布依据。</span>
            <Button size="small" onClick={onRetryValidation}>重新检查</Button>
          </section>
        ) : validationStatus === "validating" ? (
          <section className="homepage-editor__page-settings-validation" role="status" aria-live="polite">
            <strong>正在检查页面设置…</strong>
            <span>完成后会在这里显示与页面设置相关的问题。</span>
          </section>
        ) : pagePublishIssues.length > 0 ? (
          <section className="homepage-editor__page-settings-validation is-warning" role="alert">
            <strong>页面设置 · {pagePublishIssues.length} 项待处理</strong>
            <ul>
              {pagePublishIssues.map((issue, index) => (
                <li key={`${issue.path ?? "page"}-${issue.message}-${index}`}>
                  {issue.severity === "error" ? "阻断：" : "提醒："}{issue.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section
          className="homepage-editor__media-rights"
          role="status"
          aria-live="polite"
          aria-label="当前页面可选展示资料说明"
        >
          <div className="homepage-editor__media-rights-heading">
            <strong>页面标题、描述、分享图与责任团队均为可选</strong>
            <span>素材授权在页面素材库集中维护</span>
          </div>
          <p className="homepage-editor__page-settings-hint">
            可选展示资料留空不会阻断发布；资料未完成时仍可保存草稿。实际可见素材的公开资格由服务端统一检查。
          </p>
        </section>
        <div data-page-settings-field="contentOwner">
          <label className="homepage-editor__page-settings-label">
            内容责任团队 / 岗位（内部，可选）
          </label>
          <Input
            value={contentOwner}
            onChange={(e) => setContentOwner(e.target.value)}
            placeholder="例：品牌内容组"
            maxLength={CONTENT_TEMPLATE_PAGE_METADATA.limits.contentOwner}
            showCount
          />
        </div>
        <p className="homepage-editor__page-settings-hint" style={{ marginTop: 6 }}>
          用于内部发布责任追踪，不随公开页面接口返回；建议填写稳定的团队或岗位，而不是个人姓名。
        </p>
        <p className="homepage-editor__page-settings-hint">
          设置当前页面的搜索标题与描述，影响搜索引擎收录与微信 /
          微博等社交分享卡片；可以按需填写或留空。
        </p>
        <div data-page-settings-field="seoTitle">
          <label className="homepage-editor__page-settings-label">
            页面标题（可选，建议 ≤ 30 字）
          </label>
          <Input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="例：海川珠宝 · 足金匠心系列官方旗舰店"
            maxLength={CONTENT_TEMPLATE_PAGE_METADATA.limits.seoTitle}
            showCount
          />
        </div>
        <div data-page-settings-field="seoDescription">
          <label className="homepage-editor__page-settings-label">
            页面描述（可选，建议 ≤ 80 字）
          </label>
          <Input.TextArea
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            placeholder="例：海川珠宝精选足金、K金、钻石作品，提供在线选款与一对一顾问定制服务。"
            maxLength={CONTENT_TEMPLATE_PAGE_METADATA.limits.seoDescription}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </div>
        <div data-page-settings-field="ogImage">
          <label className="homepage-editor__page-settings-label">
            社交分享图（og:image，可选）
          </label>
          <MediaPickerField
            value={ogImage}
            onChange={setOgImage}
            spec={{
              width: 1200,
              height: 630,
              ratio: "1.91:1",
              label: "社交分享图（推荐 1200×630，1.91:1）",
            }}
            placeholder="上传分享卡片封面"
          />
        </div>
        <p
          className="homepage-editor__page-settings-hint"
          style={{ marginTop: 6 }}
        >
          分享到微信 / 微博 / Twitter 等平台时显示的封面图，建议
          1200×630；素材来源与授权在页面素材库集中登记。
        </p>
        <section
          className="homepage-editor__media-rights"
          aria-label="媒体来源与授权"
          data-page-settings-field="mediaRights"
        >
          <div className="homepage-editor__media-rights-heading">
            <strong>素材授权状态</strong>
            <span>{mediaReferences.length} 项当前页面素材</span>
          </div>
          <p className="homepage-editor__page-settings-hint">
            素材来源、授权证明与审核在页面素材库集中维护。页面草稿可以继续保存；发布时服务端会汇总检查当前页面及母模板继承的实际可见素材。
          </p>
          {mediaReferences.length === 0 ? (
            <p className="homepage-editor__media-rights-empty">当前页面尚未引用公开素材。</p>
          ) : (
            <p role="status" aria-live="polite">
              当前页面引用 {mediaReferences.length} 项素材；具体合格项与阻断项以服务端发布检查为准。
            </p>
          )}
          <Button href="/admin/media" target="_blank" rel="noopener noreferrer">
            在页面素材库登记与审核
          </Button>
        </section>
        <p
          className="homepage-editor__page-settings-hint"
          style={{ marginTop: 12, color: "var(--adm-action)" }}
        >
          页面设置与画布修改会一起保存为整页草稿；不会更新前台，仍需点击顶部“发布”。
        </p>
        </div>
      </fieldset>
    </Drawer>
  );
}
