import type { ReactNode } from "react";

export default function InspectorFieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="homepage-editor__inspector-field-group" role="group" aria-label={label}>
      <strong>{label}</strong>
      {children}
    </div>
  );
}
