import { createPortal } from "react-dom";
import { useLayoutEffect, useState } from "react";
import InspectorPrimaryTabs, {
  type InspectorPrimaryMode,
} from "./InspectorPrimaryTabs";

interface InspectorModePortalProps {
  activeMode: InspectorPrimaryMode;
  designDisabled?: boolean;
  onChange: (mode: InspectorPrimaryMode) => void;
}

/**
 * 内容/模板属于整台编辑器的工作模式，统一挂到全局工具栏，
 * 属性面板只消费当前模式，不再重复展示模式导航。
 */
export default function InspectorModePortal({
  activeMode,
  designDisabled = false,
  onChange,
}: InspectorModePortalProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [mountRevision, setMountRevision] = useState(0);

  useLayoutEffect(() => {
    const resolveHost = () => {
      const nextHost = document.getElementById("homepage-editor-mode-slot");
      setHost((currentHost) => currentHost === nextHost ? currentHost : nextHost);
      // 工具栏与属性面板属于同一个 React 根；工具栏重渲染时可能清空
      // 外部 portal 子节点。检测到已存在的挂载点变空后，强制重新挂载。
      if (nextHost && nextHost.childElementCount === 0) {
        setMountRevision((revision) => revision + 1);
      }
    };
    resolveHost();
    const observer = new MutationObserver(resolveHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host) return null;

  return createPortal(
    <InspectorPrimaryTabs
      key={mountRevision}
      activeMode={activeMode}
      designDisabled={designDisabled}
      onChange={onChange}
    />,
    host,
  );
}
