import "./ProductReferencesField.css";

export const referencePickerModalProps = {
  width: 1120,
  centered: true,
  maskClosable: false,
  wrapClassName: "homepage-editor__product-picker-modal",
  cancelButtonProps: { size: "large" },
} as const;

export const singleReferencePickerModalProps = {
  ...referencePickerModalProps,
  wrapClassName: `${referencePickerModalProps.wrapClassName} is-single-reference-picker`,
} as const;
