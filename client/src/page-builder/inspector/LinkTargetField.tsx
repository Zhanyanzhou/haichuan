import ProductIdsField from "@/page-builder/fields/ProductIdsField";
import { editorPages } from "@/page-builder/config/editorPages";
import {
  normalizeLinkTargetType,
  type LinkTargetType,
  type LinkTargetValue,
} from "@/page-builder/utils/linkTarget";

interface LinkTargetFieldProps extends LinkTargetValue {
  id: string;
  onChange: (patch: Partial<LinkTargetValue>) => void;
  label?: string;
  description?: string;
}

export default function LinkTargetField({
  id,
  targetType,
  productId,
  linkUrl,
  onChange,
  label = "点击后跳转",
  description = "一个模板只设置一个明确去向，避免多个入口分散注意力。",
}: LinkTargetFieldProps) {
  const normalizedTargetType = normalizeLinkTargetType({ targetType, productId, linkUrl });
  const normalizedProductId = Number(productId) || 0;

  const updateTargetType = (nextTargetType: LinkTargetType) => {
    onChange({ targetType: nextTargetType });
  };

  return (
    <>
      <div className="homepage-editor__inspector-option-group">
        <div><strong>{label}</strong><span>{description}</span></div>
        <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label={label}>
          {([[
            "none", "不跳转",
          ], [
            "product", "商品详情",
          ], [
            "page", "站内页面",
          ]] as const).map(([value, text]) => (
            <button
              key={value}
              type="button"
              className={normalizedTargetType === value ? "is-active" : ""}
              aria-pressed={normalizedTargetType === value}
              onClick={() => updateTargetType(value)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {normalizedTargetType === "product" ? (
        <div className="homepage-editor__inspector-field">
          <label>关联商品 <em>必填</em></label>
          <ProductIdsField
            value={normalizedProductId > 0 ? [normalizedProductId] : []}
            onChange={(ids) => onChange({ productId: Number(ids[0]) || 0 })}
            maxProducts={1}
          />
        </div>
      ) : null}

      {normalizedTargetType === "page" ? (
        <div className="homepage-editor__inspector-field">
          <label htmlFor={`link-target-page-${id}`}>站内页面 <em>必填</em></label>
          <select
            id={`link-target-page-${id}`}
            value={linkUrl || ""}
            onChange={(event) => onChange({ linkUrl: event.target.value })}
          >
            <option value="" disabled>请选择页面</option>
            {editorPages.map((page) => (
              <option key={page.key} value={page.publicPath}>{page.label}</option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}
