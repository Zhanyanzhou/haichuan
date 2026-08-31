import FieldRenderer, { isFieldVisible } from "../FieldRenderer";
import { appointmentSchema } from "../schema/modules/appointment";
import { beforeAfterSchema } from "../schema/modules/beforeAfter";
import { carouselSchema } from "../schema/modules/carousel";
import { hotspotSchema } from "../schema/modules/hotspot";
import { featuredProductSchema } from "../schema/modules/featuredProduct";
import { productRowSchema } from "../schema/modules/productRow";
import { categoryCardsSchema } from "../schema/modules/categoryCards";
import { occasionGuideSchema } from "../schema/modules/categoryCards";
import { heroSchema } from "../schema/modules/hero";
import { fullBleedSchema } from "../schema/modules/fullBleed";
import { singlePosterSchema } from "../schema/modules/singlePoster";
import { doublePosterSchema } from "../schema/modules/doublePoster";
import { textBannerSchema } from "../schema/modules/textBanner";
import { customProcessSchema } from "../schema/modules/customProcess";
import { gallerySchema } from "../schema/modules/gallery";
import { lookbookSchema } from "../schema/modules/lookbook";
import { cardGridSchema, servicePromiseSchema } from "../schema/modules/cardGrid";
import { certificateSchema } from "../schema/modules/certificate";
import { storeInfoSchema } from "../schema/modules/storeInfo";
import { testimonialSchema } from "../schema/modules/testimonial";
import { limitedOfferSchema } from "../schema/modules/limitedOffer";
import { craftDetailsSchema } from "../schema/modules/craftDetails";
import type { ModuleInspectorSchema } from "../schema/types";
import type { PuckProps } from "../../types";
import type { MatureContentTemplateSlotType } from "../../template-definition/validateTemplateDefinition";

export type DynamicComplexSlotType =
  | "carousel"
  | "hotspot"
  | "beforeAfter"
  | "appointment"
  | "productCard"
  | "productCollection"
  | "categoryCollection"
  | MatureContentTemplateSlotType;

const SCHEMA_BY_SLOT_TYPE: Record<DynamicComplexSlotType, ModuleInspectorSchema> = {
  carousel: carouselSchema,
  hotspot: hotspotSchema,
  beforeAfter: beforeAfterSchema,
  appointment: appointmentSchema,
  productCard: featuredProductSchema,
  productCollection: productRowSchema,
  categoryCollection: categoryCardsSchema,
  heroTemplate: heroSchema,
  fullBleedTemplate: fullBleedSchema,
  singlePosterTemplate: singlePosterSchema,
  doublePosterTemplate: doublePosterSchema,
  textBannerTemplate: textBannerSchema,
  journeyTemplate: customProcessSchema,
  galleryTemplate: gallerySchema,
  lookbookTemplate: lookbookSchema,
  sceneShoppingTemplate: occasionGuideSchema,
  brandPointsTemplate: cardGridSchema,
  servicePromisesTemplate: servicePromiseSchema,
  certificatesTemplate: certificateSchema,
  storeInfoTemplate: storeInfoSchema,
  testimonialsTemplate: testimonialSchema,
  limitedEventTemplate: limitedOfferSchema,
  craftDetailsTemplate: craftDetailsSchema,
};

export function isDynamicComplexSlotType(value: string): value is DynamicComplexSlotType {
  return Object.prototype.hasOwnProperty.call(SCHEMA_BY_SLOT_TYPE, value);
}

function removeLegacyBusinessReferences(
  slotType: DynamicComplexSlotType,
  value: Record<string, unknown>,
) {
  const removeNumericProductIds = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(removeNumericProductIds);
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(Object.entries(candidate as Record<string, unknown>)
      .filter(([key]) => !/productIds?$/i.test(key))
      .map(([key, nested]) => [key, removeNumericProductIds(nested)]));
  };
  const next = removeNumericProductIds(value) as Record<string, unknown>;
  if (slotType === "productCard") {
    delete next.secondaryLink;
  }
  if (slotType === "categoryCollection") delete next.categories;
  return next;
}

export default function DynamicComplexContentFields({
  slotType,
  value,
  onChange,
  designValue = {},
  onDesignChange,
  scope,
  device,
}: {
  slotType: DynamicComplexSlotType;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  designValue?: Record<string, unknown>;
  onDesignChange?: (next: Record<string, string | number | boolean>) => void;
  scope: "page" | "template";
  device: "desktop" | "mobile";
}) {
  const schema = SCHEMA_BY_SLOT_TYPE[slotType];
  const effectiveValue = scope === "template" ? { ...value, ...designValue } : value;
  const ctx = {
    props: effectiveValue as PuckProps,
    device,
    viewportWidth: device === "desktop" ? 1200 : 390,
  } as const;
  const updateContent = (patch: PuckProps) => onChange(removeLegacyBusinessReferences(slotType, {
      ...value,
      ...patch,
    }));
  const updateDesign = (patch: PuckProps) => {
    if (!onDesignChange) return;
    const next = { ...designValue } as Record<string, string | number | boolean>;
    for (const [key, candidate] of Object.entries(patch)) {
      if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") {
        next[key] = candidate;
      }
    }
    onDesignChange(next);
  };

  return (
    <div
      className="homepage-editor__inspector-subsection"
      data-complex-content-type={slotType}
      data-complex-content-scope={scope}
    >
      {schema.sections.map((section) => {
        const isTemplateDesignSection = section.layer === "layout" || section.layer === "style";
        if (scope === "page" && isTemplateDesignSection) return null;
        if (section.visibleWhen && !section.visibleWhen(ctx)) return null;
        const fields = section.fields.filter((field) => (
          field.key !== "moduleName"
          && !(scope === "template" && ["productReferences", "categoryReferences"].includes(field.control))
          && (!field.device || field.device === "shared" || field.device === device)
          && isFieldVisible(field, ctx)
        ));
        if (fields.length === 0) return null;
        return (
          <section key={section.id} className="homepage-editor__inspector-subsection">
            <div className="homepage-editor__inspector-section-head">
              <strong>{section.title}</strong>
              {section.description ? <span>{section.description}</span> : null}
            </div>
            <div className="homepage-editor__inspector-section-body">
              {fields.map((field, index) => (
                <FieldRenderer
                  key={`${field.key}-${index}`}
                  def={field}
                  ctx={ctx}
                  update={isTemplateDesignSection ? updateDesign : updateContent}
                  moduleType={schema.moduleType}
                />
              ))}
            </div>
          </section>
        );
      })}
      <p className="homepage-editor__inspector-hint">
        {scope === "template"
          ? "内容、媒体和交互写入所选内容用途；布局与样式锁定在母模板节点，页面实例不能覆盖。"
          : "这里的内容只写入当前页面实例，不会修改母模板或其他实例。"}
      </p>
    </div>
  );
}
