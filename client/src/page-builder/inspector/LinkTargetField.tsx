import ProductIdsField from "@/page-builder/fields/ProductIdsField";
import { editorPages } from "@/page-builder/config/editorPages";
import {
  isSafeInternalPath,
  normalizeLinkTargetType,
  type LinkTargetType,
  type LinkTargetValue,
} from "@/page-builder/utils/linkTarget";

interface LinkTargetFieldProps extends LinkTargetValue {
  id: string;
  onChange: (patch: Record<string, string | number>) => void;
  label?: string;
  description?: string;
  /** 条目内嵌的紧凑形态:省略标题与说明行 */
  compact?: boolean;
  /**
   * 属性键前缀:patch 键按 `${prefix}TargetType/...` 生成。
   * 缺省写 targetType/productId/linkUrl。
   */
  keyPrefix?: string;
}

/**
 * 链接字段(紧凑一行式,2026-08-18 P1-3 统一形态):
 * 分段「不跳转 | 商品 | 页面」+ 行内对应选择器。
 * 页面态用 datalist —— 可选导航页,也可手输任意站内路径(拒绝外链)。
 * compact 供 arrayFields 条目内嵌;keyPrefix 供同模块第二链接(如次按钮)。
 */
export default function LinkTargetField({
  id,
  targetType,
  productId,
  linkUrl,
  onChange,
  label = "点击后跳转",
  description = "一个模块只设置一个明确去向，避免多个入口分散注意力。",
  compact = false,
  keyPrefix = "",
}: LinkTargetFieldProps) {
  const normalizedTargetType = normalizeLinkTargetType({ targetType, productId, linkUrl });
  const normalizedProductId = Number(productId) || 0;
  // 前缀键遵循 camelCase:targetType / secondaryTargetType。
  // 无前缀时仅首字母小写(TargetType→targetType),不能整词 toLowerCase——
  // 否则写入 targettype 键,渲染端/发布校验读驼峰键会静默失联(2026-08-18 实测抓出)。
  const key = (suffix: "TargetType" | "ProductId" | "LinkUrl") =>
    keyPrefix
      ? `${keyPrefix}${suffix}`
      : suffix.charAt(0).toLowerCase() + suffix.slice(1);

  const updateTargetType = (nextTargetType: LinkTargetType) => {
    // 切换类型时清掉残留,保证三件套状态完整:
    // 服务端发布校验要求 none 不留 linkUrl/productId(否则无法通过发布)。
    const patch: Record<string, string | number> = {
      [key("TargetType")]: nextTargetType,
    };
    if (nextTargetType === "none") {
      patch[key("ProductId")] = 0;
      patch[key("LinkUrl")] = "";
    } else if (nextTargetType === "product") {
      patch[key("LinkUrl")] = "";
    } else {
      patch[key("ProductId")] = 0;
    }
    onChange(patch);
  };

  const pathInvalid =
    normalizedTargetType === "page" &&
    typeof linkUrl === "string" &&
    linkUrl.length > 0 &&
    !isSafeInternalPath(linkUrl);

  return (
    <>
      {!compact ? (
        <div className="homepage-editor__inspector-option-group">
          <div><strong>{label}</strong><span>{description}</span></div>
        </div>
      ) : null}

      <div className={`homepage-editor__inspector-segmented is-three${compact ? " is-compact" : ""}`} role="group" aria-label={label}>
        {([[
          "none", "不跳转",
        ], [
          "product", "商品",
        ], [
          "page", "页面",
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

      {normalizedTargetType === "product" ? (
        <div className="homepage-editor__inspector-field">
          <label>关联商品 <em>必填</em></label>
          <ProductIdsField
            value={normalizedProductId > 0 ? [normalizedProductId] : []}
            onChange={(ids) => onChange({ [key("ProductId")]: Number(ids[0]) || 0 })}
            maxProducts={1}
          />
        </div>
      ) : null}

      {normalizedTargetType === "page" ? (
        <div className="homepage-editor__inspector-field">
          <label htmlFor={`link-target-page-${id}`}>
            站内页面 <em>必填</em>
          </label>
          <input
            id={`link-target-page-${id}`}
            list={`link-target-pages-${id}`}
            value={linkUrl || ""}
            onChange={(event) => onChange({ [key("LinkUrl")]: event.target.value })}
            placeholder="选择页面或输入 / 开头的站内路径"
            autoComplete="off"
            aria-invalid={pathInvalid}
          />
          <datalist id={`link-target-pages-${id}`}>
            {editorPages.map((page) => (
              <option key={page.key} value={page.publicPath}>{page.label}</option>
            ))}
          </datalist>
          {pathInvalid ? (
            <span className="homepage-editor__inspector-hint" role="alert">
              仅支持站内路径（以 / 开头），不开放外部链接。
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
