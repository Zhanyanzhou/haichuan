import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { inquiriesApi, productApi } from "@/services/api";
import { requestErrorCode, requestStatus } from "@/services/httpClient";
import { unwrapResponse } from "@/utils/unwrap";
import { trackPageView, trackSubmitInquiry } from "@/hooks/useAnalytics";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { usePageDecorationState } from "@/page-builder/runtime/PublishedPageDecoration";
import { normalizePublicProductReference } from "@/utils/publicProductPath";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";
import { useStructuredData } from "@/hooks/useStructuredData";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { createIdempotencyKey } from "@/utils/idempotency";

const T = {
  bg: "#FFFFFF",
  txt: "#181A1B",
  sec: "rgba(24,26,27,0.62)",
  light: "rgba(24,26,27,0.42)",
  line: "#DDE1E2",
  gold: "#6E7477",
  warmBg: "#F4F5F5",
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

const SOURCE_TYPE_TO_CONSULTATION: Record<string, string> = {
  appointment: "到店咨询",
  product: "选款建议",
  "purchase-support": "选款建议",
  custom: "高级定制",
  privacy: "其他",
};

type InquirySourceProduct = {
  id: number;
  code?: string | null;
  name: string;
};

type ProductContextStatus = "none" | "loading" | "ready" | "unavailable" | "error";

const REQUIRED_FIELDS = [
  "name",
  "phone",
  "consultationType",
  "preferredTime",
  "message",
  "privacyConsent",
] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];
const FIELD_IDS: Record<RequiredField, string> = {
  name: "cf-name",
  phone: "cf-phone",
  consultationType: "cf-type",
  preferredTime: "cf-time",
  message: "cf-message",
  privacyConsent: "cf-privacy-consent",
};
const ERROR_IDS: Record<RequiredField, string> = {
  name: "cf-name-error",
  phone: "cf-phone-error",
  consultationType: "cf-type-error",
  preferredTime: "cf-time-error",
  message: "cf-message-error",
  privacyConsent: "cf-privacy-consent-error",
};

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
    a: "我们会根据您提供的联系方式与您联系，具体时间与安排以实际沟通为准。",
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

export type ContactProps = {
  mode?: "public" | "editor-preview";
};

