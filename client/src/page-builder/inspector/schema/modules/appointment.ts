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
import { ADVANCED_BG_COLOR_FIELD, bgColorPresetField, moduleNameField } from "../shared";
import type { ModuleInspectorSchema } from "../types";

export const appointmentSchema: ModuleInspectorSchema = {
  moduleType: "预约入口",
  displayName: "预约入口",
  purpose: APPOINTMENT_CONTRACT.purpose,
  evaluate: evaluateAppointmentContract,
  defaults: { ...appointmentPuckConfig.defaultProps },
  sections: [
    {
      id: "appointment-media",
      title: "媒体",
      layer: "media",
      description: "桌面超宽背景带（留空用纯色）；手机独立裁切",
      fields: [
        {
          key: "backgroundImage",
          label: "背景图（可选）",
          control: "media",
          spec: IMAGE_SPECS.booking.bgImage,
          focusKeys: { x: "desktopFocusX", y: "desktopFocusY" },
          placeholder: "上传背景图，留空用纯色",
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
          key: "linkTarget",
          label: "主按钮点击后",
          control: "linkTarget",
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
      id: "appointment-style",
      title: "样式",
      layer: "style",
      fields: [
        bgColorPresetField(),
        ADVANCED_BG_COLOR_FIELD,
      ],
    },
  ],
};
