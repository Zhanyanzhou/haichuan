/**
 * schema/modules/video.ts — 「视频区块(品牌影片)」编辑区 Schema。
 * Cinematic Hero 母版(视频变体):16:9 / 16:7 / 3:4 规范比例。
 */
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { videoPuckConfig } from "../../../adapters/video.puck";
import { moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const videoSchema: ModuleInspectorSchema = {
  moduleType: "视频区块",
  displayName: "品牌影片",
  purpose: "以动态影像呈现工艺细节与品牌质感，画面比例仅允许规范比例。",
  defaults: { ...videoPuckConfig.defaultProps },
  sections: [
    {
      id: "video-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("品牌影片"),
        {
          key: "videoUrl",
          label: "视频地址",
          control: "text",
          required: true,
          hint: "支持 /uploads/ 视频或 https 链接",
          placeholder: "输入视频地址",
        },
      ],
    },
    {
      id: "video-media",
      title: "媒体",
      layer: "media",
      fields: [
        {
          key: "posterUrl",
          label: "封面图",
          control: "media",
          spec: IMAGE_SPECS.video.poster,
          hint: "未播放时显示的封面",
          placeholder: "上传视频封面（16:9）",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "video-layout",
      title: "布局",
      layer: "layout",
      fields: [
        {
          key: "aspectRatio",
          label: "画面比例",
          control: "segmented",
          options: [
            { label: "16:9 横屏", value: "16:9" },
            { label: "16:7 宽幕", value: "16:7" },
            { label: "3:4 竖屏", value: "3:4" },
          ],
        },
      ],
    },
    {
      id: "video-advanced",
      title: "高级设置",
      layer: "style",
      collapsible: true,
      defaultCollapsed: true,
      fields: [
        { key: "autoPlay", label: "自动播放", control: "switch" },
        { key: "loop", label: "循环播放", control: "switch" },
        { key: "muted", label: "静音", control: "switch" },
        { key: "showControls", label: "显示播放控件", control: "switch" },
      ],
    },
  ],
};
