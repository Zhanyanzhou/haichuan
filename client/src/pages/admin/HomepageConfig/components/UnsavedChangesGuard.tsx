/**
 * UnsavedChangesGuard.tsx — SPA 路由级未保存拦截（2026-08-16 批次 D）。
 * 依赖数据路由（createBrowserRouter，见 main.tsx），声明式 BrowserRouter 下 useBlocker 不可用。
 * 三选项：保存并离开（主）/ 直接离开（放弃修改）/ 继续编辑。
 * 仅拦截 pathname 变化（编辑器状态按路径隔离，search 变化无需拦截）。
 */
import { Button, Modal, message } from "antd";
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
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      !disabled &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  if (blocker.state !== "blocked") return messageContext;

  const handleSaveAndLeave = async () => {
    const ok = await onSaveAndLeave();
    if (ok) {
      blocker.proceed();
    } else {
      messageApi.error("修改未保存，已留在当前页面");
      blocker.reset();
    }
  };

  return (
    <>
      {messageContext}
      <Modal
        open
        rootClassName={rootClassName}
        title="有未保存的修改"
        onCancel={blocker.reset}
        footer={[
          <Button key="discard" type="text" danger className="unsaved-guard__discard" onClick={blocker.proceed} style={{ marginRight: "auto" }}>
            直接离开（放弃修改）
          </Button>,
          <Button key="cancel" onClick={blocker.reset}>继续编辑</Button>,
          <Button key="save" type="primary" onClick={() => void handleSaveAndLeave()}>保存并离开</Button>,
        ]}
      >
        离开前是否保存{subject}的修改？直接离开将丢失未保存的修改。
      </Modal>
    </>
  );
}
