import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import type { PageModule } from "@/types/pageModule";
import { resolveLinkTargetUrl, resolveStorefrontLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DesignSystemStyles } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from "@/page-builder/layout/contentTemplateLayouts";
import { hasRenderableImageDimensions } from "@/utils/imageLoad";
import { resolveMediaSlotImage } from "@/page-builder/config/mediaSlotContract";
import {
  resolveManagedTemplateMediaPreviewUrl,
  useManagedTemplateMediaDisplayUrl,
} from "@/page-builder/template-definition/managedMediaPreview";

interface Props {
  module?: PageModule;
  editMode?: boolean;
  /** 页面装修：空槽不占高度，选中本节后才在画面边缘显示添加入口。 */
  emptySlotPlacement?: "overlay";
  headingLevel?: 1 | 2;
  priority?: boolean;
}

const NON_PUBLISHABLE_SYSTEM_MEDIA = new Set([
  "/images/system/product-placeholder.svg",
  "/images/system/launch-short-page-desktop.svg",
  "/images/system/launch-short-page-mobile.svg",
]);

const DEFERRED_MEDIA_ROOT_MARGIN = "200px 0px";

function publicHeroMedia(value: unknown, editMode: boolean | undefined) {
  const source = typeof value === "string" ? value.trim() : "";
  return !editMode && NON_PUBLISHABLE_SYSTEM_MEDIA.has(source) ? "" : source;
}

/**
 * Hero 模块 — 全屏首屏主视觉
 */
const INSPECTOR_FIELD_MESSAGE = "hc-canvas-inspector-field";

function focusInspectorField(field: string) {
  const parentWindow = window.parent;
  if (!parentWindow || parentWindow === window) return;
  parentWindow.postMessage(
    { type: INSPECTOR_FIELD_MESSAGE, field },
    window.location.origin,
  );
}

