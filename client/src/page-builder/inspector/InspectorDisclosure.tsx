import { RightOutlined } from "@ant-design/icons";
import { useId, useState, type ReactNode } from "react";

interface InspectorDisclosureProps {
  label: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

/** 可测试的紧凑渐进披露；按钮显式暴露 aria-expanded / aria-controls。 */
export default function InspectorDisclosure({
  label,
  children,
  className = "",
  defaultOpen = false,
}: InspectorDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={`homepage-editor__inspector-disclosure${className ? ` ${className}` : ""}`}
      data-inspector-disclosure={label}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <RightOutlined aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
