import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Radio, Space } from "antd";
import ProductReferencesField from "@/page-builder/fields/ProductReferencesField";
import CategoryReferencesField from "@/page-builder/fields/CategoryReferencesField";
import { singleReferencePickerModalProps } from "@/page-builder/fields/referencePickerModal";
import { editorPages, getEditorPageByPath } from "@/page-builder/config/editorPages";
import {
  isContentTemplatePageTarget,
  normalizeContentTemplatePageTarget,
} from "@/page-builder/generated/contentTemplates.generated";
import {
  normalizeHttpsExternalTarget,
  normalizeLinkTargetType,
  resolveLinkTargetUrl,
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
  /** 商品、分类、站内页面由分段按钮直接打开单选弹窗。 */
  pickerPresentation?: "inline" | "dialog";
  /**
   * 属性键前缀:patch 键按 `${prefix}TargetType/...` 生成。
   * 缺省写 targetType/productId/linkUrl。
   */
  keyPrefix?: string;
}

const publicPageOptions = editorPages.filter((page) => isContentTemplatePageTarget(page.publicPath));

/**
 * 商家视图在弹窗里选择公开页面；其他调用方继续使用支持查询参数的行内路径。
 * compact 供 arrayFields 条目内嵌;keyPrefix 供同模块第二链接(如次按钮)。
 */
