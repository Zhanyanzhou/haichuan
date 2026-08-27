/**
 * certificate.puck.ts — 资质证书的 Puck 适配器（证书数组字段）
 */

import CertificateBlock from "@/components/blocks/CertificateBlock";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CertificateItem {
  name: string;
  desc: string;
  imageUrl: string;
  verificationConfirmed: boolean;
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
    <CertificateBlock module={convertPuckProps("资质证书", props)!} />
  ),
  defaultProps: {
    title: "证书信息待确认",
    subtitle: "请填写并上传已经核验的真实证书信息。",
    certificates: [
      { name: "证书一待确认", desc: "请填写经核验的证书名称与说明。", imageUrl: "", verificationConfirmed: false },
      { name: "证书二待确认", desc: "请填写经核验的证书名称与说明。", imageUrl: "", verificationConfirmed: false },
      { name: "证书三待确认", desc: "请填写经核验的证书名称与说明。", imageUrl: "", verificationConfirmed: false },
    ],
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CertificatePuckProps,
  resolvePermissions: (data: { props?: CertificatePuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
