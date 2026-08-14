import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface LimitedOfferBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
}

type RemainingTime = { days: string; hours: string; minutes: string; seconds: string };

function getTargetTimestamp(targetDate: string): number {
  return new Date(targetDate?.includes("T") ? targetDate : targetDate?.replace(" ", "T")).getTime();
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
export default function LimitedOfferBlock({ module }: LimitedOfferBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { eyebrow, title, body, targetDate, buttonText, linkUrl, benefits = [] } = content;
  const benefitLabels = Array.isArray(benefits)
    ? benefits.map((benefit) => typeof benefit === "string" ? benefit : benefit?.value).filter(Boolean)
    : [];
  const [remaining, setRemaining] = useState(() => getRemainingTime(targetDate));
  const bgColor = styleConfig.bgColor || "#211D19";

  useEffect(() => {
    setRemaining(getRemainingTime(targetDate));
    if (!targetDate || !Number.isFinite(getTargetTimestamp(targetDate))) return;
    const timer = window.setInterval(() => setRemaining(getRemainingTime(targetDate)), 1_000);
    return () => window.clearInterval(timer);
  }, [targetDate]);

  const isExpired = Boolean(remaining && remaining.days === "0" && remaining.hours === "00" && remaining.minutes === "00" && remaining.seconds === "00");
  const units = remaining ? [["天", remaining.days], ["时", remaining.hours], ["分", remaining.minutes], ["秒", remaining.seconds]] : [];

  return (
    <section style={{ padding: "clamp(54px, 7vw, 88px) clamp(20px, 4vw, 60px)", background: bgColor, color: "#fff" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 36, alignItems: "center" }}>
        <div>
          {eyebrow && <p style={{ margin: "0 0 12px", color: "#D8B86D", fontSize: 12, letterSpacing: "0.16em" }}>{eyebrow}</p>}
          {title && <h2 style={{ margin: "0 0 14px", color: "#fff", fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 500 }}>{title}</h2>}
          {body && <p style={{ margin: 0, maxWidth: 480, color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.8 }}>{body}</p>}
          {benefitLabels.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>{benefitLabels.map((benefit, index) => <span key={`${benefit}-${index}`} style={{ border: "1px solid rgba(216,184,109,0.6)", color: "#F3DEAE", padding: "6px 10px", fontSize: 12 }}>{benefit}</span>)}</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          {units.length > 0 && !isExpired ? <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 25 }}>{units.map(([label, value]) => <div key={label as string}><strong style={{ display: "block", minWidth: 48, padding: "11px 8px", background: "rgba(255,255,255,0.1)", color: "#F7E8C7", fontSize: 25, fontWeight: 500 }}>{value}</strong><small style={{ display: "block", marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{label}</small></div>)}</div> : <p style={{ margin: "0 0 25px", color: "#F7E8C7", fontSize: 16 }}>{targetDate ? "活动已结束" : "请设置活动结束时间"}</p>}
          {buttonText && linkUrl && !isExpired && <Link to={linkUrl} style={{ display: "inline-block", padding: "12px 30px", background: "#B8944E", color: "#fff", textDecoration: "none", fontSize: 13, letterSpacing: "0.1em" }}>{buttonText}</Link>}
        </div>
      </div>
    </section>
  );
}
