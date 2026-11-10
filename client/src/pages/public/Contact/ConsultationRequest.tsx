import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { inquiriesApi } from "@/services/api";
import { requestErrorCode, requestStatus } from "@/services/httpClient";
import { unwrapResponse } from "@/utils/unwrap";
import { trackPageView, trackSubmitInquiry } from "@/hooks/useAnalytics";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { usePageDecorationState } from "@/page-builder/runtime/PublishedPageDecoration";
import { normalizePublicProductReference } from "@/utils/publicProductPath";
import { lookupPublicWork } from "@/data/publicWorkLookup";
import { clampProductTitle } from "@/utils/productTitleLength";
import { usePublicContactResource, type PublicSiteSettingsResource } from "@/hooks/usePublicSiteSettings";
import PublicContactDetails from "@/components/common/PublicContactDetails";
import { useStructuredData } from "@/hooks/useStructuredData";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { isStaleSessionResponseError } from "@/services/sessionEpoch";
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from "@/config/privacyConsent";
import {
  getConsultationSubmissionStatusCopy,
  parseConsultationSubmissionReceipt,
  type ConsultationSubmissionReceipt,
} from "@/services/clients/consultationSubmissionReceipt";
import "./contact.css";
import {
  activateContactSubmissionContext,
  clearContactConsultationDraft,
  clearConsultationSubmissionAttempt,
  consultationDraftOwner,
  createConsultationSubmissionFingerprint,
  readContactConsultationDraft,
  reserveConsultationSubmissionAttempt,
  runConsultationSubmission,
  saveContactConsultationDraft,
} from "@/utils/consultationJourneyState";

const T = {
  bg: "#FFFFFF",
  txt: "#181A1B",
  sec: "rgba(24,26,27,0.62)",
  light: "#6E7477",
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
const CONTACT_METHODS = ["电话", "短信", "电子邮件"];
const TIME_OPTIONS = [
  "上午 (9:00-12:00)",
  "下午 (13:00-18:00)",
  "晚上 (18:00-21:00)",
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
  order: "其他",
  care: "售后保养",
  privacy: "其他",
};
const PRIVACY_REQUEST_MESSAGE =
  "我希望行使以下个人信息权利（查询、更正、删除或撤回同意，请说明具体需求）：";

type InquirySourceProduct = {
  id: number;
  code?: string | null;
  name: string;
  /** 演示款只带名称和款号，不提交数据库作品 ID。 */
  virtual?: boolean;
};

type ProductContextStatus = "none" | "loading" | "ready" | "unavailable" | "error";

const REQUIRED_FIELDS = [
  "name",
  "phone",
  "email",
  "consultationType",
  "message",
  "privacyConsent",
] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];
const FIELD_IDS: Record<RequiredField, string> = {
  name: "cf-name",
  phone: "cf-phone",
  email: "cf-email",
  consultationType: "cf-type",
  message: "cf-message",
  privacyConsent: "cf-privacy-consent",
};
const ERROR_IDS: Record<RequiredField, string> = {
  name: "cf-name-error",
  phone: "cf-phone-error",
  email: "cf-email-error",
  consultationType: "cf-type-error",
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
    q: "如何添加海川珠宝顾问微信？",
    a: "在本页复制微信号，或保存二维码后在微信中识别添加。正在用手机浏览时，无法扫描自己屏幕上的二维码。",
  },
  {
    q: "如何咨询珠宝的材质和规格？",
    a: "请在咨询中写明作品和想了解的材质、尺寸或证书问题。具体说明以顾问沟通为准，本页不替代实物鉴定。",
  },
  {
    q: "是否支持珠宝定制？",
    a: "可以提交定制意向。是否可制作、可选材质与周期，以实际评估为准。",
  },
  {
    q: "如何查询订单状态？",
    a: "请登录我的账户查看您的订单。若需要人工协助，可在本页留下订单相关问题。",
  },
  {
    q: "如何了解配送信息？",
    a: "配送安排以对应订单和实际沟通为准。您可以在咨询中说明需要了解的订单。",
  },
  {
    q: "是否提供珠宝保养或维修？",
    a: "可以提交保养或维修需求。是否承接、费用与时间，以实际评估为准。",
  },
  {
    q: "如何联系售后？",
    a: "可通过本页微信、电话或咨询表单联系。提交后会生成可跟进的服务记录。",
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
  /** 嵌在直接联系页下方，与微信、电话同页呈现。 */
  embedded?: boolean;
  contact?: PublicSiteSettingsResource;
};