export default function HeroSection({
  module,
  editMode,
  emptySlotPlacement,
  headingLevel = 1,
  priority = false,
}: Props) {
  const rm = useReducedMotion();
  const motionDisabled = Boolean(editMode || rm);

  const c = module?.content;
  const s = module?.styleConfig;
  const l = module?.layoutConfig;

  // 未上传某一端时复用另一端已配置图片，不再引入活动素材兜底。
  const configuredDesktopImg = publicHeroMedia(c?.desktopImage, editMode);
  const configuredMobileImg = publicHeroMedia(c?.mobileImage, editMode);
  const desktopImg = configuredDesktopImg || configuredMobileImg;
  const mobileImg = configuredMobileImg || configuredDesktopImg;
  const imageSourceKey = `${desktopImg}\u0000${mobileImg}`;
  // 固有尺寸/纵横比/加载策略由媒体槽契约统一派生，Hero 不再手写 srcset/sizes/width/height。
  const desktopMedia = resolveMediaSlotImage(
    { ratio: IMAGE_SPECS.hero.desktop.ratio, viewport: "desktop", priority, referenceWidth: IMAGE_SPECS.hero.desktop.width },
    desktopImg,
  );
  const mobileMedia = resolveMediaSlotImage(
    { ratio: IMAGE_SPECS.hero.mobile.ratio, viewport: "mobile", priority, referenceWidth: IMAGE_SPECS.hero.mobile.width },
    mobileImg,
  );
  const [failedImageSourceKey, setFailedImageSourceKey] = useState<string | null>(null);
  const [readyImageSourceKey, setReadyImageSourceKey] = useState<string | null>(null);
  const imageFailed = failedImageSourceKey === imageSourceKey;
  const imageReady = readyImageSourceKey === imageSourceKey;
  const mediaRef = useRef<HTMLDivElement | null>(null);
  // 编辑画布在 iframe 中。未公开的 /uploads/page-assets 会 404，失败后只会留下空占位。
  // 预览字节在这块画面所在的文档里生成 blob，替换后的图才能出现在画布上。
  const desktopPreview = useManagedTemplateMediaDisplayUrl(desktopImg, Boolean(editMode), mediaRef);
  const mobilePreview = useManagedTemplateMediaDisplayUrl(mobileImg, Boolean(editMode), mediaRef);
  const [loadableImageSourceKey, setLoadableImageSourceKey] = useState<string | null>(
    editMode || priority ? imageSourceKey : null,
  );
  const shouldLoadImage = editMode || priority || loadableImageSourceKey === imageSourceKey;

  useEffect(() => {
    if (editMode || priority || !desktopImg) {
      setLoadableImageSourceKey(imageSourceKey);
      return;
    }

    const media = mediaRef.current;
    if (!media || typeof IntersectionObserver === "undefined") {
      setLoadableImageSourceKey(imageSourceKey);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setLoadableImageSourceKey(imageSourceKey);
      observer.disconnect();
    }, { rootMargin: DEFERRED_MEDIA_ROOT_MARGIN });
    observer.observe(media);

    return () => observer.disconnect();
  }, [desktopImg, editMode, imageSourceKey, priority]);

  // 已配置的装修区块没有素材时，不能回退到活动默认图，避免前台或画布闪出陌生图片。
  if (!desktopImg && !mobileImg && !editMode) return null;
  // 文案不再回退营销默认值:未填写即为空,公开态对应节点不渲染(编辑态有占位引导)
  const eyebrow = typeof c?.eyebrow === "string" ? c.eyebrow : "";
  const title = typeof c?.title === "string" ? c.title : "";
  const subtitle = typeof c?.subtitle === "string" ? c.subtitle : "";
  const actionText = typeof c?.actionText === "string" ? c.actionText : "";
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const linkUrl = typeof c?.linkUrl === "string" ? c.linkUrl : "";
  const linkTarget = {
    targetType: c?.targetType,
    productCode: c?.productCode,
    productId: c?.productId,
    categorySlug: c?.categorySlug,
    linkUrl,
  };
  const targetUrl = editMode
    ? resolveLinkTargetUrl(linkTarget)
    : resolveStorefrontLinkTargetUrl(linkTarget);
  const overlaySlots = Boolean(editMode && emptySlotPlacement === "overlay");
  const hasRealCopy = Boolean(
    eyebrow || title || subtitle || (editMode ? actionText.trim() : actionText && targetUrl),
  );
  const mobileFrameUsesDesktopImage = Boolean(
    editMode && configuredDesktopImg && !configuredMobileImg,
  );
  const legacyFocusX = s?.focusX ?? 50;
  const legacyFocusY = s?.focusY ?? 50;
  const desktopFocusX = s?.desktopFocusX ?? legacyFocusX;
  const desktopFocusY = s?.desktopFocusY ?? legacyFocusY;
  const mobileFocusX = s?.mobileFocusX ?? legacyFocusX;
  const mobileFocusY = s?.mobileFocusY ?? legacyFocusY;
  // 沉浸式画册：桌面支持左下叙事束，移动端由共享布局恢复为图下文案。
  // 链路修复:编辑器字段为 alignment(旧数据为 template),统一兼容读取
  const rawAlign = l?.alignment || l?.template || "center";
  const alignment = rawAlign === "left" ? "left" : "center";
  const hasConfiguredImage = Boolean(desktopImg || mobileImg);
  const editorCanvasSrc = (source: string, preview: { displaySrc: string; status: string }) => {
    if (!editMode) return source;
    if (preview.status === "error") return resolveManagedTemplateMediaPreviewUrl(source);
    return preview.displaySrc;
  };
  const desktopCanvasSrc = editorCanvasSrc(desktopImg, desktopPreview);
  const mobileCanvasSrc = editorCanvasSrc(mobileImg, mobilePreview);
  const useNeutralMediaFallback = Boolean(editMode && (!hasConfiguredImage || imageFailed));
  const textTone = useNeutralMediaFallback ? "dark" : "light";
  const heroStyle = {
    background: useNeutralMediaFallback || !hasConfiguredImage ? "#F7F8F8" : "#181A1B",
    outline: editMode ? "2px solid rgba(24,26,27,0.48)" : undefined,
    outlineOffset: -2,
    position: "relative",
    "--hc-hero-focus-desktop": `${desktopFocusX}% ${desktopFocusY}%`,
    "--hc-hero-focus-mobile": `${mobileFocusX}% ${mobileFocusY}%`,
    ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.hero),
  } as CSSProperties &
    Record<"--hc-hero-focus-desktop" | "--hc-hero-focus-mobile", string>;

  return (
    <section
      className={`hc-content-template hc-phase1-hero${editMode ? " hc-phase1-hero--edit" : ""}${overlaySlots ? " hc-phase1-hero--overlay-slots" : ""} relative w-full overflow-hidden hc-section`}
      data-content-template={CONTENT_TEMPLATE_LAYOUTS.hero.key}
      data-visual-role={CONTENT_TEMPLATE_LAYOUTS.hero.visualRole}
      data-height-mode-desktop={
        CONTENT_TEMPLATE_LAYOUTS.hero.heightModeByViewport.desktop
      }
      data-height-mode-mobile={
        CONTENT_TEMPLATE_LAYOUTS.hero.heightModeByViewport.mobile
      }
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.hero.mobile.order.join(",")}
      data-flow={CONTENT_TEMPLATE_LAYOUTS.hero.flow}
      data-density="brand"
      data-spacing="normal"
      data-visual-direction="immersive-editorial"
      style={heroStyle}
    >
      <DesignSystemStyles />
      <ContentTemplateLayoutStyles />
      <div
        ref={mediaRef}
        className="hc-content-template__media hc-phase1-hero__media"
        data-content-role-desktop="desktopImage"
        data-content-role-mobile="mobileImage"
      >
        {desktopCanvasSrc && !imageFailed && shouldLoadImage ? (
          <picture data-editor-field="desktopImage mobileImage">
            {!editMode && mobileImg ? (
              <source
                media={RESPONSIVE_CANVAS.mobileMediaQuery}
                srcSet={mobileMedia.srcSet || mobileImg}
                sizes={mobileMedia.sizes}
              />
            ) : null}
            {editMode && mobileCanvasSrc && mobileCanvasSrc !== desktopCanvasSrc ? (
              <source
                media={RESPONSIVE_CANVAS.mobileMediaQuery}
                srcSet={mobileCanvasSrc}
              />
            ) : null}
            <img
              src={desktopCanvasSrc}
              {...(editMode ? {} : {
                srcSet: desktopMedia.srcSet,
                sizes: desktopMedia.sizes,
                width: desktopMedia.width,
                height: desktopMedia.height,
              })}
              alt={c?.altText || title}
              loading={editMode ? "eager" : desktopMedia.loading}
              {...(!editMode && desktopMedia.fetchPriority ? { fetchpriority: desktopMedia.fetchPriority } : {})}
              decoding={desktopMedia.decoding}
              onLoad={(event) => {
                const renderable = hasRenderableImageDimensions(event.currentTarget);
                setFailedImageSourceKey(renderable ? null : imageSourceKey);
                setReadyImageSourceKey(renderable ? imageSourceKey : null);
              }}
              onError={() => {
                setFailedImageSourceKey(imageSourceKey);
                setReadyImageSourceKey(null);
              }}
              className="hc-hero__image absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: imageReady && !imageFailed ? 1 : 0,
                transition: motionDisabled ? undefined : "opacity 240ms ease-out",
              }}
            />
          </picture>
        ) : !desktopImg || (imageFailed && editMode) ? (
          <BlockEmptyPlaceholder
            assetSlots={[
              { templateKey: "hero", roleId: "desktopImage" },
              { templateKey: "hero", roleId: "mobileImage" },
            ]}
            hint={CONTENT_TEMPLATE_LAYOUTS.hero.displayName}
            spec={IMAGE_SPECS.hero.desktop.label}
            tone="neutral"
            height="100%"
          />
        ) : null}
        {imageFailed && !editMode ? (
          <div
            className="absolute inset-0 grid place-items-center text-xs tracking-[.08em]"
            role="img"
            aria-label={c?.altText || "主视觉图片暂不可用"}
            style={{ color: "#DDE1E2", background: "#181A1B" }}
          >
            主视觉图片暂不可用
          </div>
        ) : null}
        {mobileFrameUsesDesktopImage ? (
          <p className="hc-phase1-hero__mobile-source">桌面宽图铺入手机框</p>
        ) : null}
      </div>

      {!useNeutralMediaFallback && (overlaySlots ? hasRealCopy : title || subtitle || (actionText && targetUrl) || editMode) ? (
        <div
          aria-hidden="true"
          className="hc-phase1-hero__copy-shade"
          data-align={alignment}
        />
      ) : null}

      {/* 桌面位于图片安全区；平板和手机由共享布局移到图片下方。 */}
      {(overlaySlots ? hasRealCopy : title || subtitle || (actionText && targetUrl) || editMode) ? (
        <div className="hc-phase1-hero__copy-band" data-has-real-copy={hasRealCopy ? "true" : "false"}>
          <div
            className="hc-content-template__copy hc-phase1-hero__copy"
            data-content-role="copy"
            data-align={alignment}
            data-tone={textTone}
          >
            {(overlaySlots ? Boolean(eyebrow) : eyebrow || editMode) ? (
              <p
                data-editor-field="eyebrow"
                data-hc-editor-placeholder={!eyebrow && editMode ? "true" : undefined}
                className={`hc-content-template__eyebrow hc-hero__reveal${!eyebrow && editMode ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  opacity: 1,
                  transform: "none",
                  animation: motionDisabled
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.3s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {eyebrow || "点击添加眉题"}
              </p>
            ) : null}
            {(overlaySlots ? Boolean(title) : title || editMode) ? (
              <Heading
                data-editor-field="title"
                data-hc-editor-placeholder={!title && editMode ? "true" : undefined}
                className={`hc-content-template__title hc-hero__reveal whitespace-pre-line${!title && editMode ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                  fontSize: "var(--hc-hero-title-size, clamp(42px, 4.4vw, 76px))",
                  opacity: 1,
                  transform: "none",
                  animation: motionDisabled
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.28s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {title || "点击添加主标题"}
              </Heading>
            ) : null}
            {(overlaySlots ? Boolean(subtitle) : subtitle || editMode) ? (
              <p
                data-editor-field="subtitle"
                data-hc-editor-placeholder={!subtitle && editMode ? "true" : undefined}
                className={`hc-content-template__body hc-hero__reveal${!subtitle && editMode ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                  fontStyle: "italic",
                  opacity: 1,
                  transform: "none",
                  animation: motionDisabled
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.34s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {subtitle || "点击添加副标题"}
              </p>
            ) : null}
            {overlaySlots ? (
              actionText.trim() ? (
                <span
                  data-content-role="action"
                  data-editor-field="actionText"
                  className="hc-content-template__action"
                  style={{ fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}
                >
                  {actionText} <span>→</span>
                </span>
              ) : null
            ) : editMode ? (
              <span
                data-content-role="action"
                data-editor-field="actionText"
                data-hc-editor-placeholder={!actionText ? "true" : undefined}
                className={`hc-content-template__action${!actionText ? " hc-visual-empty-role" : ""}`}
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                }}
              >
                {actionText || "点击添加行动文字"} <span>→</span>
              </span>
            ) : actionText && targetUrl ? (
              <Link
                data-content-role="action"
                data-editor-field="actionText linkUrl productId"
                to={targetUrl}
                className="hc-content-template__action hc-hero__reveal transition-opacity duration-300 hover:opacity-60"
                style={{
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  opacity: 1,
                  transform: "none",
                  animation: motionDisabled
                    ? "none"
                    : "hcHeroFadeUp 0.7s 0.38s cubic-bezier(0.22,1,0.36,1) both",
                }}
              >
                {actionText} <span>→</span>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {overlaySlots ? (
        <div className="hc-phase1-hero__slot-affordance">
          {!eyebrow ? (
            <button type="button" data-editor-field="eyebrow" className="hc-visual-empty-role" onClick={() => focusInspectorField("eyebrow")}>
              点击添加眉题
            </button>
          ) : null}
          {!title ? (
            <button type="button" data-editor-field="title" className="hc-visual-empty-role" onClick={() => focusInspectorField("title")}>
              点击添加主标题
            </button>
          ) : null}
          {!subtitle ? (
            <button type="button" data-editor-field="subtitle" className="hc-visual-empty-role" onClick={() => focusInspectorField("subtitle")}>
              点击添加副标题
            </button>
          ) : null}
          {!actionText.trim() ? (
            <button type="button" data-editor-field="actionText" className="hc-content-template__action hc-visual-empty-role" onClick={() => focusInspectorField("actionText")}>
              点击添加行动文字 <span>→</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {/* 静态下滑线：保留方向提示，不用持续动画干扰珠宝影像。 */}
      {desktopImg ? (
        <span
          aria-hidden="true"
          className="absolute bottom-[22px] left-1/2 -translate-x-1/2 w-8 h-px opacity-40"
          style={{ background: "rgba(255,255,255,0.5)" }}
        />
      ) : null}
      <style>{`
        @keyframes hcHeroFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hc-hero__image { object-position: var(--hc-hero-focus-desktop); }
        .hc-phase1-hero__copy-band {
          z-index: 3;
        }
        .hc-phase1-hero__copy > :first-child {
          margin-top: 0;
        }
        .hc-phase1-hero__mobile-source {
          display: none;
        }
        .hc-phase1-hero--overlay-slots .hc-phase1-hero__slot-affordance {
          position: absolute;
          z-index: 5;
          top: 16px;
          right: 16px;
          display: none;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          max-width: calc(100% - 32px);
          pointer-events: none;
        }
        [class*="DraggableComponent--isSelected"] .hc-phase1-hero--overlay-slots .hc-phase1-hero__slot-affordance {
          display: flex;
        }
        [class*="DraggableComponent--isSelected"] .hc-phase1-hero--overlay-slots .hc-phase1-hero__slot-affordance,
        [class*="DraggableComponent--isSelected"] .hc-phase1-hero--overlay-slots .hc-visual-empty-role {
          pointer-events: auto !important;
        }
        .hc-phase1-hero__slot-affordance .hc-visual-empty-role {
          margin: 0;
        }
        .hc-phase1-hero__copy-shade {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background: linear-gradient(90deg, rgba(16, 18, 19, 0.58) 0%, rgba(16, 18, 19, 0.26) 38%, rgba(16, 18, 19, 0) 68%);
        }
        .hc-phase1-hero__copy-shade[data-align="center"] {
          background: linear-gradient(0deg, rgba(16, 18, 19, 0.54) 0%, rgba(16, 18, 19, 0.12) 38%, rgba(16, 18, 19, 0) 68%);
        }
        .hc-phase1-hero__copy[data-tone="dark"] {
          color: #181A1B;
          text-shadow: none;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__title,
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__action {
          color: #181A1B;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__body,
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__eyebrow {
          color: #5F6568;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__action {
          border-color: #181A1B;
        }
        .hc-phase1-hero__copy[data-tone="dark"] .hc-content-template__action:focus-visible {
          outline-color: #181A1B;
        }
        .hc-phase1-hero--edit .hc-phase1-hero__copy-band {
          pointer-events: auto;
        }
        .hc-visual-empty-role {
          display: block;
          width: fit-content;
          max-width: min(100%, 18rem);
          min-width: 0;
          min-height: 0;
          margin-block: 0 8px;
          border: 1px dashed currentColor;
          padding: 6px 10px;
          background: transparent;
          color: inherit;
          font-family: var(--hc-font-sans, ${FONT_SANS}) !important;
          font-size: 14px !important;
          font-style: normal !important;
          font-weight: 500 !important;
          line-height: 20px !important;
          letter-spacing: 0 !important;
          white-space: nowrap;
          opacity: 0.9;
          cursor: pointer;
        }
        .hc-content-template__action.hc-visual-empty-role {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        @media ${RESPONSIVE_CANVAS.mobileMediaQuery} {
          .hc-hero__image { object-position: var(--hc-hero-focus-mobile); }
          .hc-phase1-hero__mobile-source {
            position: absolute;
            z-index: 4;
            top: 12px;
            left: 12px;
            display: block;
            margin: 0;
            padding: 4px 8px;
            background: rgba(247, 248, 248, 0.92);
            color: #181A1B;
            font-family: var(--hc-font-sans, ${FONT_SANS});
            font-size: 12px;
            font-weight: 500;
            line-height: 18px;
            letter-spacing: 0;
            pointer-events: none;
          }
        }
        @media (max-width: 1023px) {
          .hc-phase1-hero__copy-shade { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hc-hero__reveal {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </section>
  );
}