export default function Contact({ mode = "public" }: ContactProps = {}) {
  const editorPreview = mode === "editor-preview";
  useStructuredData("contact-faq", editorPreview ? null : {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceType = searchParams.get("type") || "";
  const preselectedConsultationType = SOURCE_TYPE_TO_CONSULTATION[sourceType] || "";
  const isPrivacyRequest = sourceType === "privacy";
  const rawProductRef = editorPreview ? null : searchParams.get("productRef");
  const hasProductReference = rawProductRef !== null;
  const productRef = normalizePublicProductReference(rawProductRef);
  const { active: hasPageDecoration } = usePageDecorationState();
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  // SEO：联系页独立标题与描述
  useEffect(() => {
    if (editorPreview) return;
    setPageMeta({
      title: "提交咨询需求 | 海川珠宝",
      description:
        "珠宝咨询需求提交页面。可提交选款、定制或旧款相关需求，具体服务与安排以实际沟通为准。",
    });
    return () => clearPageMeta();
  }, [editorPreview, setPageMeta, clearPageMeta]);
  const { settings: siteSettings, status: settingsStatus } = usePublicSiteSettings();
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

  const authenticatedCustomer = useCustomerAuthStore((state) => state.customer);
  const savedCustomer = editorPreview ? null : authenticatedCustomer;
  const [form, setForm] = useState({
    name: savedCustomer?.name || "",
    phone: savedCustomer?.phone || "",
    consultationType: preselectedConsultationType,
    preferredContact: "电话",
    preferredTime: "",
    budgetRange: "",
    message: isPrivacyRequest
      ? "我希望行使以下个人信息权利（查询、更正、删除或撤回同意，请说明具体需求）："
      : "",
    privacyConsent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [sourceProduct, setSourceProduct] = useState<InquirySourceProduct | null>(null);
  const [productContextStatus, setProductContextStatus] =
    useState<ProductContextStatus>(hasProductReference ? "loading" : "none");
  const [productContextRevision, setProductContextRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitPendingRef = useRef(false);
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  useEffect(() => {
    if (editorPreview) return;
    trackPageView();
  }, [editorPreview]);

  useEffect(() => {
    if (!hasProductReference) {
      setSourceProduct(null);
      setProductContextStatus("none");
      return;
    }
    if (!productRef) {
      setSourceProduct(null);
      setProductContextStatus("unavailable");
      return;
    }
    let cancelled = false;
    setSourceProduct(null);
    setProductContextStatus("loading");
    productApi
      .getPublicById(productRef, { suppressGlobalError: true })
      .then((response) => {
        if (cancelled) return;
        const product = unwrapResponse<InquirySourceProduct>(response);
        if (
          !product
          || !Number.isInteger(product.id)
          || product.id <= 0
          || !product.name?.trim()
        ) {
          setProductContextStatus("unavailable");
          return;
        }
        setSourceProduct(product);
        setProductContextStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setProductContextStatus(requestStatus(error) === 404 ? "unavailable" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [editorPreview, hasProductReference, productContextRevision, productRef]);

  useEffect(() => {
    if (submitted) successHeadingRef.current?.focus();
  }, [submitted]);

  const set = <Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key])
      setErrors((e) => {
        const n = { ...e };
        delete n[key];
        return n;
      });
  };

  const removeProductContext = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("productRef");
    setSearchParams(next, { replace: true });
    setSourceProduct(null);
    setProductContextStatus("none");
    setSubmitError("");
  };

  const focusInvalidField = (field: RequiredField) => {
    requestAnimationFrame(() => {
      // 等错误文案完成布局后再聚焦和滚动，避免移动端表单增高时把首错推到固定页头下方。
      requestAnimationFrame(() => {
        const target = formRef.current?.querySelector<HTMLElement>(
          `#${FIELD_IDS[field]}`,
        );
        if (!target) return;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      });
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
    const firstInvalidField = REQUIRED_FIELDS.find((field) => e[field]);
    if (firstInvalidField) focusInvalidField(firstInvalidField);
    return !firstInvalidField;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editorPreview) return;
    if (submitPendingRef.current || submitting) return;
    if (!validate()) return;
    submitPendingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await inquiriesApi.submit(
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          consultationType: form.consultationType,
          preferredContact: form.preferredContact,
          preferredTime: form.preferredTime,
          budgetRange: form.budgetRange || undefined,
          productId: sourceProduct?.id,
          message: form.message.trim(),
          privacyConsent: form.privacyConsent,
        },
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = createIdempotencyKey();
      trackSubmitInquiry();
      setSubmitted(true);
    } catch (error) {
      const status = requestStatus(error);
      if (
        sourceProduct
        && requestErrorCode(error) === "INQUIRY_PRODUCT_NOT_AVAILABLE"
      ) {
        setProductContextStatus("unavailable");
        setSubmitError("作品当前不可咨询，请移除作品后提交普通咨询。");
      } else if (status === 429) {
        setSubmitError("提交过于频繁，请稍后再试。");
      } else if (status && status >= 400 && status < 500) {
        setSubmitError("提交信息未通过校验，请检查后重试。");
      } else {
        setSubmitError("提交服务暂时不可用，请稍后再试。");
      }
    } finally {
      submitPendingRef.current = false;
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
          <h1
            ref={successHeadingRef}
            tabIndex={-1}
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: T.txt,
              marginBottom: 12,
              outline: "none",
              textDecorationLine: "underline",
              textDecorationColor: T.txt,
              textDecorationThickness: 2,
              textUnderlineOffset: 6,
            }}
          >
            需求已提交
          </h1>
          <p
            style={{
              fontSize: 14,
              color: T.sec,
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            我们会根据您提供的联系方式与您联系，具体时间与安排以实际沟通为准。
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Link
              to="/catalog"
              className="contact-success__primary"
              style={{
                padding: "10px 28px",
                border: `1px solid ${T.txt}`,
                fontSize: 13,
                color: T.txt,
                textDecoration: "none",
              }}
            >
              浏览作品
            </Link>
            <Link
              to="/"
              className="contact-success__secondary"
              style={{
                fontSize: 13,
                color: T.sec,
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`contact-page${editorPreview ? " is-editor-preview" : ""}`}
      style={{ background: T.bg }}
    >
      {/* ═══ 标题区（紧凑） ═══ */}
      {!hasPageDecoration && <section
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
      </section>}

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
                  联系信息暂时无法加载，您仍可通过本页表单提交需求。
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
                  公开联系方式正在完善，您仍可通过本页表单提交需求。
                </p>
              )}
              {settingsStatus === "loaded" &&
                CONTACT_INFO.map((c) => (
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
                我们会根据您提供的联系方式与您联系，具体时间与安排以实际沟通为准。
              </p>
            </div>
          </div>

          {/* 右侧：表单 */}
          <div>
            {isPrivacyRequest && (
              <section
                aria-labelledby="privacy-request-title"
                style={{
                  border: `1px solid ${T.line}`,
                  background: T.warmBg,
                  padding: "16px 18px",
                  marginBottom: 16,
                }}
              >
                <strong
                  id="privacy-request-title"
                  style={{ display: "block", color: T.txt, fontSize: 15, fontWeight: 500 }}
                >
                  隐私与个人信息请求
                </strong>
                <p style={{ margin: "6px 0 0", color: T.sec, fontSize: 13, lineHeight: 1.7 }}>
                  请说明您希望查询、更正、删除的信息，或需要撤回的同意范围。提交后会生成可分配、跟进和审计的服务记录。
                </p>
              </section>
            )}
            {hasProductReference && (
              <section
                className="contact-product-context"
                aria-live="polite"
                style={{
                  border: `1px solid ${T.line}`,
                  background: T.bg,
                  padding: "16px 18px",
                  marginBottom: 16,
                }}
              >
                {productContextStatus === "loading" && (
                  <p role="status" style={{ margin: 0, color: T.sec, fontSize: 13 }}>
                    正在确认来源作品…
                  </p>
                )}
                {productContextStatus === "ready" && sourceProduct && (
                  <div>
                    <p style={{ margin: "0 0 4px", color: T.light, fontSize: 11, letterSpacing: "0.1em" }}>
                      本次咨询作品
                    </p>
                    <strong style={{ display: "block", color: T.txt, fontSize: 15, fontWeight: 500 }}>
                      {sourceProduct.name}
                    </strong>
                    <p style={{ margin: "4px 0 12px", color: T.sec, fontSize: 12 }}>
                      货号：{sourceProduct.code || "未提供"}
                    </p>
                    <button type="button" onClick={removeProductContext} className="contact-product-context__action">
                      移除作品，改为普通咨询
                    </button>
                  </div>
                )}
                {productContextStatus === "unavailable" && (
                  <div role="alert">
                    <p style={{ margin: "0 0 10px", color: "#8C3F3B", fontSize: 13 }}>
                      作品当前不可咨询。您可以移除作品后继续提交普通咨询。
                    </p>
                    <button type="button" onClick={removeProductContext} className="contact-product-context__action">
                      移除作品上下文
                    </button>
                  </div>
                )}
                {productContextStatus === "error" && (
                  <div role="alert">
                    <p style={{ margin: "0 0 10px", color: "#8C3F3B", fontSize: 13 }}>
                      来源作品暂时无法确认。您可以重试，或移除后提交普通咨询。
                    </p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => setProductContextRevision((value) => value + 1)} className="contact-product-context__action">
                        重新确认
                      </button>
                      <button type="button" onClick={removeProductContext} className="contact-product-context__action">
                        移除作品上下文
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
            <form
              ref={formRef}
              className="contact-form"
              onSubmit={handleSubmit}
              noValidate
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
                    autoComplete="name"
                    aria-required="true"
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? ERROR_IDS.name : undefined}
                    style={{
                      ...inputS,
                      borderColor: errors.name ? "#8C3F3B" : T.line,
                    }}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="您的姓名"
                  />
                  {errors.name && (
                    <p
                      id={ERROR_IDS.name}
                      style={{
                        fontSize: 11,
                        color: "#8C3F3B",
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
                    autoComplete="tel-national"
                    inputMode="numeric"
                    aria-required="true"
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby={errors.phone ? ERROR_IDS.phone : undefined}
                    style={{
                      ...inputS,
                      borderColor: errors.phone ? "#8C3F3B" : T.line,
                    }}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="11位手机号"
                    maxLength={11}
                    type="tel"
                  />
                  {errors.phone && (
                    <p
                      id={ERROR_IDS.phone}
                      style={{
                        fontSize: 11,
                        color: "#8C3F3B",
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
                    aria-required="true"
                    aria-invalid={errors.consultationType ? true : undefined}
                    aria-describedby={
                      errors.consultationType
                        ? ERROR_IDS.consultationType
                        : undefined
                    }
                    style={{
                      ...selS,
                      borderColor: errors.consultationType ? "#8C3F3B" : T.line,
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
                      id={ERROR_IDS.consultationType}
                      style={{
                        fontSize: 11,
                        color: "#8C3F3B",
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
                    aria-required="true"
                    aria-invalid={errors.preferredTime ? true : undefined}
                    aria-describedby={
                      errors.preferredTime ? ERROR_IDS.preferredTime : undefined
                    }
                    style={{
                      ...selS,
                      borderColor: errors.preferredTime ? "#8C3F3B" : T.line,
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
                      id={ERROR_IDS.preferredTime}
                      style={{
                        fontSize: 11,
                        color: "#8C3F3B",
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
                  aria-required="true"
                  aria-invalid={errors.message ? true : undefined}
                  aria-describedby={errors.message ? ERROR_IDS.message : undefined}
                  style={{
                    ...inputS,
                    height: 100,
                    paddingBlock: 10,
                    resize: "vertical",
                    borderColor: errors.message ? "#8C3F3B" : T.line,
                  }}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="请描述您的具体需求，例如：佩戴场合、偏好的材质和风格、特殊要求等…"
                />
                {errors.message && (
                  <p
                    id={ERROR_IDS.message}
                    style={{
                      fontSize: 11,
                      color: "#8C3F3B",
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
                    color: errors.privacyConsent ? "#8C3F3B" : T.sec,
                  }}
                >
                  <input
                    id="cf-privacy-consent"
                    type="checkbox"
                    aria-required="true"
                    checked={form.privacyConsent}
                    onChange={(e) => set("privacyConsent", e.target.checked)}
                    aria-invalid={errors.privacyConsent ? true : undefined}
                    aria-describedby={
                      errors.privacyConsent
                        ? ERROR_IDS.privacyConsent
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
                    id={ERROR_IDS.privacyConsent}
                    style={{
                      fontSize: 11,
                      color: "#8C3F3B",
                      margin: "4px 0 0",
                    }}
                  >
                    {errors.privacyConsent}
                  </p>
                )}
              </div>
              {submitError && (
                <p
                  role="alert"
                  style={{ fontSize: 12, color: "#8C3F3B", marginBottom: 12 }}
                >
                  {submitError}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || (hasProductReference && productContextStatus !== "ready")}
                style={{
                  width: "100%",
                  height: 46,
                  border: "none",
                  cursor: submitting || (hasProductReference && productContextStatus !== "ready") ? "not-allowed" : "pointer",
                  background: submitting || (hasProductReference && productContextStatus !== "ready") ? T.sec : T.gold,
                  color: "#fff",
                  fontSize: 14,
                  letterSpacing: "0.08em",
                  opacity: submitting || (hasProductReference && productContextStatus !== "ready") ? 0.7 : 1,
                }}
              >
                {submitting
                  ? "正在提交…"
                  : hasProductReference && productContextStatus === "loading"
                    ? "正在确认来源作品…"
                    : hasProductReference && productContextStatus !== "ready"
                      ? "请先处理来源作品"
                      : "提交需求"}
              </button>
            </form>
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
        .contact-page.is-editor-preview {
          pointer-events: none;
        }

        .contact-product-context__action {
          min-height: 44px;
          border: 0;
          padding: 0;
          background: transparent;
          color: ${T.txt};
          font-size: 12px;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
        }

        .contact-product-context__action:focus-visible {
          outline: 2px solid ${T.txt};
          outline-offset: 3px;
        }

        .contact-form input:focus-visible,
        .contact-form select:focus-visible,
        .contact-form textarea:focus-visible {
          outline: 2px solid #181A1B;
          outline-offset: 2px;
        }

        @media (max-width: 767px) {
          .contact-grid { grid-template-columns: 1fr !important; }
          .contact-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
