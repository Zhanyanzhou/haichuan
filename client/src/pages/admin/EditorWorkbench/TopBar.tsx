/**
 * TopBar.tsx — 沉浸式编辑器顶栏
 */
import { useState } from "react";
import { Button, Select, Space, message, Modal } from "antd";
import {
  EyeOutlined,
  SaveOutlined,
  SendOutlined,
  UndoOutlined,
  RedoOutlined,
  DesktopOutlined,
  TabletOutlined,
  MobileOutlined,
} from "@ant-design/icons";
import { useEditorStore } from "./editorStore";
import { pageDocumentApi } from "@/services/api";

type DeviceMode = "desktop" | "tablet" | "mobile";

const DEVICE_ICONS: Record<DeviceMode, React.ReactNode> = {
  desktop: <DesktopOutlined />,
  tablet: <TabletOutlined />,
  mobile: <MobileOutlined />,
};

interface TopBarProps {
  device: DeviceMode;
  onDeviceChange: (d: DeviceMode) => void;
}

export default function TopBar({ device, onDeviceChange }: TopBarProps) {
  const pageData = useEditorStore((s) => s.pageData);
  const lastSaved = useEditorStore((s) => s.lastSaved);
  const setLastSaved = useEditorStore((s) => s.setLastSaved);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const saveDraft = async () => {
    await pageDocumentApi.save({
      pageKey: "home",
      puckData: pageData,
      editorVersion: "0.22.4",
    });
    setLastSaved(
      new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDraft();
      message.success("草稿已保存");
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = () => {
    Modal.confirm({
      title: "确认发布上线",
      content: "发布后前台网站将立即更新为当前编辑内容。确认发布？",
      okText: "确认发布",
      cancelText: "再检查一下",
      onOk: async () => {
        setPublishing(true);
        try {
          // 先保存当前画布，再由服务端创建可回退的已发布快照。
          await saveDraft();
          await pageDocumentApi.publish("home");
          message.success("已发布上线！");
        } catch {
          message.error("发布失败");
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  return (
    <div className="flex items-center justify-between h-11 px-3 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center gap-3">
        <Select
          size="small"
          value="home"
          style={{ width: 120 }}
          options={[{ value: "home", label: "店铺首页" }]}
        />
        <span className="text-xs text-gray-400">
          当前页面：<b className="text-gray-600">店铺首页</b>
        </span>
        {lastSaved && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-400">上次保存：{lastSaved}</span>
          </>
        )}
      </div>
      <Space size={0}>
        {(["desktop", "tablet", "mobile"] as DeviceMode[]).map((d) => (
          <Button
            key={d}
            size="small"
            type={device === d ? "primary" : "text"}
            icon={DEVICE_ICONS[d]}
            onClick={() => onDeviceChange(d)}
          />
        ))}
      </Space>
      <div className="flex items-center gap-2">
        <Button size="small" type="text" icon={<UndoOutlined />} disabled />
        <Button size="small" type="text" icon={<RedoOutlined />} disabled />
        <span className="text-gray-300">|</span>
        <Button
          size="small"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
        >
          保存草稿
        </Button>
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => window.open("/", "_blank")}
        >
          预览
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          loading={publishing}
          onClick={handlePublish}
        >
          发布上线
        </Button>
      </div>
    </div>
  );
}
