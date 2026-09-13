import { useCallback, useEffect, useState } from "react";
import {
  App as AntdApp,
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined, EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { FormInstance } from "antd";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import {
  productApi,
  quotationApi,
  userApi,
  type IssueQuotationInput,
  type QuotationIssueCustomerPage,
  type QuotationIssueDesignFile,
  type QuotationIssueFeeRule,
  type QuotationIssueOptions,
  type QuotationIssueResourceBucket,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { useAuthStore } from "@/store/authStore";
import type {
  PaginatedResult,
  Product,
  ProductSKU,
  QuoteChannel,
  Quotation,
  QuotationStatus,
  QuotationVersion,
  WaxType,
} from "@/types";
import QuotationConfigurationDrawer from "./QuotationConfigurationDrawer";

const { Text } = Typography;

// 报价状态映射
const STATUS_META: Record<QuotationStatus, { c: string; t: string }> = {
  DRAFT: { c: "default", t: "草稿" },
  PENDING_CONFIRM: { c: "gold", t: "待客户确认" },
  CONFIRMED: { c: "blue", t: "已确认" },
  EXPIRED: { c: "default", t: "已失效" },
  CANCELLED: { c: "red", t: "已取消" },
  CONVERTED: { c: "green", t: "已转订单" },
};

const STATUS_TABS: Array<{ k: "all" | QuotationStatus; l: string }> = [
  { k: "all", l: "全部" },
  { k: "DRAFT", l: "草稿" },
  { k: "PENDING_CONFIRM", l: "待确认" },
  { k: "CONFIRMED", l: "已确认" },
  { k: "CONVERTED", l: "已转单" },
  { k: "CANCELLED", l: "已取消" },
];

const STAFF_ACTION_NOTICE =
  "报价只能由所属客户在账户中心确认，并由服务端在同一事务内创建订单。后台员工不能代确认或直接转单。";

const CHANNEL_META: Record<QuoteChannel, string> = {
  RETAIL: "标准零售",
  CUSTOM: "高级定制",
  PARTNER_WAX: "合作蜡模",
};

const VERSION_STATUS_META: Record<string, string> = {
  DRAFT: "草稿",
  ISSUED: "已发出",
  ACCEPTED: "客户已接受",
  SUPERSEDED: "已被新版本替代",
  EXPIRED: "已过期",
  CANCELLED: "已取消",
};

type QuotationDetailItem = {
  id: number;
  productId?: number | null;
  skuId?: number | null;
  productName: string;
  productImage?: string | null;
  spec?: string;
  quantity: number;
  unitPrice: number;
  quotedPrice: number;
  subtotal: number;
  waxType?: WaxType | null;
  pricingSnapshot?: Record<string, unknown> | null;
  product?: { id: number; name: string; code: string } | null;
  sku?: { id: number; skuCode: string } | null;
};

type QuotationDetail = Quotation & {
  items?: QuotationDetailItem[];
  customer?: { id: number; name?: string; phone: string; email?: string } | null;
  salesConsultant?: { id: number; realName?: string; username: string } | null;
  convertedOrder?: { id: number; orderNo: string; status: string } | null;
};

interface ItemFormValue {
  productName: string;
  productImage?: string;
  spec?: string;
  skuId?: number;
  productId?: number;
  quantity: number;
  unitPrice: number;
  quotedPrice: number;
  waxType?: WaxType;
}

interface QuotationFormValues {
  customerId: number;
  channel: QuoteChannel;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  salesConsultantId?: number;
  remark?: string;
  depositAmount?: number;
  validUntil?: Dayjs;
  items: ItemFormValue[];
}

interface IssueQuotationFormValues {
  designFileVersionId?: number;
  waxType?: WaxType;
  feeRuleIds?: number[];
  resourceRequirements?: Array<{
    resourceBucketId: number;
    requiredQuantity: number;
  }>;
}

type ProductSearchResult = Pick<Product, "id" | "name" | "code">;
type SkuSearchResult = Pick<
  ProductSKU,
  "id" | "isActive" | "material" | "size" | "skuCode" | "price"
>;

function currentQuotationVersion(
  quotation: QuotationDetail | null,
): QuotationVersion | null {
  if (!quotation) return null;
  if (quotation.currentVersionRecord) return quotation.currentVersionRecord;
  return quotation.versions?.find(
    (version) => version.version === quotation.currentVersion,
  ) ?? quotation.versions?.[0] ?? null;
}

function isLegacyQuotationVersion(version: QuotationVersion | null): boolean {
  return Boolean(version && (version.snapshotSchemaVersion ?? 1) < 2);
}

/** 报价商品行：关联商品 + SKU 两级选择器，选中后自动填充行内字段 */
function LinkedSkuSelector({
  fieldName,
  form,
  initialProductId,
  initialProductName,
  initialSkuId,
  initialSkuSpec,
}: {
  fieldName: number;
  form: FormInstance<QuotationFormValues>;
  initialProductId?: number;
  initialProductName?: string;
  initialSkuId?: number;
  initialSkuSpec?: string;
}) {
  // 编辑回显：挂载时以已保存的关联商品/SKU 初始化，避免选择器空白误导重新选择
  const [productOptions, setProductOptions] = useState<
    { value: number; label: string; name: string }[]
  >(
    initialProductId && initialProductName
      ? [
          {
            value: initialProductId,
            label: initialProductName,
            name: initialProductName,
          },
        ]
      : [],
  );
  const [productId, setProductId] = useState<number | null>(
    initialProductId ?? null,
  );
  const [skuOptions, setSkuOptions] = useState<
    { value: number; label: string; price: number; spec: string }[]
  >(
    initialSkuId && initialSkuSpec
      ? [{ value: initialSkuId, label: initialSkuSpec, price: 0, spec: initialSkuSpec }]
      : [],
  );
  const [skuId, setSkuId] = useState<number | null>(initialSkuId ?? null);
  const [productSearching, setProductSearching] = useState(false);
  const [skuLoading, setSkuLoading] = useState(false);

  const searchProducts = async (kw: string) => {
    if (!kw) { setProductOptions([]); return; }
    setProductSearching(true);
    try {
      const res = await productApi.getList({ keyword: kw, page: 1, pageSize: 20 });
      const data = unwrapResponse<{ list?: ProductSearchResult[] }>(res);
      setProductOptions((data?.list || []).map((p) => ({
        value: p.id,
        label: `${p.name} · ${p.code || ""}`.trim(),
        name: p.name,
      })));
    } catch {
      setProductOptions([]);
    } finally {
      setProductSearching(false);
    }
  };

  const selectProduct = async (pid: number) => {
    const opt = productOptions.find((p) => p.value === pid);
    setProductId(pid);
    form.setFieldValue(["items", fieldName, "productId"], pid);
    form.setFieldValue(["items", fieldName, "productName"], opt?.name || "");
    setSkuLoading(true);
    try {
      const res = await productApi.getSkus(pid);
      const list = unwrapResponse<SkuSearchResult[]>(res) || [];
      setSkuOptions(
        list.filter((s) => s.isActive).map((s) => ({
          value: s.id,
          label: `${[s.material, s.size, s.skuCode].filter(Boolean).join(" · ")}（¥${Number(s.price || 0)}）`,
          price: Number(s.price || 0),
          spec: [s.material, s.size].filter(Boolean).join(" "),
        })),
      );
    } catch {
      setSkuOptions([]);
    } finally {
      setSkuLoading(false);
    }
  };

  const selectSku = (selectedSkuId: number) => {
    const opt = skuOptions.find((s) => s.value === selectedSkuId);
    setSkuId(selectedSkuId);
    form.setFieldValue(["items", fieldName, "skuId"], selectedSkuId);
    if (opt) {
      form.setFieldValue(["items", fieldName, "spec"], opt.spec);
      form.setFieldValue(["items", fieldName, "unitPrice"], opt.price);
      form.setFieldValue(["items", fieldName, "quotedPrice"], opt.price);
    }
  };

  return (
    <div className="space-y-1">
      <Select
        showSearch
        filterOption={false}
        onSearch={searchProducts}
        loading={productSearching}
        placeholder="搜索并关联商品（按名称/货号）"
        size="small"
        style={{ width: "100%" }}
        value={productId || undefined}
        onChange={(v) => {
          if (!v) { setProductId(null); setSkuOptions([]); setSkuId(null); }
        }}
        onSelect={(v) => void selectProduct(v as number)}
        options={productOptions}
        allowClear
        notFoundContent={productSearching ? "搜索中…" : "输入关键字搜索商品"}
      />
      {productId && (
        <Select
          placeholder="选择 SKU"
          size="small"
          style={{ width: "100%" }}
          loading={skuLoading}
          value={skuId ?? undefined}
          onSelect={(v) => selectSku(v as number)}
          options={skuOptions}
          notFoundContent={skuLoading ? "正在加载商品规格…" : "该商品暂无可用 SKU"}
        />
      )}
    </div>
  );
}

export default function QuotationManage() {
  const { message, modal } = AntdApp.useApp();
  const role = useAuthStore((state) => state.user?.role);
  const canConfigure = role === "SUPER_ADMIN" || role === "ADMIN";
  const [list, setList] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<"all" | QuotationStatus>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | QuoteChannel>("all");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<unknown | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<QuotationFormValues>();
  const selectedChannel = Form.useWatch("channel", form) ?? "CUSTOM";
  const [issueForm] = Form.useForm<IssueQuotationFormValues>();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuingId, setIssuingId] = useState<number | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueOptionsLoading, setIssueOptionsLoading] = useState(false);
  const [feeRuleOptions, setFeeRuleOptions] = useState<QuotationIssueFeeRule[]>([]);
  const [resourceBucketOptions, setResourceBucketOptions] = useState<QuotationIssueResourceBucket[]>([]);
  const [designFileOptions, setDesignFileOptions] = useState<QuotationIssueDesignFile[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<Array<{
    value: number;
    label: string;
    name: string;
    phone: string;
    email?: string;
    accountType: "MEMBER" | "PARTNER";
    partnerStatus: string;
  }>>([]);
  // 销售顾问选项：从人员接口加载（与订单中心改派顾问同一来源），替代手填内部 ID
  const [consultantOptions, setConsultantOptions] = useState<
    { value: number; label: string }[]
  >([]);

  const loadConsultants = async () => {
    if (consultantOptions.length > 0) return;
    try {
      const res = await userApi.getAssignable();
      const users =
        unwrapResponse<Array<{ id: number; name: string; role: string }>>(res) ||
        [];
      setConsultantOptions(
        users
          .filter(
            (u) =>
              u.role === "SALES_CONSULTANT" ||
              u.role === "ADMIN" ||
              u.role === "SUPER_ADMIN",
          )
          .map((u) => ({ value: u.id, label: u.name })),
      );
    } catch {
      setConsultantOptions([]);
    }
  };

  const searchCustomers = async (keyword: string) => {
    if (!keyword.trim()) {
      setCustomerOptions([]);
      return;
    }
    setCustomerSearching(true);
    try {
      const response = await quotationApi.searchIssueCustomers({
        keyword: keyword.trim(),
        pageSize: 20,
      });
      const data = unwrapResponse<QuotationIssueCustomerPage>(response);
      setCustomerOptions((data?.list ?? []).map((customer) => ({
        value: customer.id,
        label: `${customer.name || "未命名客户"} · ${customer.phone}`,
        name: customer.name || "未命名客户",
        phone: customer.phone,
        email: customer.email || undefined,
        accountType: customer.accountType,
        partnerStatus: customer.partnerStatus,
      })));
    } catch {
      setCustomerOptions([]);
    } finally {
      setCustomerSearching(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await quotationApi.getList({
        page, pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
        channel: channelFilter !== "all" ? channelFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<Quotation>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch (error: unknown) {
      setLoadError(error);
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, channelFilter, keyword]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await quotationApi.getById(id);
      setDetail(unwrapResponse<QuotationDetail>(res));
    } catch (e: unknown) {
      setDetailError(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async (id: number) => {
    try {
      const res = await quotationApi.getById(id);
      setDetail(unwrapResponse<QuotationDetail>(res));
    } catch { /* 保留现有详情 */ }
  };

  // 后台员工可发出、修订或取消报价，但不能代客户确认。
  const changeStatus = (record: Quotation, action: "cancel", label: string, danger = false) => {
    modal.confirm({
      title: `确认${label}该报价单？`,
      content: record.convertedOrderId ? "该报价单已转订单，操作需谨慎。" : undefined,
      okText: `确认${label}`,
      okButtonProps: { danger },
      onOk: async () => {
        try {
          await quotationApi[action](record.id);
          message.success(`已${label}`);
          void load();
          if (detail?.id === record.id) void reloadDetail(record.id);
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, "报价单状态更新失败，请重新加载后确认当前状态。"));
        }
      },
    });
  };

  const openIssue = async (record: Quotation) => {
    setIssuingId(record.id);
    issueForm.resetFields();
    setIssueOpen(true);
    setIssueOptionsLoading(true);
    try {
      const response = await quotationApi.getIssueOptions(record.id);
      const options = unwrapResponse<QuotationIssueOptions>(response);
      setFeeRuleOptions(
        options?.feeRules.filter(
          (rule) => rule.channel === (record.channel ?? "CUSTOM"),
        ) ?? [],
      );
      setResourceBucketOptions(
        options?.resourceBuckets.filter(
          (bucket) => bucket.channel === (record.channel ?? "CUSTOM"),
        ) ?? [],
      );
      setDesignFileOptions(options?.designFiles ?? []);
    } catch (error: unknown) {
      setFeeRuleOptions([]);
      setResourceBucketOptions([]);
      setDesignFileOptions([]);
      message.error(
        getSafeAdminErrorMessage(
          error,
          "报价配置加载失败，请稍后重新加载再发出报价。",
        ),
      );
    } finally {
      setIssueOptionsLoading(false);
    }
  };

  const handleIssue = async () => {
    if (issuingId === null) return;
    let values: IssueQuotationFormValues;
    try {
      values = await issueForm.validateFields();
    } catch {
      return;
    }
    const payload: IssueQuotationInput = {
      designFileVersionId: values.designFileVersionId,
      waxType: values.waxType,
      feeRuleIds: values.feeRuleIds,
      resourceRequirements: values.resourceRequirements,
    };
    setIssuing(true);
    try {
      await quotationApi.issue(issuingId, payload);
      message.success("报价已发出，等待客户本人确认");
      setIssueOpen(false);
      setIssuingId(null);
      issueForm.resetFields();
      await load();
      if (detailId === issuingId) await reloadDetail(issuingId);
    } catch (error: unknown) {
      message.error(
        getSafeAdminErrorMessage(
          error,
          "报价发出失败，请核对客户、费项、资源与文件后重试。",
        ),
      );
    } finally {
      setIssuing(false);
    }
  };

  const createRevision = (record: Quotation) => {
    Modal.confirm({
      title: `修订报价“${record.quoteNo}”？`,
      content:
        "当前已发出版本将标记为已被新版本替代，客户不能再确认旧版本。系统将创建新的报价草稿。",
      okText: "创建修订版",
      cancelText: "取消",
      onOk: async () => {
        try {
          await quotationApi.revise(record.id);
          message.success("报价修订草稿已创建");
          await load();
          if (detailId === record.id) await reloadDetail(record.id);
        } catch (error: unknown) {
          message.error(
            getSafeAdminErrorMessage(
              error,
              "报价修订失败，请重新加载当前版本后再试。",
            ),
          );
        }
      },
    });
  };

  const handleRemove = (record: Quotation) => {
    Modal.confirm({
      title: "确认删除该报价单？",
      content: "仅草稿/已取消状态可删除，删除后不可恢复。",
      okText: "确认删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await quotationApi.remove(record.id);
          message.success("报价单已删除");
          void load();
          if (detail?.id === record.id) {
            setDetail(null);
            setDetailId(null);
            setDetailError(null);
          }
        } catch (e: unknown) {
          message.error(getSafeAdminErrorMessage(e, "报价单删除失败，请重新加载后确认当前状态。"));
        }
      },
    });
  };

  const openEdit = async (record: Quotation) => {
    try {
      const res = await quotationApi.getById(record.id);
      const data = unwrapResponse<QuotationDetail>(res);
      if (data.customer?.id) {
        setCustomerOptions([{
          value: data.customer.id,
          label: `${data.customer.name || data.customerName} · ${data.customer.phone}`,
          name: data.customer.name || data.customerName,
          phone: data.customer.phone,
          email: data.customer.email,
          accountType: data.channel === "PARTNER_WAX" ? "PARTNER" : "MEMBER",
          partnerStatus: data.channel === "PARTNER_WAX" ? "APPROVED" : "NONE",
        }]);
      }
      form.setFieldsValue({
        customerId: data.customer?.id ?? data.customerId ?? undefined,
        channel: data.channel ?? "CUSTOM",
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || undefined,
        salesConsultantId: data.salesConsultantId || undefined,
        remark: data.remark || undefined,
        depositAmount: data.depositAmount ? Number(data.depositAmount) : undefined,
        validUntil: data.validUntil ? dayjs(data.validUntil) : undefined,
        items: (data.items || []).map((it) => ({
          productName: it.productName,
          spec: it.spec,
          skuId: it.skuId ?? undefined,
          productId: it.productId ?? undefined,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          quotedPrice: Number(it.quotedPrice),
          waxType: it.waxType ?? undefined,
        })),
      });
      setEditingId(record.id);
      void loadConsultants();
      setCreateOpen(true);
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "报价单详情加载失败，请稍后重试。"));
    }
  };

  const handleSave = async () => {
    let values: QuotationFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        customerId: values.customerId,
        channel: values.channel,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail || undefined,
        salesConsultantId: values.salesConsultantId || undefined,
        remark: values.remark || undefined,
        depositAmount: values.depositAmount || 0,
        validUntil: values.validUntil ? values.validUntil.toISOString() : undefined,
        items: values.items.map((it) => ({
          productName: it.productName,
          productImage: it.productImage || undefined,
          spec: it.spec || undefined,
          skuId: it.skuId || undefined,
          productId: it.productId || undefined,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          quotedPrice: it.quotedPrice,
          waxType: it.waxType,
        })),
      };
      if (editingId) {
        await quotationApi.update(editingId, payload);
        message.success("报价单已更新");
      } else {
        await quotationApi.create(payload);
        message.success("报价单已创建（草稿）");
      }
      setCreateOpen(false);
      form.resetFields();
      setEditingId(null);
      void load();
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, editingId ? "报价单更新失败，请检查填写内容后重试。" : "报价单创建失败，请检查填写内容后重试。"));
    } finally {
      setSubmitting(false);
    }
  };

  const hasQuotationFilters = statusFilter !== "all" || channelFilter !== "all" || Boolean(keyword);
  const issuingQuotation = list.find((quotation) => quotation.id === issuingId)
    ?? (detail?.id === issuingId ? detail : null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="报价管理"
        subtitle="管理报价草稿、客户确认提交、取消与历史订单关联。"
        extra={(
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            {canConfigure ? <Button onClick={() => setConfigurationOpen(true)}>报价配置</Button> : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); void loadConsultants(); setCreateOpen(true); }}>新建报价</Button>
          </Space>
        )}
      />

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s.k}
            onClick={() => { setStatusFilter(s.k); setPage(1); }}
            type="button"
            className={`px-4 py-2 text-sm border transition-all ${statusFilter === s.k ? "border-brand-gold text-brand-gold" : "border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold"}`}
          >
            {s.l}
          </button>
        ))}
      </div>

      <Card className="!bg-white !border-brand-line" size="small">
        <Space wrap>
          <Input.Search
            placeholder="搜索报价单号、客户姓名或手机号"
            value={keywordInput}
            onChange={(e) => {
              setKeywordInput(e.target.value);
              if (e.target.value === "" && keyword) {
                setKeyword("");
                setPage(1);
              }
            }}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
            className="w-72"
            allowClear
          />
          <Select
            aria-label="筛选报价渠道"
            value={channelFilter}
            onChange={(value) => {
              setChannelFilter(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "全部渠道" },
              ...Object.entries(CHANNEL_META).map(([value, label]) => ({ value, label })),
            ]}
            className="w-36"
          />
        </Space>
      </Card>

      {loadError ? (
        <AdminErrorState
          subject="报价单"
          error={loadError}
          onRetry={() => void load()}
        />
      ) : loading && list.length === 0 ? (
        <AdminLoadingState subject="报价单" />
      ) : (
        <Card className="!bg-white !border-brand-line">
          <Table
            dataSource={list}
            rowKey="id"
            loading={loading}
            size="middle"
            pagination={{
              current: page, pageSize, total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
            locale={{
              emptyText: hasQuotationFilters
                ? "没有符合当前筛选条件的报价单"
                : "暂无报价单；可新建报价草稿并提交客户确认",
            }}
            columns={[
              { title: "报价单号", dataIndex: "quoteNo", render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
              { title: "渠道", dataIndex: "channel", width: 100, render: (v: QuoteChannel | undefined) => CHANNEL_META[v ?? "CUSTOM"] },
              { title: "版本", dataIndex: "currentVersion", width: 70, render: (v: number | undefined) => v ? `V${v}` : "V1" },
              { title: "客户", dataIndex: "customerName", render: (v: string, r: Quotation) => <div><p>{v}</p><p className="text-xs text-brand-muted">{r.customerPhone}</p></div> },
              { title: "原价合计", dataIndex: "totalAmount", width: 110, render: (v: number) => <span className="text-brand-muted">¥{Number(v).toLocaleString()}</span> },
              { title: "报价合计", dataIndex: "finalAmount", width: 110, render: (v: number) => <span className="text-brand-gold font-medium">¥{Number(v).toLocaleString()}</span> },
              { title: "建议定金", dataIndex: "depositAmount", width: 100, render: (v: number) => v ? `¥${Number(v).toLocaleString()}` : "—" },
              { title: "有效期", dataIndex: "validUntil", width: 110, render: (v: string) => v ? dayjs(v).format("YYYY-MM-DD") : "—" },
              { title: "状态", dataIndex: "status", width: 100, render: (v: QuotationStatus) => <Tag color={STATUS_META[v]?.c}>{STATUS_META[v]?.t}</Tag> },
              { title: "创建时间", dataIndex: "createdAt", render: (v: string) => <span className="text-brand-muted text-xs">{v ? dayjs(v).format("YYYY-MM-DD HH:mm") : ""}</span> },
              {
                title: "操作", width: 260, render: (_: unknown, r: Quotation) => (
                  <Space>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
                    {r.status === "DRAFT" && (
                      <Button size="small" onClick={() => void openEdit(r)}>编辑</Button>
                    )}
                    {r.status === "DRAFT" && (
                      <Button size="small" type="primary" onClick={() => void openIssue(r)}>发出报价</Button>
                    )}
                    {r.status === "PENDING_CONFIRM" && (
                      <>
                        <Button size="small" onClick={() => createRevision(r)}>创建修订版</Button>
                        <Text type="secondary" className="!text-xs">
                          员工不能代确认或转单；请等待客户操作
                        </Text>
                      </>
                    )}
                    {r.status === "CONFIRMED" && (
                      <Text type="secondary" className="!text-xs">历史版本只读；员工不能代转单</Text>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* 报价详情抽屉 */}
      <Drawer
        open={detailId !== null}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
          setDetailError(null);
        }}
        width="min(680px, calc(100vw - 16px))"
        title="报价单详情"
      >
        {detailLoading && !detail ? (
          <AdminLoadingState subject="报价单详情" compact />
        ) : detailError ? (
          <AdminErrorState
            subject="报价单详情"
            error={detailError}
            onRetry={detailId === null ? undefined : () => void openDetail(detailId)}
          />
        ) : detail ? (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">报价摘要</h3>
                <Tag color={STATUS_META[detail.status]?.c}>{STATUS_META[detail.status]?.t}</Tag>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><Text type="secondary">报价单号：</Text><code className="text-brand-gold">{detail.quoteNo}</code></div>
                <div><Text type="secondary">报价渠道：</Text>{CHANNEL_META[detail.channel ?? "CUSTOM"]}</div>
                <div><Text type="secondary">当前版本：</Text>V{detail.currentVersion ?? currentQuotationVersion(detail)?.version ?? 1}</div>
                <div><Text type="secondary">销售顾问：</Text>{detail.salesConsultant?.realName || detail.salesConsultant?.username || "—"}</div>
                <div><Text type="secondary">客户：</Text>{detail.customerName}</div>
                <div><Text type="secondary">手机号：</Text>{detail.customerPhone}</div>
                <div><Text type="secondary">邮箱：</Text>{detail.customerEmail || "—"}</div>
                <div><Text type="secondary">有效期：</Text>{detail.validUntil ? dayjs(detail.validUntil).format("YYYY-MM-DD") : "—"}</div>
                <div><Text type="secondary">原价合计：</Text>¥{Number(detail.totalAmount).toLocaleString()}</div>
                <div><Text type="secondary">报价合计：</Text><span className="text-brand-gold font-medium">¥{Number(detail.finalAmount).toLocaleString()}</span></div>
                <div><Text type="secondary">优惠：</Text>¥{Number(detail.discountAmount).toLocaleString()}</div>
                <div><Text type="secondary">建议定金：</Text>¥{Number(detail.depositAmount).toLocaleString()}</div>
                {detail.convertedOrder && <div className="col-span-2"><Text type="secondary">已转订单：</Text><code className="text-xs text-brand-gold">{detail.convertedOrder.orderNo}</code></div>}
                {detail.remark && <div className="col-span-2"><Text type="secondary">备注：</Text>{detail.remark}</div>}
              </div>
            </div>

            {currentQuotationVersion(detail) ? (
              <div className="space-y-3">
                <h3 className="font-semibold">版本与成交条件</h3>
                {isLegacyQuotationVersion(currentQuotationVersion(detail)) ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="旧版报价仅供查看"
                    description="该报价使用 v1 快照，不能引导客户确认。请复制报价或创建修订版，并按 v2 重新发出。"
                  />
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <Text type="secondary">版本状态：</Text>
                    {VERSION_STATUS_META[currentQuotationVersion(detail)!.status] ?? currentQuotationVersion(detail)!.status}
                  </div>
                  <div>
                    <Text type="secondary">快照版本：</Text>
                    v{currentQuotationVersion(detail)!.snapshotSchemaVersion ?? 1}
                  </div>
                  <div>
                    <Text type="secondary">价格来源：</Text>
                    {currentQuotationVersion(detail)!.pricingSource?.label ?? "以版本明细快照为准"}
                  </div>
                  <div>
                    <Text type="secondary">费用合计：</Text>
                    ¥{Number(currentQuotationVersion(detail)!.feeAmount ?? 0).toLocaleString("zh-CN")}
                  </div>
                </div>

                {currentQuotationVersion(detail)!.designFileVersion ? (
                  <Alert
                    type={currentQuotationVersion(detail)!.designFileVersion!.status === "CONFIRMED" ? "success" : "warning"}
                    showIcon
                    message={`3D 文件 V${currentQuotationVersion(detail)!.designFileVersion!.version} · ${VERSION_STATUS_META[currentQuotationVersion(detail)!.designFileVersion!.status] ?? currentQuotationVersion(detail)!.designFileVersion!.status}`}
                    description={currentQuotationVersion(detail)!.designFileVersion!.confirmedWaxWeight != null
                      ? `已记录确认蜡重 ${Number(currentQuotationVersion(detail)!.designFileVersion!.confirmedWaxWeight).toFixed(3)} 克。内部生产重量不在客户报价中展示。`
                      : [
                          currentQuotationVersion(detail)!.designFileVersion!.redWaxWeight != null
                            ? `红蜡 ${Number(currentQuotationVersion(detail)!.designFileVersion!.redWaxWeight).toFixed(3)} 克`
                            : null,
                          currentQuotationVersion(detail)!.designFileVersion!.purpleWaxWeight != null
                            ? `紫蜡 ${Number(currentQuotationVersion(detail)!.designFileVersion!.purpleWaxWeight).toFixed(3)} 克`
                            : null,
                        ].filter(Boolean).join("；") || "尚未形成可成交的客户确认蜡重。"}
                  />
                ) : detail.channel === "PARTNER_WAX" ? (
                  <Alert type="warning" showIcon message="尚未关联 3D 文件版本" description="合作蜡模报价发出前必须关联客户可确认的文件版本和蜡种。" />
                ) : null}

                <Table
                  rowKey="id"
                  dataSource={currentQuotationVersion(detail)!.feeLines ?? []}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: "当前版本没有费用行" }}
                  columns={[
                    { title: "费用", dataIndex: "displayText" },
                    { title: "计费方式", dataIndex: "calculationMethod", width: 110, render: (value: string) => ({ FIXED: "固定费用", PER_GRAM: "按克", PER_ORDER: "每单" }[value] ?? value) },
                    { title: "金额", dataIndex: "amount", width: 100, render: (value: number | string) => `¥${Number(value).toLocaleString("zh-CN")}` },
                  ]}
                />

                <Table
                  rowKey="id"
                  dataSource={(currentQuotationVersion(detail)!.resourceRequirements ?? []).map((requirement, index) => ({
                    ...requirement,
                    id: requirement.id ?? index,
                    kind: requirement.kind ?? requirement.resourceBucket?.kind,
                    code: requirement.code ?? requirement.resourceBucket?.code,
                    displayName: requirement.displayName ?? requirement.resourceBucket?.displayName,
                    unit: requirement.unit ?? requirement.resourceBucket?.unit,
                  }))}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: detail.channel === "RETAIL" ? "标准零售使用 SKU 库存门禁" : "尚未配置产能或材料要求" }}
                  columns={[
                    { title: "资源", dataIndex: "displayName", render: (value: string | null, row) => value || row.code },
                    { title: "类型", dataIndex: "kind", width: 90, render: (value: string) => value === "CAPACITY" ? "产能" : "材料" },
                    { title: "需求", dataIndex: "requiredQuantity", width: 120, render: (value: number | string, row) => `${Number(value).toFixed(3)} ${row.unit}` },
                    { title: "状态", dataIndex: "readiness", width: 90, render: (value: string | undefined) => value === "READY" ? "可用" : value === "INSUFFICIENT" ? "不足" : value ? "不可用" : "确认时复核" },
                  ]}
                />

                {detail.versions && detail.versions.length > 1 ? (
                  <div>
                    <Text type="secondary">历史版本：</Text>
                    <Space wrap className="mt-2">
                      {detail.versions.map((version) => (
                        <Tag key={version.id}>
                          V{version.version} · {VERSION_STATUS_META[version.status] ?? version.status}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <h3 className="font-semibold mb-2">报价商品</h3>
              <Table
                rowKey="id"
                dataSource={detail.items || []}
                pagination={false}
                size="small"
                locale={{ emptyText: "无商品" }}
                columns={[
                  {
                    title: "商品", dataIndex: "productName", render: (name: string, r: QuotationDetailItem) => (
                      <div className="flex items-center gap-2">
                        {r.productImage && <img src={r.productImage} alt="" className="w-10 h-10 object-cover rounded" />}
                        <div>
                          <p className="text-sm">{name}</p>
                          <p className="text-xs text-brand-muted">{r.spec || "—"}{r.sku ? ` · ${r.sku.skuCode}` : ""}{r.skuId ? "" : " · 未关联SKU"}</p>
                        </div>
                      </div>
                    ),
                  },
                  { title: "数量", dataIndex: "quantity", width: 60 },
                  { title: "原价", dataIndex: "unitPrice", width: 90, render: (v: number) => `¥${Number(v).toLocaleString()}` },
                  { title: "报价", dataIndex: "quotedPrice", width: 90, render: (v: number) => <span className="text-brand-gold">¥{Number(v).toLocaleString()}</span> },
                  { title: "小计", dataIndex: "subtotal", width: 100, render: (v: number) => <span className="text-brand-gold">¥{Number(v).toLocaleString()}</span> },
                ]}
              />
            </div>

            {/* 操作区 */}
            {(detail.status === "PENDING_CONFIRM" || detail.status === "CONFIRMED") &&
              !isLegacyQuotationVersion(currentQuotationVersion(detail)) && (
              <Alert
                type="info"
                showIcon
                message="客户确认与转单暂不可由员工操作"
                description={STAFF_ACTION_NOTICE}
              />
            )}
            <div className="flex gap-2 flex-wrap border-t border-brand-line pt-4">
              {detail.status === "DRAFT" && (
                <Button type="primary" onClick={() => void openIssue(detail)}>
                  {isLegacyQuotationVersion(currentQuotationVersion(detail)) ? "按 v2 发出报价" : "发出报价"}
                </Button>
              )}
              {detail.status === "PENDING_CONFIRM" && (
                <>
                  <Button onClick={() => createRevision(detail)}>创建修订版</Button>
                  <Button onClick={() => changeStatus(detail, "cancel", "取消")}>取消报价</Button>
                </>
              )}
              {(detail.status === "DRAFT" || detail.status === "CANCELLED") && (
                <Button danger onClick={() => handleRemove(detail)}>删除报价单</Button>
              )}
            </div>
          </div>
        ) : (
          <AdminEmptyState subject="报价单详情" />
        )}
      </Drawer>

      {/* 新建报价 Modal */}
      <Modal
        title={editingId ? "编辑报价单" : "新建报价单"}
        open={createOpen}
        onCancel={() => {
          // 已有编辑时确认放弃，避免误触取消直接丢失填写的报价内容
          if (form.isFieldsTouched()) {
            Modal.confirm({
              title: "放弃未保存的报价内容？",
              content: "弹窗关闭后本次填写的客户与商品行将丢失。",
              okText: "放弃修改",
              okButtonProps: { danger: true },
              cancelText: "继续编辑",
              onOk: () => { setCreateOpen(false); setEditingId(null); form.resetFields(); },
            });
            return;
          }
          setCreateOpen(false);
          setEditingId(null);
          form.resetFields();
        }}
        onOk={handleSave}
        confirmLoading={submitting}
        okText={editingId ? "保存修改" : "创建草稿"}
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ channel: "CUSTOM", items: [{ quantity: 1 }] }}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              className="col-span-2"
              name="customerId"
              label="报价客户"
              rules={[{ required: true, message: "请选择已注册客户" }]}
              extra="报价只能由所选客户本人在账户中心确认。"
            >
              <Select
                showSearch
                filterOption={false}
                onSearch={(value) => void searchCustomers(value)}
                loading={customerSearching}
                placeholder="搜索客户姓名或手机号"
                options={customerOptions}
                notFoundContent={customerSearching ? "正在搜索客户…" : "输入姓名或手机号搜索"}
                onSelect={(value) => {
                  const customer = customerOptions.find((option) => option.value === value);
                  if (!customer) return;
                  form.setFieldsValue({
                    customerName: customer.name,
                    customerPhone: customer.phone,
                    customerEmail: customer.email,
                  });
                  if (selectedChannel === "PARTNER_WAX" &&
                    (customer.accountType !== "PARTNER" || customer.partnerStatus !== "APPROVED")) {
                    message.warning("该客户当前不是已通过审核的合作商家，不能发出合作蜡模报价。", 5);
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="channel" label="报价渠道" rules={[{ required: true, message: "请选择报价渠道" }]}>
              <Select
                options={Object.entries(CHANNEL_META).map(([value, label]) => ({ value, label }))}
                onChange={(value: QuoteChannel) => {
                  if (value === "RETAIL") {
                    const items = form.getFieldValue("items") ?? [];
                    form.setFieldValue("items", items.map((item: ItemFormValue) => ({ ...item, waxType: undefined })));
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="customerName" label="客户姓名" rules={[{ required: true, message: "请选择客户" }]}>
              <Input maxLength={50} disabled />
            </Form.Item>
            <Form.Item name="customerPhone" label="手机号" rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "手机号格式不正确" }]}>
              <Input maxLength={20} disabled />
            </Form.Item>
            <Form.Item name="customerEmail" label="邮箱（选填）"><Input maxLength={100} disabled /></Form.Item>
            <Form.Item name="validUntil" label="报价有效期（选填）"><DatePicker className="w-full" /></Form.Item>
            <Form.Item name="depositAmount" label="建议定金（选填）"><InputNumber min={0} prefix="¥" className="w-full" /></Form.Item>
            <Form.Item name="salesConsultantId" label="销售顾问（选填）">
              <Select
                options={consultantOptions}
                placeholder="选择销售顾问"
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="备注（选填）"><Input.TextArea rows={2} maxLength={2000} /></Form.Item>

          <div className="mb-2 text-sm font-medium">报价商品行</div>
          <Form.List name="items" rules={[
            { validator: async (_, value) => { if (!value || value.length < 1) throw new Error("至少添加一个商品行"); } },
          ]}>
            {(fields, { add, remove }) => (
              <div className="space-y-2">
                {fields.map((field) => (
                  <div key={field.key} className="space-y-2 border border-brand-line p-2 rounded">
                    {selectedChannel === "RETAIL" ? (
                      <LinkedSkuSelector
                        fieldName={field.name}
                        form={form}
                        initialProductId={form.getFieldValue(["items", field.name, "productId"]) as number | undefined}
                        initialProductName={form.getFieldValue(["items", field.name, "productName"]) as string | undefined}
                        initialSkuId={form.getFieldValue(["items", field.name, "skuId"]) as number | undefined}
                        initialSkuSpec={form.getFieldValue(["items", field.name, "spec"]) as string | undefined}
                      />
                    ) : null}
                    <Form.Item name={[field.name, "skuId"]} hidden rules={selectedChannel === "RETAIL" ? [{ required: true, message: "标准零售报价必须关联 SKU" }] : undefined}><Input /></Form.Item>
                    <Form.Item name={[field.name, "productId"]} hidden><Input /></Form.Item>
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-3">
                        <Form.Item name={[field.name, "productName"]} noStyle rules={[{ required: true, message: "商品名" }]}>
                          <Input placeholder="商品名称" size="small" />
                        </Form.Item>
                      </div>
                      <div className="col-span-3">
                        <Form.Item name={[field.name, "spec"]} noStyle>
                          <Input placeholder="规格（选填）" size="small" />
                        </Form.Item>
                      </div>
                      <div className="col-span-2">
                        <Form.Item name={[field.name, "quantity"]} noStyle rules={[{ required: true, message: "数量" }]}>
                          <InputNumber placeholder="数量" min={1} max={99} size="small" className="w-full" />
                        </Form.Item>
                      </div>
                      <div className="col-span-2">
                        <Form.Item name={[field.name, "unitPrice"]} noStyle rules={[{ required: true, message: "原价" }]}>
                          <InputNumber placeholder="原价" min={0} prefix="¥" size="small" className="w-full" />
                        </Form.Item>
                      </div>
                      <div className="col-span-2">
                        <Form.Item name={[field.name, "quotedPrice"]} noStyle rules={[{ required: true, message: "报价" }]}>
                          <InputNumber placeholder="报价" min={0} prefix="¥" size="small" className="w-full" disabled={selectedChannel === "RETAIL"} />
                        </Form.Item>
                      </div>
                    </div>
                    {selectedChannel === "PARTNER_WAX" ? (
                      <Form.Item
                        name={[field.name, "waxType"]}
                        label="蜡种"
                        rules={[{ required: true, message: "请选择红蜡或紫蜡" }]}
                      >
                        <Select
                          size="small"
                          options={[
                            { value: "RED", label: "红蜡" },
                            { value: "PURPLE", label: "紫蜡" },
                          ]}
                        />
                      </Form.Item>
                    ) : null}
                    {fields.length > 1 && (
                      <Button type="link" danger size="small" onClick={() => remove(field.name)}>移除该行</Button>
                    )}
                  </div>
                ))}
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} className="w-full">添加商品行</Button>
              </div>
            )}
          </Form.List>
          <p className="text-xs text-brand-muted mt-2">
            {selectedChannel === "RETAIL"
              ? "标准零售必须关联 SKU，并使用当前 SKU 固定价；客户确认时会再次核对价格与库存。"
              : selectedChannel === "PARTNER_WAX"
                ? "合作蜡模必须在发出时关联客户确认的 3D 文件版本、蜡种、有效克价与资源要求。"
                : "高级定制可使用非 SKU 项目；发出时必须配置独立产能或材料要求。"}
          </p>
        </Form>
      </Modal>

      <Modal
        title={issuingQuotation ? `发出报价“${issuingQuotation.quoteNo}”` : "发出报价"}
        open={issueOpen}
        onCancel={() => {
          if (issuing) return;
          setIssueOpen(false);
          setIssuingId(null);
          issueForm.resetFields();
        }}
        onOk={() => void handleIssue()}
        confirmLoading={issuing}
        okText="发出报价"
        cancelText="取消"
        width={640}
        destroyOnHidden
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="发出后生成不可变报价版本"
          description="客户、价格、费用、文件和资源要求将写入版本快照。后续调整必须创建修订版；后台员工不能代客户确认。"
        />
        <Form form={issueForm} layout="vertical">
          {issuingQuotation?.channel === "PARTNER_WAX" ? (
            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="designFileVersionId"
                label="3D 文件版本 ID"
                rules={[{ required: true, message: "请输入已提交的 3D 文件版本 ID" }]}
                extra="服务端会复核文件归属、版本状态和客户确认蜡重。"
              >
                <Select
                  loading={issueOptionsLoading}
                  placeholder="选择客户已确认的文件版本"
                  options={designFileOptions.flatMap((file) =>
                    (file.versions ?? [])
                      .filter((version) => version.status === "CONFIRMED")
                      .map((version) => ({
                        value: version.id,
                        label: `${file.referenceNo} · V${version.version}`,
                      })),
                  )}
                  notFoundContent={issueOptionsLoading ? "正在加载文件版本…" : "该客户暂无已确认文件版本"}
                />
              </Form.Item>
              <Form.Item
                name="waxType"
                label="蜡种"
                rules={[{ required: true, message: "请选择红蜡或紫蜡" }]}
              >
                <Select options={[
                  { value: "RED", label: "红蜡" },
                  { value: "PURPLE", label: "紫蜡" },
                ]} />
              </Form.Item>
            </div>
          ) : null}

          <Form.Item name="feeRuleIds" label="费用规则（选填）">
            <Select
              mode="multiple"
              loading={issueOptionsLoading}
              placeholder="选择适用于当前渠道的费用规则"
              options={feeRuleOptions.map((rule) => ({
                value: rule.id,
                label: `${rule.displayText} · ¥${Number(rule.unitAmount).toFixed(2)} · V${rule.version}`,
              }))}
              notFoundContent={issueOptionsLoading ? "正在加载费用规则…" : "当前渠道没有已启用费用规则"}
            />
          </Form.Item>

          {issuingQuotation?.channel !== "RETAIL" ? (
            <>
              <div className="mb-2 mt-4 text-sm font-medium">产能与材料要求</div>
              <Form.List
                name="resourceRequirements"
                rules={[{
                  validator: async (_, value) => {
                    if (!value?.length) throw new Error("至少添加一项产能或材料要求");
                  },
                }]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <div className="space-y-2">
                    {fields.map((field) => (
                      <div key={field.key} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
                        <Form.Item
                          name={[field.name, "resourceBucketId"]}
                          rules={[{ required: true, message: "请输入资源桶 ID" }]}
                        >
                          <Select
                            loading={issueOptionsLoading}
                            placeholder="选择资源桶"
                            options={resourceBucketOptions.map((bucket) => ({
                              value: bucket.id,
                              label: `${bucket.displayName} · 可用 ${Math.max(0, Number(bucket.availableQuantity) - Number(bucket.reservedQuantity)).toFixed(3)} ${bucket.unit}`,
                            }))}
                            notFoundContent={issueOptionsLoading ? "正在加载资源桶…" : "当前渠道没有可用资源桶"}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "requiredQuantity"]}
                          rules={[{ required: true, message: "请输入需求数量" }]}
                        >
                          <InputNumber min={0.001} precision={3} placeholder="需求数量" className="w-full" />
                        </Form.Item>
                        <Button type="link" danger onClick={() => remove(field.name)}>移除</Button>
                      </div>
                    ))}
                    <Button type="dashed" onClick={() => add()} block>添加资源要求</Button>
                    <Form.ErrorList errors={errors} />
                  </div>
                )}
              </Form.List>
            </>
          ) : (
            <p className="text-xs text-brand-muted mt-4">
              标准零售在客户确认时使用当前 SKU 固定价和零售库存，不使用定制资源桶。
            </p>
          )}
        </Form>
      </Modal>

      {canConfigure ? (
        <QuotationConfigurationDrawer
          open={configurationOpen}
          onClose={() => setConfigurationOpen(false)}
        />
      ) : null}
    </div>
  );
}
