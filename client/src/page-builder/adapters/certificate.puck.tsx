/**
 * certificate.puck.ts — 资质证书的 Puck 适配器（证书数组字段）
 */

import CertificateBlock from "@/components/blocks/CertificateBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CertificateItem {
  name: string;
  desc: string;
  imageUrl: string;
  focusX?: number;
  focusY?: number;
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
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CertificatePuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
