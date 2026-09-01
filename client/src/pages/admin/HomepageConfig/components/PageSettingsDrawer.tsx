/**
 * PageSettingsDrawer.tsx — 页面展示设置抽屉。
 * 编辑可选的内部内容责任、公开 SEO 与素材记录，写入页面 metadata；
 * 这些资料用于展示和追溯，不决定运营者能否发布页面。
 */
import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Drawer, Input } from "antd";
import MediaPickerField from "@/page-builder/fields/MediaPickerField";
import {
  CONTENT_TEMPLATE_PAGE_METADATA,
  getPageDocumentMediaReferences,
  type ContentTemplateMediaRight,
} from "@/page-builder/generated/contentTemplates.generated";
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
    mediaRights?: ContentTemplateMediaRight[];
  }) => Promise<boolean>;
}) {
  const { modal } = AntdApp.useApp();
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [contentOwner, setContentOwner] = useState("");
  const [mediaRights, setMediaRights] = useState<ContentTemplateMediaRight[]>([]);
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
      const nextMediaRights = Array.isArray(metadata?.mediaRights)
        ? metadata.mediaRights.flatMap((item: unknown) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return [];
            const record = item as Record<string, unknown>;
            return [{
              assetUrl: typeof record.assetUrl === "string" ? record.assetUrl.trim() : "",
              source: typeof record.source === "string" ? record.source : "",
              authorizationId:
                typeof record.authorizationId === "string" ? record.authorizationId : "",
            }];
          })
        : [];
      setSeoTitle(nextSeoTitle);
      setSeoDescription(nextSeoDescription);
      setOgImage(nextOgImage);
      setContentOwner(nextContentOwner);
      setMediaRights(nextMediaRights);
      setBaselineSignature(JSON.stringify({
        seoTitle: nextSeoTitle,
        seoDescription: nextSeoDescription,
        ogImage: nextOgImage,
        contentOwner: nextContentOwner,
        mediaRights: nextMediaRights,
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

  const mediaReferences = useMemo(
    () => getPageDocumentMediaReferences(puckData, { ogImage }, pageKey),
    [ogImage, pageKey, puckData],
  );
  const mediaRightsByUrl = useMemo(
    () => new Map(mediaRights.map((item) => [item.assetUrl, item])),
    [mediaRights],
  );
  const currentSignature = useMemo(() => JSON.stringify({
    seoTitle,
    seoDescription,
    ogImage,
    contentOwner,
    mediaRights,
  }), [contentOwner, mediaRights, ogImage, seoDescription, seoTitle]);
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
  const updateMediaRight = (
    assetUrl: string,
    field: "source" | "authorizationId",
    value: string,
  ) => {
    setMediaRights((current) => {
      const index = current.findIndex((item) => item.assetUrl === assetUrl);
      if (index < 0) {
        return [...current, { assetUrl, source: "", authorizationId: "", [field]: value }];
      }
      return current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      );
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
        mediaRights: mediaReferences.map((reference) => {
          const existing = mediaRightsByUrl.get(reference.url);
          return {
            assetUrl: reference.url,
            source: existing?.source.trim() ?? "",
            authorizationId: existing?.authorizationId.trim() ?? "",
          };
        }),
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
          保存
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
            <strong>以下资料均为可选</strong>
            <span>不填写也可以直接发布</span>
          </div>
          <p className="homepage-editor__page-settings-hint">
            留空不会阻断发布；填写后会校验长度、格式与素材是否已上传到本站。
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
          1200×630；素材记录可按内部管理需要补充，不影响发布。
        </p>
        <section
          className="homepage-editor__media-rights"
          aria-label="媒体来源与授权"
          data-page-settings-field="mediaRights"
        >
          <div className="homepage-editor__media-rights-heading">
            <strong>媒体来源与授权（可选）</strong>
            <span>{mediaReferences.length} 项当前公开素材</span>
          </div>
          <p className="homepage-editor__page-settings-hint">
            可按内部管理需要记录素材来源与授权编号；同一地址在页面内重复使用时只记录一次。记录仅供后台追溯，不随公开页面接口返回，也不影响发布。
          </p>
          {mediaReferences.length === 0 ? (
            <p className="homepage-editor__media-rights-empty">当前页面尚未引用公开素材。</p>
          ) : mediaReferences.map((reference, index) => {
            const right = mediaRightsByUrl.get(reference.url);
            return (
              <div
                className="homepage-editor__media-rights-item"
                key={reference.url}
                data-testid="page-media-right"
              >
                <div className="homepage-editor__media-rights-asset">
                  <strong>素材 {index + 1}</strong>
                  <code title={reference.url}>{reference.url}</code>
                  <span>{reference.moduleType || "社交分享图"} · {reference.path}</span>
                </div>
                <label htmlFor={`media-right-source-${index}`}>
                  素材来源（可选）
                </label>
                <Input
                  id={`media-right-source-${index}`}
                  aria-label={`素材 ${index + 1} 来源`}
                  value={right?.source ?? ""}
                  onChange={(event) =>
                    updateMediaRight(reference.url, "source", event.target.value)
                  }
                  placeholder="例：品牌自有拍摄 / 已授权供应商"
                  maxLength={CONTENT_TEMPLATE_PAGE_METADATA.mediaRights.fieldLimits.source}
                  showCount
                />
                <label htmlFor={`media-right-authorization-${index}`}>
                  授权编号 / 存档编号（可选）
                </label>
                <Input
                  id={`media-right-authorization-${index}`}
                  aria-label={`素材 ${index + 1} 授权编号`}
                  value={right?.authorizationId ?? ""}
                  onChange={(event) =>
                    updateMediaRight(reference.url, "authorizationId", event.target.value)
                  }
                  placeholder="例：HC-OWN-2026-001"
                  maxLength={CONTENT_TEMPLATE_PAGE_METADATA.mediaRights.fieldLimits.authorizationId}
                  showCount
                />
              </div>
            );
          })}
        </section>
        <p
          className="homepage-editor__page-settings-hint"
          style={{ marginTop: 12, color: "var(--adm-action)" }}
        >
          保存后仅写入草稿，需点击顶部「发布」才会更新前台页面。
        </p>
        </div>
      </fieldset>
    </Drawer>
  );
}
