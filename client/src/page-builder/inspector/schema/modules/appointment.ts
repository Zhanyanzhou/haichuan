/**
 * schema/modules/appointment.ts — 「预约入口」编辑区 Schema。
 * Conversion 母版:21:6 定比背景,1 主 CTA + 可选电话,双端焦点。
 */
import {
  APPOINTMENT_CONTRACT,
  evaluateAppointmentContract,
} from "../../../config/blockContracts";
import { IMAGE_SPECS } from "../../../config/imageSpecs";
import { appointmentPuckConfig } from "../../../adapters/appointment.puck";
import { moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const appointmentSchema: ModuleInspectorSchema = {
  moduleType: "预约入口",
  displayName: "预约入口",
  purpose: APPOINTMENT_CONTRACT.purpose,
  evaluate: evaluateAppointmentContract,
  defaults: { ...appointmentPuckConfig.defaultProps },
  sections: [
    {
      id: "appointment-content",
      title: "内容",
      layer: "content",
      fields: [
        moduleNameField("预约入口"),
        {
          key: "title",
          label: "主标题",
          control: "text",
          required: true,
          maxLength: APPOINTMENT_CONTRACT.content.limits.title,
          placeholder: "如 预约鉴赏",
        },
        {
          key: "subtitle",
          label: "副标题",
          control: "text",
          maxLength: APPOINTMENT_CONTRACT.content.limits.subtitle,
          hint: "服务方式或响应时间，≤2 行",
          placeholder: "如 一对一珠宝顾问，为您安排专属服务",
        },
      ],
    },
    {
      id: "appointment-action",
      title: "行动与关联",
      layer: "interaction",
      fields: [
        {
          key: "buttonText",
          label: "主按钮文字",
          control: "text",
          required: true,
          maxLength: APPOINTMENT_CONTRACT.content.limits.buttonText,
          placeholder: "如 立即预约",
        },
        {
          key: "linkUrl",
          label: "主按钮链接",
          control: "select",
          options: [
            { label: "预约咨询页 /contact", value: "/contact" },
            { label: "珠宝定制 /custom", value: "/custom" },
          ],
        },
        {
          key: "phone",
          label: "咨询电话（可选）",
          control: "text",
          maxLength: APPOINTMENT_CONTRACT.content.limits.phone,
          hint: "留空只显示主按钮",
        },
      ],
    },
    {
      id: "appointment-media",
      title: "媒体",
      layer: "media",
      description: "桌面 21:6 背景带（留空用纯色）；手机 4:3 独立裁切",
      fields: [
        {
          key: "backgroundImage",
          label: "背景图（可选）",
          control: "media",
          spec: IMAGE_SPECS.fullBleed.desktop,
          focusKeys: { x: "desktopFocusX", y: "desktopFocusY" },
          placeholder: "上传背景图（21:6）",
          showSpecCheck: true,
        },
        {
          key: "altText",
          label: "背景图替代文字",
          control: "text",
          maxLength: APPOINTMENT_CONTRACT.content.limits.altText,
        },
      ],
    },
    {
      id: "appointment-style",
      title: "样式",
      layer: "style",
      fields: [
        {
          key: "tone",
          label: "视觉预设",
          control: "segmented",
          options: [
            { label: "深色典藏", value: "dark" },
            { label: "象牙留白", value: "ivory" },
          ],
        },
      ],
    },
    {
      id: "appointment-advanced",
      title: "高级设置",
      layer: "style",
      description: "手机端按 4:3 独立裁切；焦点为百分比坐标",
      fields: [
        { key: "mobileFocusX", label: "移动焦点 X (%)", control: "text" },
        { key: "mobileFocusY", label: "移动焦点 Y (%)", control: "text" },
        { key: "bgColor", label: "自定义背景色", control: "color" },
      ],
    },
  ],
};
