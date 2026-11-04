import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Alert,
  Card,
  Form,
  Input,
  Button,
  Upload,
  Radio,
  App as AntdApp,
} from "antd";
import { SaveOutlined, UploadOutlined } from "@ant-design/icons";
import { settingsApi, uploadApi, type PageMediaAsset, type StoredPageMediaAsset } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import type { SitePublicationReadiness } from "@/services/clients/settingsClient";
import { unwrapResponse } from "@/utils/unwrap";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminLoadingState,
  AdminEmptyState,
  AdminErrorState,
} from "@/components/common/AdminDataStates";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { getSitePublicationField, SITE_PUBLICATION_FIELD_LABELS } from "@/constants/sitePublicationFields";
import UnsavedChangesGuard from "../HomepageConfig/components/UnsavedChangesGuard";
import { resolveManagedTemplateMediaPreviewUrl } from "@/page-builder/template-definition/managedMediaPreview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFormErrorFields(error: unknown): boolean {
  return isRecord(error) && Array.isArray(error.errorFields);
}

type SiteContentLoadState = "loading" | "empty" | "ready" | "error";

interface SiteContentValues {
  siteName?: string;
  siteDescription?: string;
  logo?: string;
  brandPresentationMode?: "logo" | "text-only";
  brandReviewReference?: string;
  legalEntityReviewReference?: string;
  privacyPolicyReviewReference?: string;
  seoReviewReference?: string;
  canonicalBaseUrl?: string;
  defaultLocale?: string;
  publishedLocales?: string[];
  contactPhone?: string;
  contactWechat?: string;
  contactWechatQrCode?: string;
  contactEmail?: string;
  contactAddress?: string;
  storeName?: string;
  businessHours?: string;
  storeMapUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
}

const SITE_CONTENT_FIELDS: ReadonlyArray<keyof SiteContentValues> = [
  "siteName",
  "siteDescription",
  "logo",
  "brandPresentationMode",
  "brandReviewReference",
  "legalEntityReviewReference",
  "privacyPolicyReviewReference",
  "seoReviewReference",
  "canonicalBaseUrl",
  "defaultLocale",
  "publishedLocales",
  "contactPhone",
  "contactWechat",
  "contactWechatQrCode",
  "contactEmail",
  "contactAddress",
  "storeName",
  "businessHours",
  "storeMapUrl",
  "seoTitle",
  "seoDescription",
  "seoKeywords",
];

function validateCanonicalBaseUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return true;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && Boolean(url.hostname)
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isContactQrCodeReference(value: unknown): value is string {
  return typeof value === "string" && (value === ""
    || /^\/uploads\/page-assets\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)
    || /^\/api\/upload\/public-media\/[1-9]\d*$/.test(value));
}

