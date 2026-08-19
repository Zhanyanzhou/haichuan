/**
 * schema/modules/video.ts — 「视频区块(视频)」编辑区 Schema。
 * Cinematic Hero 母版(视频变体):比例选项由契约派生(横屏 16:9 / 宽幕 21:6;移动端另有全屏竖版 9:16)。
 */
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { videoPuckConfig } from "../../../adapters/video.puck";
import { linkTargetField, moduleNameField, ratioField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

/** 契约锁定为单一比例时,布局区自动消失 */
const videoRatioControl = ratioField("video", "coverImage");

export const videoSchema: ModuleInspectorSchema = {
  moduleType: "视频区块",
  displayName: "视频",
  purpose: "以动态影像呈现工艺细节与品牌质感，画面比例仅允许规范比例。",
  defaults: { ...videoPuckConfig.defaultProps },
  groupTitles: { media: "视频素材" },
  sections: [
    {
      id: "video-media",
      title: "媒体",
      layer: "media",
      fields: [
        {
          key: "videoUrl",
          label: "视频文件",
          control: "video",
          required: true,
        },
        {
          key: "posterUrl",
          label: "封面图",
          control: "media",
          spec: IMAGE_SPECS.video.poster,
          focusKeys: { x: "focusX", y: "focusY" },
          hint: "未播放时显示的封面（可选，留空直接显示视频首帧）",
          placeholder: "上传视频封面（可选）",
          showSpecCheck: true,
        },
      ],
    },
    {
      id: "video-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("视频"),
        {
          key: "title",
          label: "标题",
          control: "text",
          maxLength: 24,
          hint: "叠加在画面上的标题，留空不显示",
          placeholder: "如 匠心铸金",
        },
        {
          key: "subtitle",
          label: "说明",
          control: "text",
          maxLength: 60,
          hint: "留空不显示",
          placeholder: "如 每一道錾刻，都是时间的手迹",
        },
      ],
    },
    {
      id: "video-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "actionText",
          label: "行动入口文字",
          control: "text",
          maxLength: 12,
          hint: "留空不显示",
          placeholder: "如 观看完整影片",
        },
        linkTargetField("行动入口点击后"),
      ],
    },
    ...(videoRatioControl
      ? [
          {
            id: "video-layout",
            title: "布局",
            layer: "layout" as const,
            fields: [videoRatioControl],
          },
        ]
      : []),
    {
      id: "video-advanced",
      title: "模板专属功能",
      layer: "feature",
      fields: [
        { key: "autoPlay", label: "自动播放", control: "switch" },
        { key: "loop", label: "循环播放", control: "switch" },
        { key: "muted", label: "静音", control: "switch" },
        { key: "showControls", label: "显示播放控件", control: "switch" },
      ],
    },
  ],
};
