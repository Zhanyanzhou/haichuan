/**
 * certificate.puck.ts — 资质证书的 Puck 适配器（证书数组字段）
 */

import CertificateBlock from "@/components/blocks/CertificateBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";
import { colorPuckField } from "../fields/ColorField";
import MediaPickerField from "../fields/MediaPickerField";

export interface CertificateItem {
  name: string;
  desc: string;
  imageUrl: string;
}

export interface CertificatePuckProps {
  title: string;
  subtitle: string;
  certificates: CertificateItem[];
  bgColor: string;
  locked?: boolean;
}

export const certificatePuckConfig = {
  render: (props: CertificatePuckProps) => (
    <CertificateBlock module={convertPuckProps("资质证书", props as any) as any} />
  ),
  defaultProps: {
    title: "权威认证",
    subtitle: "每件作品均附权威检测证书",
    certificates: [
      { name: "国检证书", desc: "NGTC 国家珠宝玉石质量监督检验中心", imageUrl: "" },
      { name: "IGI 国际证书", desc: "国际宝石学院认证", imageUrl: "" },
      { name: "足金 999", desc: "材质成色权威检测", imageUrl: "" },
    ],
    bgColor: "#FBF9F6",
    locked: false,
  } satisfies CertificatePuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    certificates: {
      type: "array" as const,
      label: "证书列表",
      arrayFields: {
        name: { type: "text" as const, label: "证书名称" },
        desc: { type: "textarea" as const, label: "说明" },
        imageUrl: {
          type: "custom" as const,
          label: "证书图",
          render: ({
            value, onChange, readOnly,
          }: { value?: string; onChange: (v: string) => void; readOnly?: boolean }) => (
            <MediaPickerField fieldKey="imageUrl" device="shared" value={value} onChange={onChange} readOnly={readOnly}
              spec={{ width: 200, height: 200, ratio: "1:1", label: "证书图（建议 200×200）" }}
              placeholder="上传证书图（可选）" />
          ),
        },
      },
    } as any,
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
