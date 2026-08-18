/**
 * siteConfig.ts — 网站全局设置(系统区块)的编辑面板 Schema。
 *
 * 不替代「店铺资料」管理页:面板只提供管理入口跳转与画布显示开关。
 * systemBlock 标记让面板隐藏删除/隐藏模块/恢复默认等动作。
 */
import { Alert, Button } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { siteConfigPuckConfig } from "../../../adapters/siteConfig.puck";
import type { ModuleInspectorSchema } from "../types";

function SiteConfigJumpCard() {
  const navigate = useNavigate();
  return (
    <Alert
      type="info"
      showIcon
      message="由「店铺资料」统一管理"
      description="页眉品牌标识、导航菜单、页脚联系方式等修改后，前台所有页面同步更新。"
      action={
        <Button
          size="small"
          type="primary"
          icon={<SettingOutlined />}
          onClick={() => navigate("/admin/site-content")}
        >
          编辑店铺资料
        </Button>
      }
      style={{ borderRadius: 6 }}
    />
  );
}

export const siteConfigSchema: ModuleInspectorSchema = {
  moduleType: "网站全局设置",
  displayName: "网站全局设置",
  purpose: "页眉页脚等全局元素不随单页装修变化，统一在店铺资料中维护。",
  systemBlock: true,
  defaults: siteConfigPuckConfig.defaultProps,
  groupTitles: { feature: "管理入口" },
  sections: [
    {
      id: "site-config-guide",
      title: "管理入口",
      layer: "feature",
      fields: [
        {
          key: "siteConfigJump",
          label: "店铺资料",
          control: "custom",
          render: () => <SiteConfigJumpCard />,
        },
        {
          key: "visible",
          label: "在画布中显示",
          control: "switch",
        },
      ],
    },
  ],
};