export default function Contact({ mode = "public", embedded = false, contact }: ContactProps = {}) {
  const editorPreview = mode === "editor-preview";
  const location = useLocation();
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
  const taskHeading = isPrivacyRequest ? "提交隐私请求" : "提交咨询需求";
  const rawProductRef = editorPreview ? null : searchParams.get("productRef");
  const hasProductReference = rawProductRef !== null;
  const productRef = normalizePublicProductReference(rawProductRef);
  const { active: hasPageDecoration } = usePageDecorationState();
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  // SEO：联系页独立标题与描述
  useEffect(() => {
    if (editorPreview || embedded) return;
    setPageMeta({
      title: "提交咨询需求 | 海川珠宝",
      description:
        "珠宝咨询需求提交页面。可提交选款、定制或旧款相关需求，具体服务与安排以实际沟通为准。",
    });
    return () => clearPageMeta();
  }, [editorPreview, embedded, setPageMeta, clearPageMeta]);
  const ownContact = usePublicContactResource(!contact);
  const contactResource = contact ?? ownContact;

  const authenticatedCustomer = useCustomerAuthStore((state) => state.customer);
  const savedCustomer = editorPreview ? null : authenticatedCustomer;
  const draftOwner = consultationDraftOwner(savedCustomer?.id);
  const [restoredDraft] = useState(() => (
    editorPreview ? null : readContactConsultationDraft(draftOwner, productRef ?? "")
  ));
  const [form, setForm] = useState(() => {
    const restored = restoredDraft;
    return {
      name: restored?.name || savedCustomer?.name || "",
      phone: restored?.phone || savedCustomer?.phone || "",
      email: restored?.email || savedCustomer?.email || "",
      consultationType: restored?.consultationType || preselectedConsultationType,
      preferredContact: restored?.preferredContact || "电话",
      preferredTime: restored?.preferredTime || "",
      budgetRange: restored?.budgetRange || "",
      message: restored?.message || (isPrivacyRequest
        ? PRIVACY_REQUEST_MESSAGE
        : ""),
      // 阅读说明不能替代明确同意；往返后始终要求重新勾选。
      privacyConsent: false,
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [receipt, setReceipt] = useState<ConsultationSubmissionReceipt | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [sourceProduct, setSourceProduct] = useState<InquirySourceProduct | null>(null);
  const [productContextStatus, setProductContextStatus] =
    useState<ProductContextStatus>(hasProductReference ? "loading" : "none");
  const [productContextRevision, setProductContextRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const invalidFieldAlignmentCleanupRef = useRef<(() => void) | null>(null);
  const submitPendingRef = useRef(false);
  const submitOperationRef = useRef(0);
  const formOwnerRef = useRef(draftOwner);
  const draftEditedRef = useRef(Boolean(restoredDraft));
  const inquiryContextRef = useRef({ sourceType, rawProductRef });
  const [pendingSubmission, setPendingSubmission] = useState(false);

  useLayoutEffect(() => {
    if (!editorPreview) {
      setPendingSubmission(Boolean(activateContactSubmissionContext(draftOwner, productRef ?? "")));
    }
  }, [draftOwner, editorPreview, productRef]);

  useLayoutEffect(() => {
    if (
      editorPreview || submitted || !draftEditedRef.current || formOwnerRef.current !== draftOwner
      || inquiryContextRef.current.rawProductRef !== rawProductRef
    ) return;
    const { privacyConsent, ...draft } = form;
    saveContactConsultationDraft(draftOwner, draft, productRef ?? "");
  }, [draftOwner, editorPreview, form, productRef, rawProductRef, submitted]);

  useEffect(() => {
    if (editorPreview || formOwnerRef.current === draftOwner) return;
    submitOperationRef.current += 1;
    formOwnerRef.current = draftOwner;
    draftEditedRef.current = false;
    clearContactConsultationDraft();
    submitPendingRef.current = false;
    setSubmitting(false);
    setSubmitted(false);
    setReceipt(null);
    setSubmitError("");
    setErrors({});
    setForm({
      name: savedCustomer?.name || "",
      phone: savedCustomer?.phone || "",
      email: savedCustomer?.email || "",
      consultationType: preselectedConsultationType,
      preferredContact: "电话",
      preferredTime: "",
      budgetRange: "",
      message: isPrivacyRequest
        ? PRIVACY_REQUEST_MESSAGE
        : "",
      privacyConsent: false,
    });
  }, [
    draftOwner,
    editorPreview,
    isPrivacyRequest,
    preselectedConsultationType,
    savedCustomer,
  ]);

  useEffect(() => {
    if (editorPreview) return;
    const previous = inquiryContextRef.current;
    if (
      previous.sourceType === sourceType
      && previous.rawProductRef === rawProductRef
    ) return;

    inquiryContextRef.current = { sourceType, rawProductRef };
    // Contact 路由只改变 query 时不会重挂载。新的业务入口必须成为新的提交会话，
    // 否则旧入口的迟到响应可能把当前入口覆盖成成功或错误状态。
    submitOperationRef.current += 1;
    submitPendingRef.current = false;
    setSubmitting(false);
    setSubmitted(false);
    setReceipt(null);
    setSubmitError("");
    setErrors({});
    if (previous.rawProductRef !== rawProductRef) {
      const draft = readContactConsultationDraft(formOwnerRef.current, productRef ?? "");
      draftEditedRef.current = Boolean(draft);
      if (draft) {
        setForm({ ...draft, privacyConsent: false });
        return;
      }
    }
    if (previous.sourceType !== sourceType) {
      setForm((current) => ({
        ...current,
        consultationType: preselectedConsultationType,
        message: isPrivacyRequest && !current.message.trim()
          ? PRIVACY_REQUEST_MESSAGE
          : previous.sourceType === "privacy" && current.message === PRIVACY_REQUEST_MESSAGE
            ? ""
            : current.message,
      }));
    }
  }, [
    editorPreview,
    isPrivacyRequest,
    preselectedConsultationType,
    productRef,
    rawProductRef,
    sourceType,
  ]);

  useEffect(() => () => {
    submitOperationRef.current += 1;
  }, []);

  useEffect(() => {
    if (editorPreview || !authenticatedCustomer) return;
    // Cookie 会话可能在页面首屏之后才恢复；只补齐仍为空的身份字段，避免覆盖
    // 客户已开始填写或主动修改的内容。
    setForm((current) => ({
      ...current,
      name: current.name || authenticatedCustomer.name || "",
      phone: current.phone || authenticatedCustomer.phone || "",
      email: current.email || authenticatedCustomer.email || "",
    }));
  }, [authenticatedCustomer, editorPreview]);

  useEffect(() => {
    if (editorPreview || embedded) return;
    trackPageView();
  }, [editorPreview, embedded]);

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
    lookupPublicWork(productRef)
      .then((resolution) => {
        if (cancelled) return;
        if (resolution.kind === "virtual") {
          setSourceProduct({
            id: resolution.product.id,
            code: resolution.product.code,
            name: resolution.product.name,
            virtual: true,
          });
          setProductContextStatus("ready");
          return;
        }
        if (resolution.kind === "published") {
          const product = resolution.product;
          if (!product.name?.trim()) {
            setProductContextStatus("unavailable");
            return;
          }
          setSourceProduct({
            id: product.id,
            code: product.code,
            name: product.name,
          });
          setProductContextStatus("ready");
          return;
        }
        setProductContextStatus(resolution.kind === "error" ? "error" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setProductContextStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [editorPreview, hasProductReference, productContextRevision, productRef]);

  useEffect(() => {
    if (submitted) successHeadingRef.current?.focus();
  }, [submitted]);

  useEffect(() => () => invalidFieldAlignmentCleanupRef.current?.(), []);

  const set = <Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key],
  ) => {
    if (key !== "privacyConsent") draftEditedRef.current = true;
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

        invalidFieldAlignmentCleanupRef.current?.();
        target.focus({ preventScroll: true });
        const alignWhileFocused = () => {
          if (document.activeElement !== target) return;
          target.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
        };
        alignWhileFocused();

        let frame = 0;
        const observer = typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(alignWhileFocused);
            });
        if (observer) {
          observer.observe(document.body);
          if (formRef.current) observer.observe(formRef.current);
        }

        const cleanup = () => {
          cancelAnimationFrame(frame);
          observer?.disconnect();
          target.removeEventListener("blur", cleanup);
          if (invalidFieldAlignmentCleanupRef.current === cleanup) {
            invalidFieldAlignmentCleanupRef.current = null;
          }
        };
        invalidFieldAlignmentCleanupRef.current = cleanup;
        target.addEventListener("blur", cleanup, { once: true });

        // 字体是最常见的晚布局来源；ResizeObserver 覆盖其他表单或页面尺寸变化。
        void document.fonts.ready.then(() => {
          frame = requestAnimationFrame(alignWhileFocused);
        });
      });
    });
  };

  const virtualInquiryPrefix = sourceProduct?.virtual
    ? `【演示款式 ${clampProductTitle(sourceProduct.name)} ${sourceProduct.code || ""}】`.trim()
    : "";
  const messageLimit = virtualInquiryPrefix
    ? Math.max(0, 2000 - virtualInquiryPrefix.length - 1)
    : 2000;
  const consultationMessage = () => {
    const body = form.message.trim();
    return virtualInquiryPrefix ? `${virtualInquiryPrefix}\n${body}` : body;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "请输入姓名";
    if (!/^1[3-9]\d{9}$/.test(form.phone.trim()))
      e.phone = "请输入正确的手机号码";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "请输入正确的电子邮箱";
    else if (form.preferredContact === "电子邮件" && !form.email.trim())
      e.email = "选择电子邮件联系时请填写邮箱";
    if (!form.consultationType) e.consultationType = "请选择咨询类型";
    if (!form.message.trim()) e.message = "请描述您的需求";
    else if (form.message.trim().length > messageLimit) e.message = "需求描述不能超过2000个字符";
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
    const operationId = ++submitOperationRef.current;
    const requestOwner = formOwnerRef.current;
    const requestLocation = `${location.pathname}${location.search}`;
    const isCurrentOperation = () =>
      submitOperationRef.current === operationId
      && formOwnerRef.current === requestOwner
      && consultationDraftOwner(useCustomerAuthStore.getState().customer?.id) === requestOwner;
    const canSend = () => isCurrentOperation()
      && `${window.location.pathname}${window.location.search}` === requestLocation;
    submitPendingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    let attemptReserved = false;
    try {
      const submission = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        consultationType: form.consultationType,
        preferredContact: form.preferredContact,
        preferredTime: form.preferredTime || undefined,
        budgetRange: form.budgetRange || undefined,
        productId: sourceProduct?.virtual ? undefined : sourceProduct?.id,
        message: consultationMessage(),
        privacyConsent: form.privacyConsent,
      };
      const fingerprint = await createConsultationSubmissionFingerprint({
        version: 1,
        customerId: authenticatedCustomer?.id ?? null,
        customerName: authenticatedCustomer?.name?.trim() || submission.name,
        customerPhone: authenticatedCustomer?.phone || submission.phone,
        customerEmail:
          authenticatedCustomer?.email?.trim() || submission.email || null,
        productId: submission.productId ?? null,
        consultationType: submission.consultationType || null,
        preferredContact: submission.preferredContact || null,
        preferredTime: submission.preferredTime || null,
        budgetRange: submission.budgetRange || null,
        message: submission.message,
        privacyConsentVersion: PRIVACY_CONSENT_VERSION,
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
      });
      // 摘要计算期间可能已经切换咨询对象、身份或离开页面；失效操作不能再预约或发送。
      if (!canSend()) return;
      const reservation = reserveConsultationSubmissionAttempt(
        "contact",
        requestOwner,
        fingerprint,
      );
      if (reservation.status === "conflict") {
        setPendingSubmission(true);
        setSubmitError(
          "当前内容与一笔结果待确认的咨询不同。为避免重复，请恢复原内容后重试，或先明确放弃恢复。",
        );
        return;
      }
      attemptReserved = true;
      if (reservation.recovered) setPendingSubmission(true);
      if (!canSend()) return;
      const nextReceipt = await runConsultationSubmission(reservation.attempt, async (key) => {
        const response = await inquiriesApi.submit(submission, key);
        const confirmed = parseConsultationSubmissionReceipt(unwrapResponse<unknown>(response));
        if (!confirmed) throw new Error("咨询回执响应不完整");
        return confirmed;
      });
      if (!isCurrentOperation() || `${window.location.pathname}${window.location.search}` !== requestLocation) return;
      clearConsultationSubmissionAttempt("contact", requestOwner);
      setPendingSubmission(false);
      trackSubmitInquiry();
      draftEditedRef.current = false;
      clearContactConsultationDraft(productRef ?? "");
      setReceipt(nextReceipt);
      setSubmitted(true);
    } catch (error) {
      if (!canSend() || isStaleSessionResponseError(error)) return;
      const status = requestStatus(error);
      if (!attemptReserved) {
        setPendingSubmission(false);
        setSubmitError("浏览器暂时无法准备安全提交，请刷新页面后重试。");
        return;
      }
      if (
        sourceProduct
        && requestErrorCode(error) === "INQUIRY_PRODUCT_NOT_AVAILABLE"
      ) {
        clearConsultationSubmissionAttempt("contact", requestOwner);
        setPendingSubmission(false);
        setProductContextStatus("unavailable");
        setSubmitError("作品当前不可咨询，请移除作品后提交普通咨询。");
      } else if (status === 429) {
        setPendingSubmission(true);
        setSubmitError("提交过于频繁，结果待确认；请保持内容不变并稍后重试。");
      } else if (status === 409) {
        setPendingSubmission(true);
        setSubmitError("幂等凭据与既有提交冲突，请先放弃恢复再发起新咨询。");
      } else if (status && status >= 400 && status < 500) {
        clearConsultationSubmissionAttempt("contact", requestOwner);
        setPendingSubmission(false);
        setSubmitError("提交信息未通过校验，请检查后重试。");
      } else {
        setPendingSubmission(true);
        setSubmitError(
          "提交结果待确认。请保持内容不变并重试，系统会复用原请求查回回执。",
        );
      }
    } finally {
      if (isCurrentOperation()) {
        submitPendingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const abandonPendingSubmission = () => {
    clearConsultationSubmissionAttempt("contact", formOwnerRef.current);
    setPendingSubmission(false);
    setSubmitError(
      "已放弃恢复；这不会撤销服务器上可能已生效的咨询。确认确需新建后可再次提交。",
    );
  };

  if (submitted) {
    const SuccessTitle = embedded ? "h2" : "h1";
    return (
      <div
        id={embedded ? "consultation" : undefined}
        className={`contact-success${embedded ? " contact-success--embedded" : ""}`}
      >
        <div className="contact-success__sheet">
          <SuccessTitle
            ref={successHeadingRef}
            tabIndex={-1}
            className="contact-success__title"
          >
            需求已提交
          </SuccessTitle>
          <p>
            我们会根据您提供的联系方式与您联系，具体时间与安排以实际沟通为准。
          </p>
          {receipt ? (
            <dl aria-label="咨询回执">
              <dt>咨询编号</dt>
              <dd>#{receipt.sourceId}</dd>
              <dt>当前状态</dt>
              <dd>{getConsultationSubmissionStatusCopy(receipt.status)}</dd>
              <dt>提交时间</dt>
              <dd>{new Date(receipt.createdAt).toLocaleString("zh-CN")}</dd>
            </dl>
          ) : null}
          <div className="contact-success__actions">
            {authenticatedCustomer && receipt ? (
              <Link
                to={`/customer?section=consultations&leadId=${receipt.leadId}`}
                className="contact-success__primary"
              >
                查看本次咨询
              </Link>
            ) : (
              <Link to="/catalog" className="contact-success__primary">
                浏览作品
              </Link>
            )}
            {authenticatedCustomer && receipt ? (
              <Link to="/catalog" className="contact-success__primary">
                浏览作品
              </Link>
            ) : null}
            <Link to="/" className="contact-success__secondary">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={embedded ? "consultation" : undefined}
      className={`contact-page${embedded ? " contact-page--embedded" : ""}${editorPreview ? " is-editor-preview" : ""}`}
      style={{ background: T.bg }}
    >
      {embedded ? (
        <div className="contact-chapter" style={{ width: "min(1120px, calc(100% - 2 * clamp(20px, 5.55vw, 80px)))", marginInline: "auto", paddingTop: "clamp(48px, 6vw, 80px)", textAlign: "left" }}>
          <h2 style={{ fontFamily: '"Noto Serif SC", "Songti SC", SimSun, serif', fontSize: "clamp(24px, 2.5vw, 32px)", fontWeight: 400, color: T.txt, margin: "0 0 12px", lineHeight: 1.35 }}>
            预约咨询
          </h2>
          <p style={{ fontSize: 16, color: T.sec, margin: 0, maxWidth: "36em", lineHeight: 1.75 }}>
            告诉我们感兴趣的作品或服务。方便联系的时间只是偏好，不是已确认的预约；顾问会再与您确认。
          </p>
        </div>
      ) : null}
      {hasPageDecoration && !embedded ? <h1 className="sr-only">{taskHeading}</h1> : null}
      {/* ═══ 标题区（紧凑） ═══ */}
      {!hasPageDecoration && !embedded && <section className="contact-request-masthead">
        <div className="contact-request-masthead__inner">
          <h1>{taskHeading}</h1>
          <p className="contact-request-masthead__name">预约咨询</p>
          <p>您可提交选款、定制或旧款相关需求；具体服务内容与安排以实际沟通为准。</p>
        </div>
      </section>}

      {/* ═══ 主体：主任务左60%，支持信息右40% ═══ */}
      <section style={{ paddingBlock: embedded ? "clamp(20px,3vh,32px) clamp(36px,5vh,64px)" : "clamp(36px,5vh,64px)" }}>
        <div
          className="contact-grid"
          style={embedded ? {
            width: "min(1120px, calc(100% - 2 * clamp(20px, 5.55vw, 80px)))",
            marginInline: "auto",
            display: "block",
          } : {
            maxWidth: MW,
            marginInline: "auto",
            paddingInline: PX,
            display: "grid",
            gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)",
            gap: "clamp(32px,5vw,64px)",
          }}
        >
          {/* 主任务：咨询表单 */}
          <div className="contact-request">
            {isPrivacyRequest && (
              <section
                className="contact-privacy-note"
                aria-labelledby="privacy-request-title"
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
              >
                {productContextStatus === "loading" && (
                  <p role="status" style={{ margin: 0, color: T.sec, fontSize: 13 }}>
                    正在确认来源作品…
                  </p>
                )}
                {productContextStatus === "ready" && sourceProduct && (
                  <div>
                    <p style={{ margin: "0 0 4px", color: T.light, fontSize: 13, letterSpacing: 0 }}>
                      本次咨询作品
                    </p>
                    <strong style={{ display: "block", color: T.txt, fontSize: 15, fontWeight: 500 }}>
                      {clampProductTitle(sourceProduct.name)}
                    </strong>
                    <p style={{ margin: "4px 0 12px", color: T.sec, fontSize: 12 }}>
                      款号：{sourceProduct.code || "未提供"}
                    </p>
                    {sourceProduct.virtual ? (
                      <p style={{ margin: "0 0 12px", color: T.sec, fontSize: 13, lineHeight: 1.7 }}>
                        演示款式，不是在售作品。顾问会按这个款式名称了解需求。
                      </p>
                    ) : null}
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
              className="contact-form contact-form--quiet"
              aria-busy={submitting}
              onSubmit={handleSubmit}
              noValidate
            >
              <fieldset disabled={submitting} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
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
              <div style={{ marginBottom: 14 }}>
                <label style={lblS} htmlFor="cf-email">
                  电子邮箱（选填）
                </label>
                <input
                  id="cf-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? ERROR_IDS.email : undefined}
                  style={{
                    ...inputS,
                    borderColor: errors.email ? "#8C3F3B" : T.line,
                  }}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="用于电子邮件联系（选填）"
                  maxLength={100}
                />
                {errors.email && (
                  <p
                    id={ERROR_IDS.email}
                    style={{
                      fontSize: 11,
                      color: "#8C3F3B",
                      margin: "2px 0 0",
                    }}
                  >
                    {errors.email}
                  </p>
                )}
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
                    onChange={(e) => {
                      set("preferredContact", e.target.value);
                      if (e.target.value !== "电子邮件" && errors.email) {
                        setErrors((current) => {
                          const next = { ...current };
                          delete next.email;
                          return next;
                        });
                      }
                    }}
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
                    方便联系的时间（选填）
                  </label>
                  <select
                    id="cf-time"
                    style={selS}
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
                  maxLength={2000}
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
                  className="contact-privacy-consent"
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
                      state={{
                        privacyReturnTo: (() => {
                          const query = new URLSearchParams(location.search);
                          query.set("view", "request");
                          return `${location.pathname}?${query.toString()}`;
                        })(),
                      }}
                      className="contact-privacy-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveContactConsultationDraft(draftOwner, {
                          name: form.name,
                          phone: form.phone,
                          email: form.email,
                          consultationType: form.consultationType,
                          preferredContact: form.preferredContact,
                          preferredTime: form.preferredTime,
                          budgetRange: form.budgetRange,
                          message: form.message,
                        }, productRef ?? "");
                      }}
                      style={{ color: T.txt, textDecoration: "underline" }}
                    >
                      隐私说明
                    </Link>
                    ，提交的姓名、电话、选填邮箱和需求仅用于预约联系与服务处理。
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
              {pendingSubmission && (
                <div
                  role="status"
                  style={{
                    border: `1px solid ${T.line}`,
                    background: T.bg,
                    padding: "12px 14px",
                    marginBottom: 12,
                    fontSize: 12,
                    color: T.sec,
                    lineHeight: 1.7,
                  }}
                >
                  <p style={{ margin: "0 0 8px" }}>
                    存在一笔结果待确认的咨询。保持原内容再次提交可安全查回原回执；新建前请先明确放弃恢复。
                  </p>
                  <button
                    type="button"
                    onClick={abandonPendingSubmission}
                    style={{
                      minHeight: 44,
                      border: 0,
                      padding: "0 8px",
                      background: "transparent",
                      color: T.txt,
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    放弃恢复并准备新建
                  </button>
                </div>
              )}
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
                  background: submitting || (hasProductReference && productContextStatus !== "ready") ? T.sec : T.txt,
                  color: "#fff",
                  fontSize: 14,
                  letterSpacing: 0,
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
              </fieldset>
            </form>
          </div>

          {/* 聚焦表单页保留服务说明；同页联系已在上方展示微信和电话，不再并列一条侧栏。 */}
          {embedded ? null : <div className="contact-support">
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
                      fontFamily: '"Noto Serif SC", "Songti SC", SimSun, serif',
                      fontSize: 18,
                      fontWeight: 400,
                      color: T.txt,
                      margin: "0 0 4px",
                    }}
                  >
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
            {embedded ? null : <>
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
              <PublicContactDetails resource={contactResource} preview={editorPreview} />
            </div>
            </>}
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
          </div>}
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section
        style={{
          padding: "clamp(28px,4vh,48px) 0 clamp(48px,7vh,80px)",
          borderTop: `1px solid ${T.line}`,
        }}
      >
        <div className="contact-faq" style={embedded ? {
          width: "min(1120px, calc(100% - 2 * clamp(20px, 5.55vw, 80px)))",
          marginInline: "auto",
        } : { maxWidth: MW, marginInline: "auto", paddingInline: PX }}>
          <h2
            style={{
              fontFamily: '"Noto Serif SC", "Songti SC", SimSun, serif',
              fontSize: "clamp(24px, 2.5vw, 32px)",
              fontWeight: 400,
              lineHeight: 1.35,
              color: T.txt,
              margin: "0 0 24px",
            }}
          >
            常见问题
          </h2>
          <div className="contact-faq__list">
            {FAQS.map((faq) => (
              <details key={faq.q} className="contact-faq__item">
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
          <ul className="contact-assurances" aria-label="服务说明">
            <li>微信与电话可直接联系</li>
            <li>咨询会生成可跟进的服务记录</li>
            <li>到店接待以本页地址与服务时间为准</li>
            <li>保养与售后是否承接，以实际评估为准</li>
          </ul>
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

        .contact-privacy-link:focus-visible {
          outline: 2px solid ${T.txt};
          outline-offset: 2px;
        }

        .contact-form input:focus-visible,
        .contact-form select:focus-visible,
        .contact-form textarea:focus-visible {
          outline: 2px solid #181A1B;
          outline-offset: 2px;
        }

        @media (max-width: 900px) {
          .contact-grid { grid-template-columns: 1fr !important; }
          .contact-row { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 720px) {
          .contact-privacy-consent {
            min-height: 44px;
          }
        }

        /* 触控目标补强在 1440px 以下生效：390 移动门禁与 1280 小桌面（多为
           触控本）隐私链路门禁均要求 ≥44px；1440 宽桌面保持内联文本尺寸
           （≤24px 门禁）。 */
        @media (max-width: 1439px) {
          .contact-privacy-link {
            display: inline-flex;
            min-width: 44px;
            min-height: 44px;
            align-items: center;
            justify-content: center;
            margin-block: -14px;
            vertical-align: middle;
          }
        }
      `}</style>
    </div>
  );
}
