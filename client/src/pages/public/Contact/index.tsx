import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { inquiriesApi, settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { trackPageView, trackSubmitInquiry } from "@/hooks/useAnalytics";
import { usePageMetaStore } from "@/store/pageMetaStore";

const T = {
  bg: "#FFFFFF",
  txt: "#29241F",
  sec: "rgba(41,36,31,0.58)",
  light: "rgba(41,36,31,0.38)",
  line: "#E8E7E3",
  gold: "#B8944E",
  warmBg: "#FAF9F7",
};
const MW = 1120;
const PX = "clamp(24px,5vw,64px)";

const CONSULT_TYPES = [
  "选款建议",
  "高级定制",
  "旧款改造",
  "尺寸调整",
  "售后保养",
  "到店咨询",
  "其他",
];
const CONTACT_METHODS = ["电话", "短信"];
const TIME_OPTIONS = [
  "上午 (9:00-12:00)",
  "下午 (14:00-18:00)",
  "晚上 (18:00-20:00)",
];
const BUDGET_OPTIONS = [
  "",
  "1万以下",
  "1-5万",
  "5-10万",
  "10-30万",
  "30万以上",
  "暂不透露",
];

const SERVICES = [
  {
    title: "选款需求咨询",
    desc: "您可说明佩戴场景、预算和审美偏好，具体建议与安排以实际沟通为准。",
  },
  {
    title: "定制需求咨询",
    desc: "可提交设计灵感、材质、宝石、尺寸和工艺等需求，是否可提供相关服务以实际沟通为准。",
  },
  {
    title: "旧款相关咨询",
    desc: "可说明旧款、尺寸或保养相关情况，是否可提供服务及具体安排以实际沟通为准。",
  },
];

const FAQS = [
  {
    q: "提交咨询需求后多久会与我联系？",
    a: "我们会尽快与您联系，具体联系时间与安排以实际沟通为准。",
  },
  {
    q: "是否支持到店咨询？",
    a: "您可在需求中说明希望到店咨询，是否可提供接待、时间与地点以实际沟通为准。",
  },
  {
    q: "是否可以线上沟通？",
    a: "您可选择方便的联系方式；具体沟通方式与时间将结合实际情况确认。",
  },
  {
    q: "能咨询旧款相关事项吗？",
    a: "可以提交旧款相关需求；是否可进行重制、尺寸调整、翻新、保养或维修，以实际沟通与评估结果为准。",
  },
];

const inputS: React.CSSProperties = {
  width: "100%",
  height: 44,
  paddingInline: 12,
  border: `1px solid ${T.line}`,
  fontSize: 14,
  color: T.txt,
  background: T.bg,
  outline: "none",
  boxSizing: "border-box",
};
const selS: React.CSSProperties = {
  ...inputS,
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
};
const lblS: React.CSSProperties = {
  fontSize: 12,
  color: T.sec,
  marginBottom: 4,
  display: "block",
};

type SettingsStatus = "loading" | "loaded" | "error";

function useSiteSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [status, setStatus] = useState<SettingsStatus>("loading");
  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getPublicSettings()
      .then((res) => {
        if (cancelled) return;
        setSettings(unwrapResponse<any>(res));
        setStatus("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { settings, status };
}

export default function Contact() {
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  // SEO：联系页独立标题与描述
  useEffect(() => {
    setPageMeta({
      title: "提交咨询需求 | 海川珠宝",
      description:
        "珠宝咨询需求提交页面。可提交选款、定制或旧款相关需求，具体服务与安排以实际沟通为准。",
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);
  const { settings: siteSettings, status: settingsStatus } = useSiteSettings();
  // SiteSettings 是联系信息唯一真实来源；空值不显示，不使用假电话/邮箱/地址兜底。
  const contactPhone = siteSettings?.contactPhone?.trim() || "";
  const contactEmail = siteSettings?.contactEmail?.trim() || "";
  const contactAddress = siteSettings?.contactAddress?.trim() || "";
  const businessHours = siteSettings?.businessHours?.trim() || "";

  const CONTACT_INFO = [
    {
      label: "服务热线",
      value: contactPhone,
      href: contactPhone ? `tel:${contactPhone}` : undefined,
    },
    {
      label: "电子邮箱",
      value: contactEmail,
      href: contactEmail ? `mailto:${contactEmail}` : undefined,
    },
    { label: "总部地址", value: contactAddress },
    { label: "服务时间", value: businessHours },
  ].filter((c) => c.value); // 只显示有真实值的条目

  const savedCustomer = (() => {
    try {
      return JSON.parse(localStorage.getItem("customer") || "null") as {
        name?: string;
        phone?: string;
        email?: string;
      } | null;
    } catch {
      return null;
    }
  })();
  const [form, setForm] = useState({
    name: savedCustomer?.name || "",
    phone: savedCustomer?.phone || "",
    consultationType: "",
    preferredContact: "电话",
    preferredTime: "",
    budgetRange: "",
    message: "",
    privacyConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    trackPageView();
  }, []);

  const set = (key: string, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key])
      setErrors((e) => {
        const n = { ...e };
        delete n[key];
        return n;
      });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "请输入姓名";
    if (!/^1[3-9]\d{9}$/.test(form.phone.trim()))
      e.phone = "请输入正确的手机号码";
    if (!form.consultationType) e.consultationType = "请选择咨询类型";
    if (!form.preferredTime) e.preferredTime = "请选择方便联系的时间";
    if (!form.message.trim() || form.message.trim().length < 10)
      e.message = "请至少输入10个字描述您的需求";
    if (!form.privacyConsent) e.privacyConsent = "请阅读并同意隐私说明";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await inquiriesApi.submit({
        name: form.name.trim(),
        phone: form.phone.trim(),
        consultationType: form.consultationType,
        preferredContact: form.preferredContact,
        preferredTime: form.preferredTime,
        budgetRange: form.budgetRange || undefined,
        message: form.message.trim(),
        privacyConsent: form.privacyConsent,
      });
      trackSubmitInquiry();
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message || "提交失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        style={{
          background: T.warmBg,
          minHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{ textAlign: "center", maxWidth: 480, padding: "40px 24px" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: T.gold,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              marginBottom: 24,
            }}
          >
            ✓
          </div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: T.txt,
              marginBottom: 12,
            }}
          >
            需求已提交
          </h2>
          <p
            style={{
              fontSize: 14,
              color: T.sec,
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            我们会尽快根据您提供的联系方式与您联系，具体安排以实际沟通为准。
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link
              to="/"
              style={{
                padding: "10px 28px",
                border: `1px solid ${T.line}`,
                fontSize: 13,
                color: T.txt,
                textDecoration: "none",
              }}
            >
              返回首页
            </Link>
            <Link
              to="/catalog"
              style={{
                padding: "10px 28px",
                border: `1px solid ${T.line}`,
                fontSize: 13,
                color: T.txt,
                textDecoration: "none",
              }}
            >
              浏览珠宝作品
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg }}>
      {/* ═══ 标题区（紧凑） ═══ */}
      <section
        style={{
          padding: "clamp(32px,5vh,56px) 0 clamp(20px,3vh,32px)",
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div style={{ maxWidth: MW, marginInline: "auto", paddingInline: PX }}>
          <p
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              color: T.light,
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            CONSULTATION REQUEST
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,2.8vw,32px)",
              fontWeight: 400,
              color: T.txt,
              margin: "0 0 8px",
              letterSpacing: "0.04em",
            }}
          >
            提交咨询需求
          </h1>
          <p style={{ fontSize: 14, color: T.sec, margin: 0, maxWidth: 480 }}>
            您可提交选款、定制或旧款相关需求；具体服务内容与安排以实际沟通为准。
          </p>
        </div>
      </section>

      {/* ═══ 主体：左40% 右60% ═══ */}
      <section style={{ paddingBlock: "clamp(36px,5vh,64px)" }}>
        <div
          className="contact-grid"
          style={{
            maxWidth: MW,
            marginInline: "auto",
            paddingInline: PX,
            display: "grid",
            gridTemplateColumns: "minmax(0,2fr) minmax(0,3fr)",
            gap: "clamp(32px,5vw,64px)",
          }}
        >
          {/* 左侧 */}
          <div>
            <div style={{ marginBottom: 36 }}>
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: T.light,
                  marginBottom: 20,
                }}
              >
                我们的服务
              </p>
              {SERVICES.map((s, i) => (
                <div
                  key={i}
                  style={{ marginBottom: i < SERVICES.length - 1 ? 24 : 0 }}
                >
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 400,
                      color: T.txt,
                      margin: "0 0 4px",
                    }}
                  >
                    <span
                      style={{ color: T.gold, marginRight: 8, fontWeight: 300 }}
                    >
                      0{i + 1}
                    </span>
                    {s.title}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: T.sec,
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
            <div
              style={{ borderTop: `1px solid ${T.line}`, marginBottom: 28 }}
            />
            <div style={{ marginBottom: 28 }}>
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: T.light,
                  marginBottom: 14,
                }}
              >
                联系方式
              </p>
              {settingsStatus === "loading" && (
                <p
                  aria-live="polite"
                  style={{ fontSize: 12, color: T.light, margin: 0 }}
                >
                  正在加载联系方式…
                </p>
              )}
              {settingsStatus === "error" && (
                <p
                  role="alert"
                  style={{
                    fontSize: 12,
                    color: T.sec,
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  联系信息暂时无法加载，您仍可通过右侧表单提交需求。
                </p>
              )}
              {settingsStatus === "loaded" && CONTACT_INFO.length === 0 && (
                <p
                  style={{
                    fontSize: 12,
                    color: T.sec,
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  公开联系方式正在完善，您仍可通过右侧表单提交需求。
                </p>
              )}
              {settingsStatus === "loaded" &&
                CONTACT_INFO.map((c, i) => (
                  <div key={c.label} style={{ marginBottom: 10, fontSize: 13 }}>
                    <span style={{ color: T.light, marginRight: 8 }}>
                      {c.label}
                    </span>
                    {c.href ? (
                      <a
                        href={c.href}
                        style={{ color: T.txt, textDecoration: "none" }}
                      >
                        {c.value}
                      </a>
                    ) : (
                      <span style={{ color: T.txt }}>{c.value}</span>
                    )}
                  </div>
                ))}
            </div>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 20 }}>
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: T.light,
                  marginBottom: 10,
                }}
              >
                咨询流程
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: T.sec,
                  flexWrap: "wrap",
                }}
              >
                <span>提交需求</span>
                <span style={{ color: T.light }}>→</span>
                <span>沟通确认</span>
                <span style={{ color: T.light }}>→</span>
                <span>具体安排</span>
              </div>
              <p style={{ fontSize: 11, color: T.light, marginTop: 8 }}>
                我们会尽快与您联系，具体时间与安排以实际沟通为准。
              </p>
            </div>
          </div>

          {/* 右侧：表单 */}
          <div>
            <div
              style={{
                background: T.warmBg,
                padding: "clamp(24px,4vw,40px)",
                border: `1px solid ${T.line}`,
              }}
            >
              <div
                className="contact-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label style={lblS} htmlFor="cf-name">
                    姓名 <span style={{ color: T.gold }}>*</span>
                  </label>
                  <input
                    id="cf-name"
                    style={{
                      ...inputS,
                      borderColor: errors.name ? "#c0392b" : T.line,
                    }}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="您的姓名"
                  />
                  {errors.name && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#c0392b",
                        margin: "2px 0 0",
                      }}
                    >
                      {errors.name}
                    </p>
                  )}
                </div>
                <div>
                  <label style={lblS} htmlFor="cf-phone">
                    手机号码 <span style={{ color: T.gold }}>*</span>
                  </label>
                  <input
                    id="cf-phone"
                    style={{
                      ...inputS,
                      borderColor: errors.phone ? "#c0392b" : T.line,
                    }}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="11位手机号"
                    maxLength={11}
                    type="tel"
                  />
                  {errors.phone && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#c0392b",
                        margin: "2px 0 0",
                      }}
                    >
                      {errors.phone}
                    </p>
                  )}
                </div>
              </div>
              <div
                className="contact-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label style={lblS} htmlFor="cf-type">
                    咨询类型 <span style={{ color: T.gold }}>*</span>
                  </label>
                  <select
                    id="cf-type"
                    style={{
                      ...selS,
                      borderColor: errors.consultationType ? "#c0392b" : T.line,
                    }}
                    value={form.consultationType}
                    onChange={(e) => set("consultationType", e.target.value)}
                  >
                    <option value="" disabled>
                      请选择
                    </option>
                    {CONSULT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {errors.consultationType && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#c0392b",
                        margin: "2px 0 0",
                      }}
                    >
                      {errors.consultationType}
                    </p>
                  )}
                </div>
                <div>
                  <label style={lblS} htmlFor="cf-contact">
                    希望的联系方式
                  </label>
                  <select
                    id="cf-contact"
                    style={selS}
                    value={form.preferredContact}
                    onChange={(e) => set("preferredContact", e.target.value)}
                  >
                    {CONTACT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div
                className="contact-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label style={lblS} htmlFor="cf-time">
                    方便联系的时间 <span style={{ color: T.gold }}>*</span>
                  </label>
                  <select
                    id="cf-time"
                    style={{
                      ...selS,
                      borderColor: errors.preferredTime ? "#c0392b" : T.line,
                    }}
                    value={form.preferredTime}
                    onChange={(e) => set("preferredTime", e.target.value)}
                  >
                    <option value="" disabled>
                      请选择
                    </option>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {errors.preferredTime && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "#c0392b",
                        margin: "2px 0 0",
                      }}
                    >
                      {errors.preferredTime}
                    </p>
                  )}
                </div>
                <div>
                  <label style={lblS} htmlFor="cf-budget">
                    预算范围（选填）
                  </label>
                  <select
                    id="cf-budget"
                    style={selS}
                    value={form.budgetRange}
                    onChange={(e) => set("budgetRange", e.target.value)}
                  >
                    {BUDGET_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b || "请选择（选填）"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lblS} htmlFor="cf-message">
                  需求描述 <span style={{ color: T.gold }}>*</span>
                </label>
                <textarea
                  id="cf-message"
                  style={{
                    ...inputS,
                    height: 100,
                    paddingBlock: 10,
                    resize: "vertical",
                    borderColor: errors.message ? "#c0392b" : T.line,
                  }}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="请描述您的具体需求，例如：佩戴场合、偏好的材质和风格、特殊要求等…"
                />
                {errors.message && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "#c0392b",
                      margin: "2px 0 0",
                    }}
                  >
                    {errors.message}
                  </p>
                )}
              </div>
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    color: errors.privacyConsent ? "#c0392b" : T.sec,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.privacyConsent}
                    onChange={(e) => set("privacyConsent", e.target.checked)}
                    aria-invalid={errors.privacyConsent ? true : undefined}
                    aria-describedby={
                      errors.privacyConsent
                        ? "cf-privacy-consent-error"
                        : undefined
                    }
                    style={{ marginTop: 2, accentColor: T.gold }}
                  />
                  <span>
                    我已阅读并同意
                    <Link
                      to="/privacy"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: T.txt, textDecoration: "underline" }}
                    >
                      隐私说明
                    </Link>
                    ，提交的姓名、电话和需求仅用于预约联系与服务处理。
                  </span>
                </label>
                {errors.privacyConsent && (
                  <p
                    id="cf-privacy-consent-error"
                    role="alert"
                    style={{
                      fontSize: 11,
                      color: "#c0392b",
                      margin: "4px 0 0",
                    }}
                  >
                    {errors.privacyConsent}
                  </p>
                )}
              </div>
              {submitError && (
                <p style={{ fontSize: 12, color: "#c0392b", marginBottom: 12 }}>
                  {submitError}
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: "100%",
                  height: 46,
                  border: "none",
                  cursor: submitting ? "not-allowed" : "pointer",
                  background: submitting ? T.sec : T.gold,
                  color: "#fff",
                  fontSize: 14,
                  letterSpacing: "0.08em",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "正在提交…" : "提交需求"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section
        style={{
          padding: "clamp(28px,4vh,48px) 0 clamp(48px,7vh,80px)",
          borderTop: `1px solid ${T.line}`,
        }}
      >
        <div style={{ maxWidth: MW, marginInline: "auto", paddingInline: PX }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              color: T.light,
              marginBottom: 20,
            }}
          >
            常见问题
          </p>
          <div style={{ display: "grid", gap: 16 }}>
            {FAQS.map((faq, i) => (
              <div
                key={i}
                style={{
                  paddingBottom: i < FAQS.length - 1 ? 16 : 0,
                  borderBottom:
                    i < FAQS.length - 1 ? `1px solid ${T.line}` : "none",
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: T.txt,
                    margin: "0 0 4px",
                  }}
                >
                  {faq.q}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: T.sec,
                    margin: 0,
                    lineHeight: 1.6,
                  }}
                >
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 767px) {
          .contact-grid { grid-template-columns: 1fr !important; }
          .contact-grid > div:first-child { order: 2; }
          .contact-grid > div:last-child { order: 1; }
          .contact-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
