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
import { settingsApi, uploadApi } from "@/services/api";
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

function hasSiteContent(values: SiteContentValues | null): values is SiteContentValues {
  if (!values) return false;
  return SITE_CONTENT_FIELDS.some((field) => {
    const value = values[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export default function SiteContent() {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const defaultLocale = Form.useWatch("defaultLocale", form);
  const publishedLocales = Form.useWatch("publishedLocales", form);
  const [searchParams] = useSearchParams();
  const [loadState, setLoadState] = useState<SiteContentLoadState>("loading");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadedValues, setLoadedValues] = useState<SiteContentValues>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [readiness, setReadiness] = useState<SitePublicationReadiness | null>(null);
  const [readinessState, setReadinessState] = useState<"loading" | "ready" | "error">("loading");
  const readinessRequestRef = useRef(0);
  const savingRef = useRef(false);

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
      const data = unwrapResponse<SiteContentValues | null>(res);
      setLoadedValues({
        ...data,
        brandPresentationMode: data?.brandPresentationMode === "logo" || data?.brandPresentationMode === "text-only"
          ? data.brandPresentationMode : undefined,
      });
      setLoadState(hasSiteContent(data) ? "ready" : "empty");
      void loadReadiness();
    } catch (error) {
      setLoadError(error);
      setLoadState("error");
    }
  }, [loadReadiness]);

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

  const saveCurrentValues = async (): Promise<boolean> => {
    if (savingRef.current) return false;
    if (loadState !== "empty" && loadState !== "ready") {
      message.error("店铺资料尚未成功加载，请重试后再保存。");
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const values = await form.validateFields();
      await settingsApi.updateSettings(values);
      setLoadedValues(values);
      setLoadState(hasSiteContent(values) ? "ready" : "empty");
      setDirty(false);
      message.success("店铺资料已保存");
      void loadReadiness();
      return true;
    } catch (error) {
      // 校验失败由 antd 字段内提示；提交失败保持留在页面等待重试。
      if (!hasFormErrorFields(error)) {
        message.error(
          getSafeAdminErrorMessage(error, "店铺资料保存失败，请检查填写内容后重试。"),
        );
      } else {
        const invalid = ((error as { errorFields: Array<{ name?: string[] }> }).errorFields)[0]?.name?.[0];
        const field = getSitePublicationField(invalid ?? null);
        if (field) focusField(field);
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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

  const canEdit = loadState === "empty" || loadState === "ready";

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
                  ? "表单仍可编辑和保存。准备度尚未确认，请重新检查后再返回装修页发布。"
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
                <Button size="small" loading={readinessState === "loading"} disabled={saving}
                  onClick={() => void loadReadiness()}>重新检查发布准备度</Button>
                <Link to="/admin/editor/home" style={{ marginLeft: 12 }}>返回店铺装修</Link>
              </>}
            />
          </section>
          <Form
            name="site-content"
            form={form}
            disabled={saving}
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
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="400-xxx-xxxx" />
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
          <Form.Item name="businessHours" label="营业时间">
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
