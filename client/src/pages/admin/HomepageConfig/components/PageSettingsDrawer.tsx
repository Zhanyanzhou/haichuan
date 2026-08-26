/**
 * PageSettingsDrawer.tsx — 页面发布设置抽屉。
 * 编辑内部内容责任与公开 SEO，写入页面 metadata。
 * 正式发布要求内容责任、SEO 与当前公开素材授权完整；草稿阶段允许保存未完成状态。
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Input } from "antd";
import MediaPickerField from "@/page-builder/fields/MediaPickerField";
import {
  CONTENT_TEMPLATE_PAGE_METADATA,
  getPageDocumentMediaReferences,
  type ContentTemplateMediaRight,
} from "@/page-builder/generated/contentTemplates.generated";

export default function PageSettingsDrawer({
  open,
  pageKey,
  metadata,
  puckData,
  onClose,
  onSave,
}: {
  open: boolean;
  pageKey: string;
  metadata: Record<string, any>;
  puckData: unknown;
  onClose: () => void;
  onSave: (next: {
    seoTitle?: string;
    seoDescription?: string;
    ogImage?: string;
    contentOwner?: string;
    mediaRights?: ContentTemplateMediaRight[];
  }) => Promise<boolean>;
}) {
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [contentOwner, setContentOwner] = useState("");
  const [mediaRights, setMediaRights] = useState<ContentTemplateMediaRight[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSeoTitle(metadata?.seoTitle || "");
      setSeoDescription(metadata?.seoDescription || "");
      setOgImage(metadata?.ogImage || "");
      setContentOwner(metadata?.contentOwner || "");
      setMediaRights(
        Array.isArray(metadata?.mediaRights)
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
          : [],
      );
    }
  }, [open, metadata]);

  const mediaReferences = useMemo(
    () => getPageDocumentMediaReferences(puckData, { ogImage }, pageKey),
    [ogImage, pageKey, puckData],
  );
  const mediaRightsByUrl = useMemo(
    () => new Map(mediaRights.map((item) => [item.assetUrl, item])),
    [mediaRights],
  );
  const completedPublicationFields = [
    seoTitle,
    seoDescription,
    ogImage,
    contentOwner,
  ].filter((value) => value.trim().length > 0).length;
  const completedMediaRights = mediaReferences.filter((reference) => {
    const right = mediaRightsByUrl.get(reference.url);
    return Boolean(right?.source.trim() && right?.authorizationId.trim());
  }).length;
  const settingsComplete =
    completedPublicationFields === 4
    && completedMediaRights === mediaReferences.length;
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
      title="页面发布设置"
      placement="right"
      width="min(520px, 100vw)"
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
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
        <section
          className="homepage-editor__media-rights"
          role="status"
          aria-live="polite"
          aria-label="当前页面正式发布资料完成度"
        >
          <div className="homepage-editor__media-rights-heading">
            <strong>{settingsComplete ? "发布资料已填写" : "发布资料待完善"}</strong>
            <span>
              必填资料 {completedPublicationFields}/4 · 素材授权 {completedMediaRights}/{mediaReferences.length}
            </span>
          </div>
          <p className="homepage-editor__page-settings-hint">
            {settingsComplete
              ? "保存后，服务端仍会复核页面结构、行动目标、业务引用和素材文件，再决定是否允许发布。"
              : "请补齐下方空白项；系统不会自动生成品牌文案、授权编号或内容责任信息。"}
          </p>
        </section>
        <label className="homepage-editor__page-settings-label">
          内容责任团队 / 岗位（内部）<em>必填</em>
        </label>
        <Input
          value={contentOwner}
          onChange={(e) => setContentOwner(e.target.value)}
          placeholder="例：品牌内容组"
          maxLength={CONTENT_TEMPLATE_PAGE_METADATA.limits.contentOwner}
          showCount
        />
        <p className="homepage-editor__page-settings-hint" style={{ marginTop: 6 }}>
          用于内部发布责任追踪，不随公开页面接口返回；建议填写稳定的团队或岗位，而不是个人姓名。
        </p>
        <p className="homepage-editor__page-settings-hint">
          设置当前页面的搜索标题与描述，影响搜索引擎收录与微信 /
          微博等社交分享卡片。草稿可暂时留空，正式发布前必须补齐以下三项。
        </p>
        <label className="homepage-editor__page-settings-label">
          页面标题（建议 ≤ 30 字）<em>必填</em>
        </label>
        <Input
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder="例：海川珠宝 · 足金匠心系列官方旗舰店"
          maxLength={CONTENT_TEMPLATE_PAGE_METADATA.limits.seoTitle}
          showCount
        />
        <label className="homepage-editor__page-settings-label">
          页面描述（建议 ≤ 80 字）<em>必填</em>
        </label>
        <Input.TextArea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          placeholder="例：海川珠宝精选足金、K金、钻石作品，提供在线选款与一对一顾问定制服务。"
          maxLength={CONTENT_TEMPLATE_PAGE_METADATA.limits.seoDescription}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
        <label className="homepage-editor__page-settings-label">
          社交分享图（og:image）<em>必填</em>
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
        <p
          className="homepage-editor__page-settings-hint"
          style={{ marginTop: 6 }}
        >
          分享到微信 / 微博 / Twitter 等平台时显示的封面图，建议
          1200×630。该图片属于正式公开素材，发布前还需完成素材授权核对。
        </p>
        <section
          className="homepage-editor__media-rights"
          aria-label="媒体来源与授权"
        >
          <div className="homepage-editor__media-rights-heading">
            <strong>媒体来源与授权</strong>
            <span>{mediaReferences.length} 项当前公开素材</span>
          </div>
          <p className="homepage-editor__page-settings-hint">
            每个当前可见素材均需填写可追溯来源与授权编号；同一地址在页面内重复使用时只记录一次。记录仅供后台发布审计，不随公开页面接口返回。
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
                  素材来源<em>必填</em>
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
                  授权编号 / 存档编号<em>必填</em>
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
