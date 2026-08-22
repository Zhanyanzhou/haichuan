import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY } from "@/page-builder/designSystem/tokens";
import { SecureImage } from "@/components/common/SecureImage";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { getContractRoleRatio } from "@/page-builder/config/blockContracts";
import { isSafeInternalPath, resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";

interface LimitedOfferBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

type RemainingTime = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

function getTargetTimestamp(targetDate: string): number {
  return new Date(
    targetDate?.includes("T") ? targetDate : targetDate?.replace(" ", "T"),
  ).getTime();
}

function getRemainingTime(targetDate: string): RemainingTime | null {
  const target = getTargetTimestamp(targetDate);
  if (!Number.isFinite(target)) return null;
  const remaining = Math.max(0, target - Date.now());
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    days: String(Math.floor(remaining / 86_400_000)),
    hours: pad(Math.floor((remaining % 86_400_000) / 3_600_000)),
    minutes: pad(Math.floor((remaining % 3_600_000) / 60_000)),
    seconds: pad(Math.floor((remaining % 60_000) / 1_000)),
  };
}

/** 限时活动：真实按目标时间递减，活动结束后显示结束状态。 */
export default function LimitedOfferBlock({
  module,
  editMode,
}: LimitedOfferBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const {
    eventImage,
    eyebrow,
    title,
    body,
    targetDate,
    buttonText,
    benefits = [],
  } = content;
  // 跳转三件套优先,旧草稿裸 linkUrl 字段兜底
  const targetUrl =
    resolveLinkTargetUrl({
      targetType: content.targetType,
      productCode: content.productCode,
      productId: content.productId,
      linkUrl: content.linkUrl,
    }) || (isSafeInternalPath(content.linkUrl) ? content.linkUrl : "");
  const benefitLabels = Array.isArray(benefits)
    ? benefits
        .map((benefit) =>
          typeof benefit === "string" ? benefit : benefit?.value,
        )
        .filter(Boolean)
    : [];
  const [remaining, setRemaining] = useState(() =>
    getRemainingTime(targetDate),
  );
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  const desktopEventRatio = getContractRoleRatio("limitedEvent", "event", "desktop");
  const mobileEventRatio = getContractRoleRatio("limitedEvent", "event", "mobile");

  useEffect(() => {
    setRemaining(getRemainingTime(targetDate));
    // 编辑预览中暂停每秒倒计时：避免 setState 持续触发重绘拖慢画布滚动；前台保持实时跳动。
    if (
      editMode ||
      !targetDate ||
      !Number.isFinite(getTargetTimestamp(targetDate))
    )
      return;
    const timer = window.setInterval(
      () => setRemaining(getRemainingTime(targetDate)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [editMode, targetDate]);

  const isExpired = Boolean(
    remaining &&
    remaining.days === "0" &&
    remaining.hours === "00" &&
    remaining.minutes === "00" &&
    remaining.seconds === "00",
  );
  const units = remaining
    ? [
        ["天", remaining.days],
        ["时", remaining.hours],
        ["分", remaining.minutes],
        ["秒", remaining.seconds],
      ]
    : [];

  return (
    <DecorSection master="commerce-campaign" width="standard" flow="flow" background={bgColor} style={{ color: "#181A1B" }}>
      <div className="hc-limited-event">
        <style>{`
          .hc-limited-event { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); gap: clamp(28px, 5vw, 64px); align-items: center; }
          .hc-limited-event__media { grid-row: 1 / span 3; aspect-ratio: ${desktopEventRatio}; overflow: hidden; background: #F4F5F5; }
          .hc-limited-event__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .hc-limited-event__time { display: flex; flex-wrap: wrap; gap: 10px; }
          @media (max-width: 767px) {
            .hc-limited-event { grid-template-columns: minmax(0, 1fr); gap: 28px; }
            .hc-limited-event__media { grid-row: auto; aspect-ratio: ${mobileEventRatio}; }
          }
        `}</style>
        <div className="hc-limited-event__media" data-content-role="event" data-editor-field="eventImage">
          {eventImage ? (
            <SecureImage src={eventImage} alt={title || "活动视觉"} />
          ) : editMode ? (
            <BlockEmptyPlaceholder
              assetSlot={{ templateKey: "limitedEvent", roleId: "event" }}
              hint="活动视觉"
              spec={`桌面 ${desktopEventRatio} · 手机 ${mobileEventRatio}`}
              height="100%"
            />
          ) : null}
        </div>
        <div className="hc-limited-event__time" data-content-role="time" data-editor-field="targetDate">
          {units.length > 0 && !isExpired ? units.map(([label, value]) => (
            <div key={label as string}>
              <strong style={{ display: "block", minWidth: 48, padding: "10px 8px", border: "1px solid rgba(0,0,0,0.15)", color: "#181A1B", fontSize: 24, fontWeight: 500, textAlign: "center" }}>{value}</strong>
              <small style={{ display: "block", marginTop: 6, color: "#6E7477", fontSize: 11, textAlign: "center" }}>{label}</small>
            </div>
          )) : (
            <p style={{ margin: 0, color: "#6E7477", fontSize: 14 }}>{targetDate ? "活动已结束" : "请设置活动结束时间"}</p>
          )}
        </div>
        <div data-content-role="copy">
          {eyebrow ? (
            <p data-editor-field="eyebrow"
              style={{
                margin: "0 0 12px",
                color: "#6E7477",
                fontSize: 12,
                letterSpacing: "0.16em",
              }}
            >
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 data-editor-field="title"
              style={{
                margin: "0 0 14px",
                color: "#181A1B",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(28px, 3.5vw, 44px))",
                fontWeight: 500,
              }}
            >
              {title}
            </h2>
          ) : null}
          {body ? (
            <p data-editor-field="body"
              style={{
                margin: 0,
                maxWidth: 480,
                color: "#6E7477",
                fontSize: 14,
                lineHeight: 1.8,
              }}
            >
              {body}
            </p>
          ) : null}
          {benefitLabels.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 22,
              }}
            >
              {benefitLabels.map((benefit, index) => (
                <span
                  key={`${benefit}-${index}`}
                  style={{
                    border: "1px solid rgba(0,0,0,0.2)",
                    color: "#5F6568",
                    padding: "6px 10px",
                    fontSize: 12,
                  }}
                >
                  {benefit}
                </span>
              ))}
            </div>
          )}
        </div>
        <div data-content-role="action">
          {buttonText && targetUrl && !isExpired && (
            <Link data-editor-field="buttonText linkUrl"
              to={targetUrl}
              style={{
                display: "inline-block",
                paddingBottom: 6,
                borderBottom: "1px solid #181A1B",
                color: "#181A1B",
                textDecoration: "none",
                fontSize: 13,
                letterSpacing: "0.1em",
              }}
            >
              {buttonText}
            </Link>
          )}
        </div>
      </div>
    </DecorSection>
  );
}
