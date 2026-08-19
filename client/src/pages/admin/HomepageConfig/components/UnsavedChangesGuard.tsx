/**
 * UnsavedChangesGuard.tsx — SPA 路由级未保存拦截（2026-08-16 批次 D）。
 * 依赖数据路由（createBrowserRouter，见 main.tsx），声明式 BrowserRouter 下 useBlocker 不可用。
 * 三选项：保存并离开（主）/ 直接离开（放弃修改）/ 继续编辑。
 * 仅拦截 pathname 变化（编辑器状态按路径隔离，search 变化无需拦截）。
 */
import { Modal, message } from "antd";
import { useBlocker } from "react-router-dom";

interface UnsavedChangesGuardProps {
  /** 是否存在未保存修改 */
  hasUnsavedChanges: boolean;
  /** 加载中/加载失败时不拦截（此时"未保存"是归一化噪音） */
  disabled?: boolean;
  /** 保存当前草稿；返回是否成功（失败则留在当前页） */
  onSaveAndLeave: () => Promise<boolean>;
}

export default function UnsavedChangesGuard({
  hasUnsavedChanges,
  disabled,
  onSaveAndLeave,
}: UnsavedChangesGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      !disabled &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  if (blocker.state !== "blocked") return null;

  const handleSaveAndLeave = async () => {
    const ok = await onSaveAndLeave();
    if (ok) {
      blocker.proceed();
    } else {
      message.error("草稿保存失败，已留在当前页面");
      blocker.reset();
    }
  };

  return (
    <Modal
      open
      title="有未保存的修改"
      okText="保存并离开"
      cancelText="继续编辑"
      onOk={handleSaveAndLeave}
      onCancel={blocker.reset}
      footer={[
        <button
          key="discard"
          type="button"
          className="unsaved-guard__discard"
          onClick={blocker.proceed}
          style={{
            border: 0,
            background: "transparent",
            color: "var(--adm-error)",
            cursor: "pointer",
            fontSize: 13,
            marginRight: "auto",
            padding: "4px 8px",
          }}
        >
          直接离开（放弃修改）
        </button>,
        <button
          key="cancel"
          type="button"
          onClick={blocker.reset}
          style={{
            border: "1px solid #E3DDD4",
            borderRadius: 4,
            background: "#FFF",
            padding: "5px 14px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          继续编辑
        </button>,
        <button
          key="save"
          type="button"
          onClick={() => void handleSaveAndLeave()}
          style={{
            border: 0,
            borderRadius: 4,
            background: "var(--adm-action)",
            color: "var(--ed-on-accent)",
            padding: "5px 14px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          保存并离开
        </button>,
      ]}
    >
      离开前是否保存当前页面的装修草稿？直接离开将丢失未保存的修改。
    </Modal>
  );
}