export default function LinkTargetField({
  id,
  targetType,
  productCode,
  productId,
  categorySlug,
  linkUrl,
  onChange,
  label = "点击后跳转",
  description = "一个模块只设置一个明确去向，避免多个入口分散注意力。",
  compact = false,
  pickerPresentation = "inline",
  keyPrefix = "",
}: LinkTargetFieldProps) {
  const normalizedTargetType = normalizeLinkTargetType({ targetType, productCode, productId, categorySlug, linkUrl });
  const normalizedProductCode = typeof productCode === "string" ? productCode.trim() : "";
  const normalizedProductId = Number(productId) || 0;
  const normalizedCategorySlug = typeof categorySlug === "string" ? categorySlug.trim() : "";
  const [picker, setPicker] = useState<{ type: "product" | "category" | "page"; open: boolean } | null>(null);
  const [pageDraftPath, setPageDraftPath] = useState("");
  const dialogPicker = pickerPresentation === "dialog";
  const currentPagePath = dialogPicker && normalizedTargetType === "page"
    ? normalizeContentTemplatePageTarget(linkUrl)?.split("?")[0]
    : undefined;
  const currentPage = currentPagePath ? getEditorPageByPath(currentPagePath) : undefined;
  const dialogProductCode = normalizedTargetType === "product" ? normalizedProductCode : "";
  const dialogProductId = normalizedTargetType === "product" && !dialogProductCode ? normalizedProductId : 0;
  const dialogCategorySlug = normalizedTargetType === "category" ? normalizedCategorySlug : "";
  const dialogProductCodes = useMemo(() => dialogProductCode ? [dialogProductCode] : [], [dialogProductCode]);
  const dialogProductIds = useMemo(() => dialogProductId > 0 ? [dialogProductId] : [], [dialogProductId]);
  const dialogCategorySlugs = useMemo(() => dialogCategorySlug ? [dialogCategorySlug] : [], [dialogCategorySlug]);
  const closePicker = () => setPicker((current) => current ? { ...current, open: false } : null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const previousTargetTypeRef = useRef(normalizedTargetType);

  useEffect(() => {
    const previousTargetType = previousTargetTypeRef.current;
    previousTargetTypeRef.current = normalizedTargetType;
    if (
      previousTargetType === normalizedTargetType ||
      normalizedTargetType === "none" ||
      (dialogPicker && normalizedTargetType !== "external")
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const detail = detailRef.current;
      const scrollContainer = detail?.closest<HTMLElement>(
        ".homepage-editor__inspector-scroll",
      );
      if (!detail || !scrollContainer) return;
      const detailRect = detail.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      if (detailRect.bottom > containerRect.bottom - 12) {
        scrollContainer.scrollBy({
          top: detailRect.bottom - containerRect.bottom + 12,
          behavior: "smooth",
        });
      } else if (detailRect.top < containerRect.top + 12) {
        scrollContainer.scrollBy({
          top: detailRect.top - containerRect.top - 12,
          behavior: "smooth",
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dialogPicker, normalizedTargetType]);
  // 前缀键遵循 camelCase:targetType / secondaryTargetType。
  // 无前缀时仅首字母小写(TargetType→targetType),不能整词 toLowerCase——
  // 否则写入 targettype 键,渲染端/发布校验读驼峰键会静默失联(2026-08-18 实测抓出)。
  const key = (suffix: "TargetType" | "ProductCode" | "ProductId" | "CategorySlug" | "LinkUrl") =>
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
      patch[key("ProductCode")] = "";
      patch[key("ProductId")] = 0;
      patch[key("CategorySlug")] = "";
      patch[key("LinkUrl")] = "";
    } else if (nextTargetType === "product") {
      patch[key("CategorySlug")] = "";
      patch[key("LinkUrl")] = "";
    } else if (nextTargetType === "category") {
      patch[key("ProductCode")] = "";
      patch[key("ProductId")] = 0;
      patch[key("LinkUrl")] = "";
    } else {
      patch[key("ProductCode")] = "";
      patch[key("ProductId")] = 0;
      patch[key("CategorySlug")] = "";
      if (dialogPicker) patch[key("LinkUrl")] = "";
    }
    onChange(patch);
  };

  const pathInvalid =
    normalizedTargetType === "page" &&
    !isContentTemplatePageTarget(linkUrl);
  const externalInvalid =
    normalizedTargetType === "external" &&
    !normalizeHttpsExternalTarget(linkUrl);
  const inspectableTarget = dialogPicker && (normalizedTargetType === "page" || normalizedTargetType === "external")
    ? resolveLinkTargetUrl({ targetType: normalizedTargetType, categorySlug, linkUrl })
    : "";

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
          "category", "分类",
        ], [
          "page", "页面",
        ], [
          "external", "外链",
        ]] as const).map(([value, text]) => {
          const opensPicker = dialogPicker && (value === "product" || value === "category" || value === "page");
          return (
            <button
              key={value}
              type="button"
              className={normalizedTargetType === value ? "is-active" : ""}
              aria-pressed={normalizedTargetType === value}
              aria-haspopup={opensPicker ? "dialog" : undefined}
              onClick={() => {
                if (opensPicker) {
                  if (value === "page") setPageDraftPath(currentPagePath ?? "");
                  setPicker({ type: value, open: true });
                } else if (!dialogPicker || value !== normalizedTargetType) {
                  updateTargetType(value);
                }
              }}
            >
              {text}
            </button>
          );
        })}
      </div>

      {dialogPicker && (normalizedTargetType === "product" || picker?.type === "product") ? (
        <ProductReferencesField
          value={dialogProductCodes}
          legacyIds={dialogProductIds}
          onChange={(codes) => {
            if (!codes[0]) return;
            onChange({
              [key("TargetType")]: "product",
              [key("ProductCode")]: codes[0],
              [key("ProductId")]: 0,
              [key("CategorySlug")]: "",
              [key("LinkUrl")]: "",
            });
          }}
          minProducts={1}
          maxProducts={1}
          singlePicker={{
            open: picker?.type === "product" && picker.open,
            onOpen: () => setPicker({ type: "product", open: true }),
            onClose: closePicker,
          }}
        />
      ) : null}

      {dialogPicker && (normalizedTargetType === "category" || picker?.type === "category") ? (
        <CategoryReferencesField
          value={dialogCategorySlugs}
          onChange={(slugs) => {
            if (!slugs[0]) return;
            onChange({
              [key("TargetType")]: "category",
              [key("CategorySlug")]: slugs[0],
              [key("ProductCode")]: "",
              [key("ProductId")]: 0,
              [key("LinkUrl")]: "",
            });
          }}
          minItems={1}
          maxItems={1}
          singlePicker={{ open: picker?.type === "category" && picker.open, onClose: closePicker }}
        />
      ) : null}
      {dialogPicker && normalizedTargetType === "product" && !dialogProductCode && !dialogProductId ? (
        <span className="homepage-editor__inspector-hint" role="alert">请选择要跳转的商品。</span>
      ) : null}
      {dialogPicker && normalizedTargetType === "category" && !dialogCategorySlug ? (
        <span className="homepage-editor__inspector-hint" role="alert">请选择要跳转的分类。</span>
      ) : null}
      {dialogPicker && normalizedTargetType === "page" ? (
        currentPage ? <span>跳转至「{currentPage.label}」</span> : (
          <span className="homepage-editor__inspector-hint" role="alert">
            {linkUrl ? "原页面链接不可用，请重新选择页面。" : "请选择要跳转的页面。"}
          </span>
        )
      ) : null}
      {dialogPicker && picker?.type === "page" ? (
        <Modal
          {...singleReferencePickerModalProps}
          title="选择页面"
          open={picker.open}
          okText="确认选择"
          cancelText="取消"
          okButtonProps={{ disabled: !pageDraftPath, size: "large" }}
          onCancel={closePicker}
          onOk={() => {
            if (!pageDraftPath) return;
            // 确认同一页面时保留历史链接携带的查询参数。
            if (currentPagePath !== pageDraftPath) {
              onChange({
                [key("TargetType")]: "page",
                [key("ProductCode")]: "",
                [key("ProductId")]: 0,
                [key("CategorySlug")]: "",
                [key("LinkUrl")]: pageDraftPath,
              });
            }
            closePicker();
          }}
        >
          <div className="homepage-editor__product-picker-dialog" role="radiogroup" aria-label="站内页面">
            <Radio.Group value={pageDraftPath} onChange={(event) => setPageDraftPath(event.target.value)}>
              <Space direction="vertical" size="middle">
                {publicPageOptions.map((page) => (
                  <Radio key={page.key} value={page.publicPath}>{page.label}</Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        </Modal>
      ) : null}

      {!dialogPicker && normalizedTargetType === "product" ? (
        <div
          ref={detailRef}
          className="homepage-editor__inspector-field homepage-editor__link-target-detail"
        >
          <label>关联商品 <em>必填</em></label>
          <ProductReferencesField
            value={normalizedProductCode ? [normalizedProductCode] : []}
            legacyIds={normalizedProductId > 0 ? [normalizedProductId] : []}
            onChange={(codes, legacyIds) => onChange({
              [key("ProductCode")]: codes[0] || "",
              [key("ProductId")]: Number(legacyIds[0]) || 0,
            })}
            minProducts={1}
            maxProducts={1}
          />
        </div>
      ) : null}

      {!dialogPicker && normalizedTargetType === "category" ? (
        <div
          ref={detailRef}
          className="homepage-editor__inspector-field homepage-editor__link-target-detail"
        >
          <label>关联分类 <em>必填</em></label>
          <CategoryReferencesField
            value={normalizedCategorySlug ? [normalizedCategorySlug] : []}
            onChange={(slugs) => onChange({ [key("CategorySlug")]: slugs[0] || "" })}
            minItems={1}
            maxItems={1}
          />
        </div>
      ) : null}

      {!dialogPicker && normalizedTargetType === "page" ? (
        <div
          ref={detailRef}
          className="homepage-editor__inspector-field homepage-editor__link-target-detail"
        >
          <label htmlFor={`link-target-page-${id}`}>
            站内页面 <em>必填</em>
          </label>
          <input
            id={`link-target-page-${id}`}
            list={`link-target-pages-${id}`}
            value={linkUrl || ""}
            onChange={(event) => onChange({ [key("LinkUrl")]: event.target.value })}
            placeholder="选择公开页面，或为页面添加查询参数"
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
              {linkUrl
                ? "该路径不是可发布的公开页面；商品详情请使用「商品」目标。"
                : "请选择机器合同登记的公开页面。"}
            </span>
          ) : null}
        </div>
      ) : null}
      {normalizedTargetType === "external" ? (
        <div
          ref={detailRef}
          className="homepage-editor__inspector-field homepage-editor__link-target-detail"
        >
          <label htmlFor={`link-target-external-${id}`}>
            HTTPS 外部链接 <em>必填</em>
          </label>
          <input
            id={`link-target-external-${id}`}
            type="url"
            inputMode="url"
            value={linkUrl || ""}
            onChange={(event) => onChange({ [key("LinkUrl")]: event.target.value })}
            placeholder="https://example.com/page"
            autoComplete="url"
            aria-invalid={externalInvalid}
          />
          {externalInvalid ? (
            <span className="homepage-editor__inspector-hint" role="alert">
              {linkUrl ? "外部链接必须是完整的 HTTPS 地址。" : "请输入完整的 HTTPS 地址。"}
            </span>
          ) : null}
        </div>
      ) : null}
      {inspectableTarget ? (
        <a
          className="homepage-editor__linked-target-detail"
          href={inspectableTarget}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="查看跳转目标（新标签页）"
        >
          查看跳转目标
        </a>
      ) : null}
    </>
  );
}
