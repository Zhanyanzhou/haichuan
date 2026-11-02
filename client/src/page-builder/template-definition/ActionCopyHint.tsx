import { describeActionCopy } from "./templateCopyUnits";

export default function ActionCopyHint({
  slotType,
  label,
}: {
  slotType: "button" | "link";
  label: string;
}) {
  const copy = describeActionCopy(slotType, label);
  return (
    <p
      className="homepage-editor__properties-hint"
      role={copy.review ? "status" : undefined}
      data-template-copy-guidance={slotType}
    >
      {copy.hint}
    </p>
  );
}
