/**
 * PageSettingsDrawer.tsx — 页面 SEO 设置抽屉。
 * 编辑 seoTitle / seoDescription / ogImage，写入页面 metadata。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useEffect, useState } from "react";
import { Button, Drawer, Input } from "antd";
import MediaPickerField from "@/page-builder/fields/MediaPickerField";

export default function PageSettingsDrawer({
  open,
  metadata,
  onClose,
  onSave,
}: {
  open: boolean;
  metadata: Record<string, any>;
  onClose: () => void;
  onSave: (next: {
    seoTitle?: string;
    seoDescription?: string;
    ogImage?: string;
  }) => void;
}) {
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");

  useEffect(() => {
    if (open) {
      setSeoTitle(metadata?.seoTitle || "");
      setSeoDescription(metadata?.seoDescription || "");
      setOgImage(metadata?.ogImage || "");
    }
  }, [open, metadata]);

  return (
    <Drawer
      title="页面 SEO 设置"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      extra={
        <Button
          type="primary"
          size="small"
          onClick={() =>
            onSave({
              seoTitle: seoTitle.trim(),
              seoDescription: seoDescription.trim(),
              ogImage: ogImage.trim(),
            })
          }
        >
          保存
        </Button>
      }
    >
      <div className="homepage-editor__page-settings">
        <p className="homepage-editor__page-settings-hint">
          设置首页的搜索标题与描述，影响搜索引擎收录与微信 /
          微博等社交分享卡片。留空则沿用「店铺资料」里的站点级默认值。
        </p>
        <label className="homepage-editor__page-settings-label">
          页面标题（建议 ≤ 30 字）
        </label>
        <Input
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder="例：海川珠宝 · 足金匠心系列官方旗舰店"
          maxLength={60}
          showCount
        />
        <label className="homepage-editor__page-settings-label">
          页面描述（建议 ≤ 80 字）
        </label>
        <Input.TextArea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          placeholder="例：海川珠宝精选足金、K金、钻石作品，提供在线选款与一对一顾问定制服务。"
          maxLength={160}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
        <label className="homepage-editor__page-settings-label">
          社交分享图（og:image）
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
          1200×630。留空则使用页面中的第一张图片。
        </p>
        <p
          className="homepage-editor__page-settings-hint"
          style={{ marginTop: 12, color: "#B8944E" }}
        >
          保存后仅写入草稿，需点击顶部「发布」才会更新前台页面。
        </p>
      </div>
    </Drawer>
  );
}
