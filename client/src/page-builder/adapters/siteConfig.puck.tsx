/**
 * siteConfig.puck.ts — 网站全局设置 Puck 适配器
 *
 * 不替代已有的 SiteContent 管理页面或 PublicLayout 导航逻辑。
 * 在 Puck 画布中以“虚拟区块”形式展示当前网站设置摘要，
 * 点击后可跳转到「店铺资料」页面进行详细编辑。
 *
 * 未来阶段可扩展为直接编辑 Logo、导航链接等属性。
 */

import { Alert, Button } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

export interface SiteConfigPuckProps {
  /** 是否在画布中显示（默认 true） */
  visible?: boolean;
}

function SiteConfigPreview(_props: SiteConfigPuckProps) {
  const navigate = useNavigate();

  return (
    <section
      style={{
        padding: "48px 0",
        background: "#F4F5F5",
        borderTop: "1px solid #DDE1E2",
        borderBottom: "1px solid #DDE1E2",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 clamp(20px, 4vw, 60px)",
        }}
      >
        <Alert
          type="info"
          showIcon
          message="网站全局设置"
          description={
            <span>
              页眉品牌标识、导航菜单、页脚联系方式等由「店铺资料」统一管理。
              修改后前台所有页面同步更新。
            </span>
          }
          action={
            <Button
              size="small"
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => navigate("/admin/site-content")}
              style={{ background: "#181A1B", borderColor: "#181A1B" }}
            >
              编辑店铺资料
            </Button>
          }
          style={{
            border: "1px solid #DDE1E2",
            borderRadius: 6,
            background: "#FFFFFF",
          }}
        />
      </div>
    </section>
  );
}

export const siteConfigPuckConfig = {
  render: (props: SiteConfigPuckProps) => <SiteConfigPreview {...props} />,
  defaultProps: {
    visible: true,
  } satisfies SiteConfigPuckProps,
};
