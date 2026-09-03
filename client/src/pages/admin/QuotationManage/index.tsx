import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
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
import { productApi, quotationApi, userApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import type {
  PaginatedResult,
  Product,
  ProductSKU,
  Quotation,
  QuotationStatus,
} from "@/types";

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
  "客户本人确认能力与安全转单流程尚未完成；当前后台员工不能代客户确认报价或将报价转为订单。";

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
}

interface QuotationFormValues {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  salesConsultantId?: number;
  remark?: string;
  depositAmount?: number;
  validUntil?: Dayjs;
  items: ItemFormValue[];
}

type ProductSearchResult = Pick<Product, "id" | "name" | "code">;
type SkuSearchResult = Pick<
  ProductSKU,
  "id" | "isActive" | "material" | "size" | "skuCode" | "price"
>;

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
  const [list, setList] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<"all" | QuotationStatus>("all");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<QuotationFormValues>();
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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await quotationApi.getList({
        page, pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
        keyword: keyword || undefined,
      });
      const data = unwrapResponse<PaginatedResult<Quotation>>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch {
      setLoadError(true);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: number) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await quotationApi.getById(id);
      setDetail(unwrapResponse<QuotationDetail>(res));
    } catch (e: unknown) {
      message.error(getSafeAdminErrorMessage(e, "报价单详情加载失败，请稍后重新加载。"));
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

  // 后台员工仅可提交客户确认或取消报价，不能代客户确认。
  const changeStatus = (record: Quotation, action: "submit" | "cancel", label: string, danger = false) => {
    Modal.confirm({
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
          if (detail?.id === record.id) setDetail(null);
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
      form.setFieldsValue({
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-semibold text-brand-text">报价管理</h1>
          <p className="text-sm text-brand-muted mt-1">管理报价草稿、提交客户确认、取消和历史报价/订单关联</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); void loadConsultants(); setCreateOpen(true); }}>新建报价</Button>
        </Space>
      </div>

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
        <Input.Search
          placeholder="报价单号 / 客户姓名 / 手机号"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onSearch={(v) => { setKeyword(v); setPage(1); }}
          className="w-72"
          allowClear
        />
      </Card>

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">报价数据暂时无法加载</p>
          <Button type="primary" onClick={() => void load()}>重新加载</Button>
        </div>
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
            locale={{ emptyText: "暂无报价单；可新建报价草稿并提交客户确认" }}
            columns={[
              { title: "报价单号", dataIndex: "quoteNo", render: (v: string) => <code className="text-xs text-brand-gold">{v}</code> },
              { title: "客户", dataIndex: "customerName", render: (v: string, r: Quotation) => <div><p>{v}</p><p className="text-xs text-brand-muted">{r.customerPhone}</p></div> },
              { title: "原价合计", dataIndex: "totalAmount", width: 110, render: (v: number) => <span className="text-brand-muted">¥{Number(v).toLocaleString()}</span> },
              { title: "报价合计", dataIndex: "finalAmount", width: 110, render: (v: number) => <span className="text-brand-gold font-medium">¥{Number(v).toLocaleString()}</span> },
              { title: "建议定金", dataIndex: "depositAmount", width: 100, render: (v: number) => v ? `¥${Number(v).toLocaleString()}` : "—" },
              { title: "有效期", dataIndex: "validUntil", width: 110, render: (v: string) => v ? dayjs(v).format("YYYY-MM-DD") : "—" },
              { title: "状态", dataIndex: "status", width: 100, render: (v: QuotationStatus) => <Tag color={STATUS_META[v]?.c}>{STATUS_META[v]?.t}</Tag> },
              { title: "创建时间", dataIndex: "createdAt", render: (v: string) => <span className="text-brand-muted text-xs">{v ? dayjs(v).format("YYYY-MM-DD HH:mm") : ""}</span> },
              {
                title: "操作", width: 220, render: (_: unknown, r: Quotation) => (
                  <Space>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
                    {r.status === "DRAFT" && (
                      <Button size="small" onClick={() => void openEdit(r)}>编辑</Button>
                    )}
                    {(r.status === "PENDING_CONFIRM" || r.status === "CONFIRMED") && (
                      <Text type="secondary" className="!text-xs">
                        员工不能代确认或转单；相关流程待完成
                      </Text>
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
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        width={680}
        title="报价单详情"
        loading={detailLoading && !detail}
      >
        {detail && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">报价摘要</h3>
                <Tag color={STATUS_META[detail.status]?.c}>{STATUS_META[detail.status]?.t}</Tag>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><Text type="secondary">报价单号：</Text><code className="text-brand-gold">{detail.quoteNo}</code></div>
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
            {(detail.status === "PENDING_CONFIRM" || detail.status === "CONFIRMED") && (
              <Alert
                type="info"
                showIcon
                message="客户确认与转单暂不可由员工操作"
                description={STAFF_ACTION_NOTICE}
              />
            )}
            <div className="flex gap-2 flex-wrap border-t border-brand-line pt-4">
              {detail.status === "DRAFT" && (
                <Button onClick={() => changeStatus(detail, "submit", "提交")}>提交客户确认</Button>
              )}
              {detail.status === "PENDING_CONFIRM" && (
                <Button onClick={() => changeStatus(detail, "cancel", "取消")}>取消报价</Button>
              )}
              {detail.status === "CONFIRMED" && !detail.convertedOrderId && (
                <Button danger onClick={() => changeStatus(detail, "cancel", "取消")}>取消报价</Button>
              )}
              {(detail.status === "DRAFT" || detail.status === "CANCELLED") && (
                <Button danger onClick={() => handleRemove(detail)}>删除报价单</Button>
              )}
            </div>
          </div>
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
        <Form form={form} layout="vertical" initialValues={{ items: [{ quantity: 1 }] }}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="customerName" label="客户姓名" rules={[{ required: true, message: "请输入客户姓名" }]}>
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item name="customerPhone" label="手机号" rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "手机号格式不正确" }]}>
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item name="customerEmail" label="邮箱（选填）"><Input maxLength={100} /></Form.Item>
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
                    <LinkedSkuSelector
                      fieldName={field.name}
                      form={form}
                      initialProductId={form.getFieldValue(["items", field.name, "productId"]) as number | undefined}
                      initialProductName={form.getFieldValue(["items", field.name, "productName"]) as string | undefined}
                      initialSkuId={form.getFieldValue(["items", field.name, "skuId"]) as number | undefined}
                      initialSkuSpec={form.getFieldValue(["items", field.name, "spec"]) as string | undefined}
                    />
                    <Form.Item name={[field.name, "skuId"]} hidden><Input /></Form.Item>
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
                          <InputNumber placeholder="报价" min={0} prefix="¥" size="small" className="w-full" />
                        </Form.Item>
                      </div>
                    </div>
                    {fields.length > 1 && (
                      <Button type="link" danger size="small" onClick={() => remove(field.name)}>移除该行</Button>
                    )}
                  </div>
                ))}
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} className="w-full">添加商品行</Button>
              </div>
            )}
          </Form.List>
          <p className="text-xs text-brand-muted mt-2">提示：搜索并关联商品 SKU 后会自动填充名称、规格和价格。</p>
        </Form>
      </Modal>
    </div>
  );
}