function hasSiteContent(values: SiteContentValues | null): values is SiteContentValues {
  if (!values) return false;
  return SITE_CONTENT_FIELDS.some((field) => {
    const value = values[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function projectSiteContentResource(value: unknown): SiteContentValues {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error("站点资料响应无效");
  const projected: SiteContentValues = {};
  for (const field of SITE_CONTENT_FIELDS) {
    const fieldValue = value[field];
    if (fieldValue === undefined) continue;
    if (field === "publishedLocales") {
      if (!Array.isArray(fieldValue) || fieldValue.some((locale) => typeof locale !== "string")) {
        throw new Error("站点公开语言响应无效");
      }
      projected.publishedLocales = [...fieldValue];
      continue;
    }
    if (field === "brandPresentationMode") {
      if (fieldValue === "") continue;
      if (fieldValue !== "logo" && fieldValue !== "text-only") {
        throw new Error("站点品牌展示方式响应无效");
      }
      projected.brandPresentationMode = fieldValue;
      continue;
    }
    if (typeof fieldValue !== "string") {
      throw new Error(`站点资料字段 ${field} 响应无效`);
    }
    projected[field] = fieldValue;
  }
  return projected;
}

function readSiteContentResponse(response: unknown): SiteContentValues {
  return projectSiteContentResource(unwrapResponse<unknown>(response));
}

export default function SiteContent() {
  const { message, modal } = AntdApp.useApp();
  const role = useAuthStore((state) => state.user?.role);
  const [form] = Form.useForm();
  const defaultLocale = Form.useWatch("defaultLocale", form);
  const publishedLocales = Form.useWatch("publishedLocales", form);
  const wechatQrCode = Form.useWatch("contactWechatQrCode", form) as string | undefined;
  const [qrUploading, setQrUploading] = useState(false);
  const [qrPreviewFailed, setQrPreviewFailed] = useState(false);
  const [qrAssetId, setQrAssetId] = useState<number | null>(null);
  const [qrPublic, setQrPublic] = useState<boolean | null>(null);
  const [qrLookupState, setQrLookupState] = useState<"idle" | "loading" | "missing">("idle");
  const [authorizingQr, setAuthorizingQr] = useState(false);
  const qrLookupSeq = useRef(0);
  const [searchParams] = useSearchParams();
  const [loadState, setLoadState] = useState<SiteContentLoadState>("loading");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadedValues, setLoadedValues] = useState<SiteContentValues>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [readiness, setReadiness] = useState<SitePublicationReadiness | null>(null);
  const [readinessState, setReadinessState] = useState<"loading" | "ready" | "error">("loading");
  const [saveReadbackPending, setSaveReadbackPending] = useState(false);
  const [saveReadbackLoading, setSaveReadbackLoading] = useState(false);
  const readinessRequestRef = useRef(0);
  const savingRef = useRef(false);

  const applyPersistedSettings = useCallback((values: SiteContentValues) => {
    setLoadedValues(values);
    form.setFieldsValue(Object.fromEntries(
      SITE_CONTENT_FIELDS.map((field) => [field, values[field]]),
    ));
    setLoadState(hasSiteContent(values) ? "ready" : "empty");
    setDirty(false);
  }, [form]);

  const loadReadiness = useCallback(async () => {
    const requestId = ++readinessRequestRef.current;
    setReadinessState("loading");
    try {
      const result = unwrapResponse<SitePublicationReadiness>(await settingsApi.getPublicationReadiness());
      if (!result || result.schemaVersion !== 2 || typeof result.ready !== "boolean"
        || typeof result.persisted !== "boolean" || !["READY", "BLOCKED"].includes(result.status)
        || !Array.isArray(result.blockers)
        || result.blockers.some((blocker) => !blocker || typeof blocker.field !== "string"
          || typeof blocker.code !== "string" || typeof blocker.message !== "string")
        || result.ready !== (result.status === "READY" && result.persisted && result.blockers.length === 0)) {
        throw new Error("发布准备度响应无效");
      }
      if (requestId !== readinessRequestRef.current) return;
      setReadiness(result);
      setReadinessState("ready");
    } catch {
      if (requestId === readinessRequestRef.current) setReadinessState("error");
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await settingsApi.getSettings();
      applyPersistedSettings(readSiteContentResponse(res));
      setSaveReadbackPending(false);
      void loadReadiness();
    } catch (error) {
      setLoadError(error);
      setLoadState("error");
    }
  }, [applyPersistedSettings, loadReadiness]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (loadState !== "empty" && loadState !== "ready") return;
    // 显式清空本页缺失字段；避免 resetFields 重挂载输入框打断跨页字段聚焦。
    form.setFieldsValue(Object.fromEntries(SITE_CONTENT_FIELDS.map((field) => [field, loadedValues[field]])));
    setDirty(false);
  }, [form, loadedValues, loadState]);

  const focusField = useCallback((field: keyof SiteContentValues) => {
    if (field === "defaultLocale" || field === "publishedLocales") {
      const section = document.getElementById(`site-content-${field}-section`);
      section?.scrollIntoView({ block: "center", behavior: "smooth" });
      section?.focus({ preventScroll: true });
      return;
    }
    if (field === "logo") {
      document.getElementById("site-content-logo-upload")?.focus();
      return;
    }
    form.scrollToField(field, { block: "center", behavior: "smooth", focus: true });
    const control = document.getElementById(`site-content_${field}`);
    (control?.matches("input,textarea,button") ? control : control?.querySelector<HTMLElement>("input,button"))?.focus();
  }, [form]);

  const requestedField = getSitePublicationField(searchParams.get("field"));
  useEffect(() => {
    if (!requestedField || (loadState !== "empty" && loadState !== "ready")) return;
    const frame = window.requestAnimationFrame(() => focusField(requestedField));
    return () => window.cancelAnimationFrame(frame);
  }, [focusField, loadState, requestedField]);

  // 浏览器刷新/关闭同样拦截未保存修改；SPA 路由拦截由 UnsavedChangesGuard 承担。
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const retrySaveReadback = useCallback(async () => {
    if (!saveReadbackPending || saveReadbackLoading) return;
    setSaveReadbackLoading(true);
    try {
      const response = await settingsApi.getSettings();
      applyPersistedSettings(readSiteContentResponse(response));
      setSaveReadbackPending(false);
      message.success("已重新读取保存结果");
      void loadReadiness();
    } catch {
      readinessRequestRef.current += 1;
      setReadinessState("error");
    } finally {
      setSaveReadbackLoading(false);
    }
  }, [applyPersistedSettings, loadReadiness, message, saveReadbackLoading, saveReadbackPending]);

  const saveCurrentValues = async (): Promise<boolean> => {
    if (savingRef.current || qrUploading) return false;
    if (loadState !== "empty" && loadState !== "ready") {
      message.error("店铺资料尚未成功加载，请重试后再保存。");
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    let values: SiteContentValues;
    try {
      values = await form.validateFields();
    } catch (error) {
      const invalid = hasFormErrorFields(error)
        ? ((error as { errorFields: Array<{ name?: string[] }> }).errorFields)[0]?.name?.[0]
        : undefined;
      const field = getSitePublicationField(invalid ?? null);
      if (field) focusField(field);
      savingRef.current = false;
      setSaving(false);
      return false;
    }

    let writeResponse: unknown;
    try {
      writeResponse = await settingsApi.updateSettings(values);
    } catch (error) {
      message.error(
        getSafeAdminErrorMessage(error, "店铺资料保存失败，请检查填写内容后重试。"),
      );
      savingRef.current = false;
      setSaving(false);
      return false;
    }

    let writeResource: SiteContentValues;
    try {
      writeResource = readSiteContentResponse(writeResponse);
    } catch {
      // PUT 已明确成功时不得再次写入；若响应异常，先保留已校验的提交值，随后只用 GET 核验。
      writeResource = projectSiteContentResource(values);
    }

    try {
      const readbackResponse = await settingsApi.getSettings();
      applyPersistedSettings(readSiteContentResponse(readbackResponse));
      setSaveReadbackPending(false);
      message.success("店铺资料已保存");
      void loadReadiness();
    } catch {
      applyPersistedSettings(writeResource);
      setSaveReadbackPending(true);
      readinessRequestRef.current += 1;
      setReadiness(null);
      setReadinessState("error");
      message.warning("店铺资料已保存，但重新读取与发布准备度确认暂时失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    return true;
  };

  const onFinish = async () => {
    await saveCurrentValues();
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const res = await uploadApi.uploadImage(file);
      const data = unwrapResponse<{ url: string }>(res);
      if (data?.url) {
        form.setFieldsValue({ logo: data.url });
        // setFieldsValue 不触发 onValuesChange，Logo 上传后手动标记未保存状态
        setDirty(true);
        message.success("Logo 已上传，保存后生效");
      }
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "Logo 上传失败，请检查文件格式和网络后重试。"));
    }
    return false; // 阻止默认上传行为
  };

  useEffect(() => {
    if (!wechatQrCode || !isContactQrCodeReference(wechatQrCode)) {
      setQrAssetId(null);
      setQrPublic(null);
      setQrLookupState("idle");
      return;
    }
    const publicMediaId = /^\/api\/upload\/public-media\/([1-9]\d*)$/.exec(wechatQrCode);
    if (publicMediaId) {
      setQrAssetId(Number(publicMediaId[1]));
      setQrPublic(true);
      setQrLookupState("idle");
      return;
    }
    const requestId = qrLookupSeq.current + 1;
    qrLookupSeq.current = requestId;
    setQrLookupState("loading");
    void (async () => {
      try {
        let match: PageMediaAsset | undefined;
        let page = 1;
        let total = 0;
        do {
          const response = await uploadApi.listPageMedia({ page, pageSize: 100, type: "image" });
          const data = unwrapResponse<{ list?: PageMediaAsset[]; total?: number }>(response);
          if (qrLookupSeq.current !== requestId) return;
          const batch = data.list ?? [];
          total = data.total ?? 0;
          match = batch.find((item) => item.url === wechatQrCode);
          if (match || batch.length === 0) break;
          page += 1;
        } while ((page - 1) * 100 < total && page <= 5);
        if (!match?.id) {
          setQrAssetId(null);
          setQrPublic(false);
          setQrLookupState("missing");
          return;
        }
        setQrAssetId(match.id);
        setQrPublic(match.publicEligibility?.eligible === true);
        setQrLookupState("idle");
      } catch {
        if (qrLookupSeq.current !== requestId) return;
        setQrAssetId(null);
        setQrPublic(false);
        setQrLookupState("missing");
      }
    })();
  }, [wechatQrCode]);

  const confirmQrPublicUse = () => {
    if (!qrAssetId || authorizingQr) return;
    modal.confirm({
      title: "确认这张加好友码可公开使用？",
      content: "请仅在你已核实这是公司微信的加好友码、拥有公开网站使用权，并愿意以当前账号留下审核记录时继续。确认后，刷新联系页即可看到二维码。",
      okText: "确认并公开",
      cancelText: "取消",
      onOk: async () => {
        setAuthorizingQr(true);
        try {
          await uploadApi.authorizeMediaPublicUse(qrAssetId, true);
          qrLookupSeq.current += 1;
          setQrPublic(true);
          message.success("这张加好友码已可在联系页显示。请刷新联系页查看。");
        } catch (error) {
          message.error(getSafeAdminErrorMessage(error, "公开确认失败。请稍后重试，或到页面素材里完成授权。"));
          throw error;
        } finally {
          setAuthorizingQr(false);
        }
      },
    });
  };

  const handleWechatQrUpload = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      message.error("请选择不超过 10MB 的 PNG、JPEG、WebP 或 GIF 图片。");
      return;
    }
    setQrUploading(true);
    try {
      const data = unwrapResponse<StoredPageMediaAsset>(await uploadApi.uploadImage(file));
      if (!data?.url || !isContactQrCodeReference(data.url)) throw new Error("二维码素材地址无效");
      form.setFieldsValue({ contactWechatQrCode: data.url });
      qrLookupSeq.current += 1;
      setQrAssetId(data.id);
      setQrPublic(data.publicEligibility?.eligible === true);
      setQrLookupState("idle");
      setQrPreviewFailed(false);
      setDirty(true);
      message.success(data.publicEligibility?.eligible
        ? "加好友码已上传。保存店铺资料后，刷新联系页即可看到。"
        : "加好友码已上传，但还不能公开展示。请先确认可公开使用，再保存。");
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "微信加好友码上传失败，请检查图片和网络后重试。"));
    } finally {
      setQrUploading(false);
    }
  };

  useEffect(() => { setQrPreviewFailed(false); }, [wechatQrCode]);

  const canEdit = (loadState === "empty" || loadState === "ready") && !saveReadbackPending && !qrUploading;

  return (
    <div>
      <AdminPageHeader
        title="店铺资料与品牌设置"
        subtitle="管理客户可见的店铺信息与全站默认 SEO"
      />
      {loadState === "loading" ? (
        <AdminLoadingState subject="店铺资料" />
      ) : loadState === "error" ? (
        <AdminErrorState
          subject="店铺资料"
          error={loadError}
          context="load"
          message="店铺资料读取失败。为避免覆盖未知的远端内容，当前已禁止编辑和保存。"
          onRetry={() => void loadSettings()}
        />
      ) : (
        <>
          {loadState === "empty" ? (
            <AdminEmptyState
              subject="店铺资料"
              message="当前尚未配置店铺资料。填写下方表单并保存后，将用于网站页眉、页脚和默认 SEO。"
            />
          ) : null}
          <Alert
            type="info"
            showIcon
            message="这些资料会用于网站页眉、页脚、联系入口及浏览器默认搜索信息。"
            style={{ maxWidth: 680, marginBottom: 20 }}
          />
          {saveReadbackPending ? (
            <Alert
              type="warning"
              showIcon
              message="店铺资料已保存，但重新读取与发布准备度确认暂时失败"
              description="当前显示保存接口返回的权威结果。为避免重复写入，资料编辑已暂停；重新读取只会查询服务端，不会再次保存。"
              action={(
                <Button
                  size="small"
                  loading={saveReadbackLoading}
                  onClick={() => void retrySaveReadback()}
                >
                  重新读取已保存资料
                </Button>
              )}
              style={{ maxWidth: 680, marginBottom: 20 }}
            />
          ) : null}
          <section aria-label="站点发布准备度" style={{ maxWidth: 680, marginBottom: 20 }}>
            <Alert
              showIcon
              type={readinessState === "error" ? "warning" : readinessState === "loading" || dirty || !readiness?.ready ? "info" : "success"}
              message={readinessState === "loading" ? "正在检查已保存的站点资料…"
                : readinessState === "error" ? "暂时无法读取发布准备度"
                  : dirty ? "有未保存修改，保存后重新检查发布准备度"
                    : readiness?.ready ? "站点资料已满足发布要求" : `站点资料还有 ${readiness?.blockers.length ?? 0} 项待完善`}
              description={<>
                <p>{readinessState === "error"
                  ? saveReadbackPending
                    ? "保存已成功，但当前还无法确认服务端回读和发布准备度。请先重新读取已保存资料。"
                    : "表单仍可编辑和保存。准备度尚未确认，请重新检查后再返回装修页发布。"
                  : "检查结果只针对已保存的站点资料；页面内容仍需在装修页单独检查并发布。"}</p>
                {readinessState === "ready" && readiness && !readiness.ready ? <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
                  {readiness.blockers.map((blocker) => {
                    const field = getSitePublicationField(blocker.field);
                    return <li key={`${blocker.code}:${blocker.field}`}>
                      <span>{blocker.message}</span>
                      {field ? <Button type="link" size="small" onClick={() => focusField(field)}>
                        完善{SITE_PUBLICATION_FIELD_LABELS[field]}
                      </Button> : null}
                    </li>;
                  })}
                </ul> : null}
                <Button size="small" loading={readinessState === "loading"} disabled={saving || saveReadbackPending}
                  onClick={() => void loadReadiness()}>重新检查发布准备度</Button>
                <Link to="/admin/editor/home" style={{ marginLeft: 12 }}>返回店铺装修</Link>
              </>}
            />
          </section>
          <Form
            name="site-content"
            form={form}
            disabled={saving || saveReadbackPending}
            onFinish={onFinish}
            onValuesChange={() => setDirty(true)}
            scrollToFirstError={{ block: "center", focus: true }}
            layout="vertical"
            style={{ maxWidth: 680 }}
          >
        <Card
          title="品牌基础信息"
          style={{
            borderRadius: 10,
            border: "1px solid var(--adm-line)",
            boxShadow: "0 6px 20px rgba(24,26,27,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="siteName" label="网站名称">
            <Input placeholder="海川珠宝" />
          </Form.Item>
          <Form.Item name="siteDescription" label="网站描述">
            <Input.TextArea
              rows={2}
              placeholder="品牌简介，用于浏览器默认描述"
            />
          </Form.Item>
          <Form.Item name="brandPresentationMode" label={SITE_PUBLICATION_FIELD_LABELS.brandPresentationMode}
            extra="默认使用网站名称；选择正式 Logo 模式后需上传品牌标识。">
            <Radio.Group>
              <Radio value="logo">正式 Logo</Radio>
              <Radio value="text-only">纯文字品牌名称</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="brandReviewReference" label={SITE_PUBLICATION_FIELD_LABELS.brandReviewReference}
            extra="选填，记录品牌负责人已确认的编号或批准版本，不影响页面发布。"
            rules={[{ max: 200, message: "品牌审核记录不能超过 200 个字符" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="网站 Logo">
            <Form.Item name="logo" noStyle>
              <Input type="hidden" />
            </Form.Item>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                handleLogoUpload(file);
                return false;
              }}
            >
              <Button id="site-content-logo-upload" icon={<UploadOutlined />}>上传 Logo</Button>
            </Upload>
          </Form.Item>
        </Card>

        <Card
          title="联系方式"
          style={{
            borderRadius: 10,
            border: "1px solid var(--adm-line)",
            boxShadow: "0 6px 20px rgba(24,26,27,0.035)",
            marginBottom: 20,
          }}
        >
          <p>保存后立即出现在前台联系页。全站网址或搜索信息未完成时，这些联系方式仍会公开。</p>
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="400-xxx-xxxx" />
          </Form.Item>
          <Form.Item
            name="contactWechat"
            label="公司微信号"
            extra="选填。保存后立即出现在前台联系页；请使用获准公开的公司微信号。"
            normalize={(value: string) => value.trim()}
            rules={[{ max: 100, message: "公司微信号不能超过 100 个字符" }]}
          >
            <Input maxLength={100} placeholder="填写公司微信号，留空则不展示微信渠道" />
          </Form.Item>
          <Form.Item
            label="微信加好友二维码"
            extra="请上传公司微信提供的加好友码，非付款码。上传后需要先确认可公开使用，再保存；未确认前联系页不会显示这张图。"
          >
            <Form.Item name="contactWechatQrCode" noStyle rules={[{
              validator: async (_, value: unknown) => {
                if (value === undefined || isContactQrCodeReference(value)) return;
                throw new Error("请上传本站受控的二维码图片");
              },
            }]}><Input type="hidden" /></Form.Item>
            {wechatQrCode && isContactQrCodeReference(wechatQrCode) ? (
              <div style={{ marginBottom: 12 }}>
                {qrPreviewFailed ? <p role="status">二维码预览暂不可用，请在媒体库核对图片；您仍可替换或清空。</p> : (
                  <img src={resolveManagedTemplateMediaPreviewUrl(wechatQrCode)} alt="公司微信加好友二维码预览"
                    width={160} height={160} style={{ display: "block", objectFit: "contain", background: "var(--adm-surface)" }}
                    onError={() => setQrPreviewFailed(true)} />
                )}
              </div>
            ) : null}
            <Upload accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false}
              disabled={qrUploading} beforeUpload={(file) => { void handleWechatQrUpload(file); return false; }}>
              <Button aria-label={wechatQrCode ? "替换加好友码" : "上传加好友码"}
                loading={qrUploading} icon={<UploadOutlined aria-hidden="true" />}>{wechatQrCode ? "替换加好友码" : "上传加好友码"}</Button>
            </Upload>
            {wechatQrCode ? <Button disabled={qrUploading || authorizingQr} style={{ marginLeft: 8 }} onClick={() => {
              form.setFieldsValue({ contactWechatQrCode: "" });
              setDirty(true);
            }}>清空加好友码</Button> : null}
            <Link to="/admin/media" style={{ marginLeft: 12 }}>前往页面素材</Link>
            {wechatQrCode && isContactQrCodeReference(wechatQrCode) ? (
              <div style={{ marginTop: 12 }}>
                {qrLookupState === "loading" ? <p>正在核对这张图能否在联系页显示…</p> : null}
                {qrPublic ? <p>这张图已允许在联系页公开显示。若刚刚更换过图片，请先保存，再刷新联系页。</p> : null}
                {qrPublic === false && qrLookupState !== "loading" ? (
                  <>
                    <p role="status">图片已经上传，但还没有公开授权，所以联系页不会出现二维码。</p>
                    {role === "SUPER_ADMIN" && qrAssetId ? (
                      <Button loading={authorizingQr} onClick={confirmQrPublicUse}>确认可在联系页公开</Button>
                    ) : (
                      <p>请由超级管理员在本页确认公开，或前往页面素材完成授权。</p>
                    )}
                    {qrLookupState === "missing" ? <p>没有在最近的页面素材里找到这张图。请重新上传一次。</p> : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </Form.Item>
          <Form.Item name="contactEmail" label="联系邮箱">
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item name="contactAddress" label="公司地址">
            <Input placeholder="详细地址" />
          </Form.Item>
        </Card>

        <Card
          title="营业信息"
          style={{
            borderRadius: 10,
            border: "1px solid var(--adm-line)",
            boxShadow: "0 6px 20px rgba(24,26,27,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="storeName" label="门店名称">
            <Input placeholder="用于门店信息模块；未配置时不会把网站名称直接当作实体门店" />
          </Form.Item>
          <Form.Item name="businessHours" label="营业时间" extra="保存后立即出现在前台联系页。">
            <Input placeholder="周一至周日 10:00-22:00" />
          </Form.Item>
          <Form.Item
            name="storeMapUrl"
            label="门店地图链接"
            extra="仅支持以 http:// 或 https:// 开头的高德、百度等地图分享链接"
            rules={[
              {
                validator: async (_, value) => {
                  const normalized = typeof value === "string" ? value.trim() : "";
                  if (!normalized || /^https?:\/\//i.test(normalized)) return;
                  throw new Error("请输入以 http:// 或 https:// 开头的地图链接");
                },
              },
            ]}
          >
            <Input placeholder="https://..." />
          </Form.Item>
        </Card>

        <Card title="主体与隐私审核" style={{ marginBottom: 20 }}>
          <Form.Item name="legalEntityReviewReference" label={SITE_PUBLICATION_FIELD_LABELS.legalEntityReviewReference}
            extra="填写法务或内容负责人复核经营主体公开信息的记录编号。"
            rules={[{ max: 200, message: "经营主体审核记录不能超过 200 个字符" }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="privacyPolicyReviewReference" label={SITE_PUBLICATION_FIELD_LABELS.privacyPolicyReviewReference}
            extra="填写已批准的隐私说明版本或审核记录编号。"
            rules={[{ max: 200, message: "隐私说明审核记录不能超过 200 个字符" }]}>
            <Input maxLength={200} />
          </Form.Item>
        </Card>

        <Card title="中文发布设置" style={{ marginBottom: 20 }}>
          <Form.Item name="defaultLocale" hidden><Input type="hidden" /></Form.Item>
          <Form.Item name="publishedLocales" hidden><Input type="hidden" /></Form.Item>
          <div id="site-content-defaultLocale-section" tabIndex={-1} aria-label="默认语言设置">
            <p>默认语言：{defaultLocale === "zh-CN" ? "简体中文（zh-CN）" : typeof defaultLocale === "string" && defaultLocale ? defaultLocale : "尚未配置"}</p>
          </div>
          <div id="site-content-publishedLocales-section" tabIndex={-1} aria-label="公开语言设置">
            <p>公开语言：{Array.isArray(publishedLocales) && publishedLocales.length > 0
              ? publishedLocales.map((locale: unknown) => locale === "zh-CN" ? "简体中文（zh-CN）" : String(locale)).join("、")
              : "尚未配置"}</p>
          </div>
          <p>当前公开内容支持简体中文。恢复设置只修改当前表单，保存后生效。</p>
          {defaultLocale !== "zh-CN" || !Array.isArray(publishedLocales) || publishedLocales.length !== 1 || publishedLocales[0] !== "zh-CN" ? (
            <Button onClick={() => {
              form.setFieldsValue({ defaultLocale: "zh-CN", publishedLocales: ["zh-CN"] });
              setDirty(true);
            }}>恢复中文发布设置</Button>
          ) : null}
        </Card>

        <Card
          title="SEO 默认设置"
          style={{
            borderRadius: 10,
            border: "1px solid var(--adm-line)",
            boxShadow: "0 6px 20px rgba(24,26,27,0.035)",
            marginBottom: 20,
          }}
        >
          <Form.Item name="seoTitle" label="默认页面标题">
            <Input placeholder="海川珠宝" />
          </Form.Item>
          <Form.Item name="seoDescription" label="默认页面描述">
            <Input.TextArea rows={3} placeholder="描述文字" />
          </Form.Item>
          <Form.Item name="seoKeywords" label="默认关键词">
            <Input placeholder="珠宝,首饰,黄金" />
          </Form.Item>
          <Form.Item name="canonicalBaseUrl" label={SITE_PUBLICATION_FIELD_LABELS.canonicalBaseUrl}
            extra="填写 HTTPS 域名，例如 https://www.example.com；不包含页面路径、查询参数或片段。"
            normalize={(value: string) => value.trim()}
            rules={[{ max: 500, message: "正式站点网址不能超过 500 个字符" }, {
              validator: async (_, value) => {
                if (!validateCanonicalBaseUrl(value)) throw new Error("请输入仅包含域名的 HTTPS 网址，不要附带页面路径或参数");
              },
            }]}>
            <Input maxLength={500} inputMode="url" />
          </Form.Item>
          <Form.Item name="seoReviewReference" label={SITE_PUBLICATION_FIELD_LABELS.seoReviewReference}
            extra="填写内容负责人对默认标题、描述和正式站点网址的批准版本或审核记录编号。"
            rules={[{ max: 200, message: "搜索信息审核记录不能超过 200 个字符" }]}>
            <Input maxLength={200} />
          </Form.Item>
        </Card>

        <Button
          type="primary"
          htmlType="submit"
          loading={saving}
          disabled={!canEdit}
          icon={<SaveOutlined />}
          style={{
            height: 44,
            paddingInline: 32,
          }}
        >
          保存设置
        </Button>
          </Form>
        </>
      )}
      <UnsavedChangesGuard
        hasUnsavedChanges={dirty}
        disabled={!canEdit}
        onSaveAndLeave={saveCurrentValues}
        subject="店铺资料"
      />
    </div>
  );
}
