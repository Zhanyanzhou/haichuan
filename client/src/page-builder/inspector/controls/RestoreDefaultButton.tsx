import { Button, type ButtonProps } from "antd";

export default function RestoreDefaultButton({
  label,
  onClick,
  disabled,
  block,
  size = "small",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  block?: boolean;
  size?: ButtonProps["size"];
}) {
  return (
    <Button
      type="default"
      size={size}
      block={block}
      disabled={disabled}
      onClick={onClick}
      data-workspace-field-control="restore-default"
      data-workspace-field-shared="true"
    >
      {label}
    </Button>
  );
}
