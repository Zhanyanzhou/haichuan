/**
 * UnsavedChangesGuard.tsx — SPA 路由级未保存拦截（2026-08-16 批次 D）。
 * 依赖数据路由（createBrowserRouter，见 main.tsx），声明式 BrowserRouter 下 useBlocker 不可用。
 * 三个直接选项：保存并离开（主）/ 放弃修改 / 继续编辑。
 * 仅拦截 pathname 变化（编辑器状态按路径隔离，search 变化无需拦截）。
 */
import { Button, Modal, message } from "antd";
import { useState } from "react";
import { useBlocker } from "react-router-dom";

interface UnsavedChangesGuardProps {
  /** 是否存在未保存修改 */
  hasUnsavedChanges: boolean;
  /** 加载中/加载失败时不拦截（此时"未保存"是归一化噪音） */
  disabled?: boolean;
  /** 保存当前草稿；返回是否成功（失败则留在当前页） */
  onSaveAndLeave: () => Promise<boolean>;
  /** 弹窗中说明正在编辑的对象，避免复用时出现错误业务文案 */
  subject?: string;
  /** 供具体编辑器校准弹窗视觉，不改变共享默认主题 */
  rootClassName?: string;
}

export default function UnsavedChangesGuard({
  hasUnsavedChanges,
  disabled,
  onSaveAndLeave,
  subject = "当前页面",
  rootClassName,
}: UnsavedChangesGuardProps) {
  const [messageApi, messageContext] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      !disabled &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  if (blocker.state !== "blocked") return messageContext;

  const handleSaveAndLeave = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSaveAndLeave();
    if (ok) {
      blocker.proceed();
    } else {
      messageApi.error("修改未保存，已留在当前页面");
      blocker.reset();
    }
    setSaving(false);
  };

  const handleDiscardAndLeave = () => {
    if (saving) return;
    blocker.proceed();
  };

  return (
    <>
      {messageContext}
      <Modal
        open
        rootClassName={rootClassName}
        title="离开当前编辑？"
        closable={!saving}
        maskClosable={false}
        onCancel={blocker.reset}
        footer={[
          <Button key="continue" disabled={saving} onClick={blocker.reset}>
            继续编辑
          </Button>,
          <Button key="discard" danger disabled={saving} onClick={handleDiscardAndLeave}>
            放弃修改
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => void handleSaveAndLeave()}>
            保存并离开
          </Button>,
        ]}
      >
        {subject}有未保存修改。你可以先保存，也可以放弃这些修改后离开；保存失败会留在当前页面。
      </Modal>
    </>
  );
}
