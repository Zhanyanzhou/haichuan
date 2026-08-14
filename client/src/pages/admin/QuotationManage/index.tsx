import { useCallback, useEffect, useState } from "react";
import {
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
import { PlusOutlined, ReloadOutlined, EyeOutlined, ExportOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { quotationApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { PaginatedResult, Quotation, QuotationStatus } from "@/types";

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

const STATUS_TABS: Array<{ k: string; l: string }> = [
  { k: "all", l: "全部" },
  { k: "DRAFT", l: "草稿" },
  { k: "PENDING_CONFIRM", l: "待确认" },
  { k: "CONFIRMED", l: "已确认" },
  { k: "CONVERTED", l: "已转单" },
  { k: "CANCELLED", l: "已取消" },
];

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
  quantity: number;
  unitPrice: number;
  quotedPrice: number;
}

export default function QuotationManage() {
  const [list, setList] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<QuotationDetail | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [convertForm] = Form.useForm();

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
    } catch (e: any) {
      message.error(e?.message || "报价详情加载失败");
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

  // 状态变更（提交/确认/取消），统一带二次确认
  const changeStatus = (record: Quotation, action: "submit" | "confirm" | "cancel", label: string, danger = false) => {
    Modal.confirm({
      title: `确认${label}该报价单？`,
      content: record.convertedOrderId ? "该报价单已转订单，操作需谨慎。" : undefined,
      okText: `确认${label}`,
      okButtonProps: { danger },
      onOk: async () => {
        try {
          await quotationApi[action === "submit" ? "submit" : action === "confirm" ? "confirm" : "cancel"](record.id);
          message.success(`已${label}`);
          void load();
          if (detail?.id === record.id) void reloadDetail(record.id);
        } catch (e: any) {
          message.error(e?.message || "操作失败");
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
          message.success("已删除");
          void load();
          if (detail?.id === record.id) setDetail(null);
        } catch (e: any) {
          message.error(e?.message || "删除失败");
        }
      },
    });
  };

  const handleCreate = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await quotationApi.create({
        customerId: values.customerId || undefined,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail || undefined,
        salesConsultantId: values.salesConsultantId || undefined,
        remark: values.remark || undefined,
        depositAmount: values.depositAmount || 0,
        validUntil: values.validUntil ? (values.validUntil as Dayjs).toISOString() : undefined,
        items: (values.items as ItemFormValue[]).map((it) => ({
          productName: it.productName,
          productImage: it.productImage || undefined,
          spec: it.spec || undefined,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          quotedPrice: it.quotedPrice,
        })),
      });
      message.success("报价单已创建（草稿）");
      setCreateOpen(false);
      form.resetFields();
      void load();
    } catch (e: any) {
      message.error(e?.message || "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    let values: any;
    try {
      values = await convertForm.validateFields();
    } catch {
      return;
    }
    setConvertLoading(true);
    try {
      const res = await quotationApi.convertToOrder(convertTarget.id, {
        address: values.address,
        orderType: values.orderType || undefined,
      });
      const result = unwrapResponse<{ order: { id: number; orderNo: string } }>(res);
      message.success(`已转订单 ${result?.order?.orderNo || ""}`);
      setConvertTarget(null);
      convertForm.resetFields();
      void load();
      if (detail?.id === convertTarget.id) void reloadDetail(convertTarget.id);
    } catch (e: any) {
      message.error(e?.message || "转订单失败");
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-text">报价管理</h1>
          <p className="text-sm text-brand-muted mt-1">珠宝报价单 · 客户确认 · 一键转订单（保留报价单↔订单关联）</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建报价</Button>
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
            locale={{ emptyText: "暂无报价单（客户确认报价后可一键转订单）" }}
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
                title: "操作", width: 180, render: (_: unknown, r: Quotation) => (
                  <Space>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
                    {r.status === "CONFIRMED" && !r.convertedOrderId && (
                      <Button size="small" type="primary" onClick={() => { setConvertTarget(detail && detail.id === r.id ? detail : r as QuotationDetail); convertForm.resetFields(); }}>转订单</Button>
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
                <h3 className="font-display text-lg">报价摘要</h3>
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
              <h3 className="font-display text-lg mb-2">报价商品</h3>
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
            <div className="flex gap-2 flex-wrap border-t border-brand-line pt-4">
              {detail.status === "DRAFT" && (
                <Button onClick={() => changeStatus(detail, "submit", "提交")}>提交客户确认</Button>
              )}
              {detail.status === "PENDING_CONFIRM" && (
                <>
                  <Button type="primary" onClick={() => changeStatus(detail, "confirm", "确认")}>客户已确认</Button>
                  <Button onClick={() => changeStatus(detail, "cancel", "取消")}>取消报价</Button>
                </>
              )}
              {detail.status === "CONFIRMED" && !detail.convertedOrderId && (
                <>
                  <Button type="primary" onClick={() => { setConvertTarget(detail); convertForm.resetFields(); }}>一键转订单</Button>
                  <Button danger onClick={() => changeStatus(detail, "cancel", "取消")}>取消报价</Button>
                </>
              )}
              {(detail.status === "DRAFT" || detail.status === "CANCELLED") && (
                <Button danger onClick={() => handleRemove(detail)}>删除</Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* 新建报价 Modal */}
      <Modal
        title="新建报价单"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={handleCreate}
        confirmLoading={submitting}
        okText="创建草稿"
        width={720}
        destroyOnClose
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
            <Form.Item name="salesConsultantId" label="销售顾问ID（选填）"><InputNumber min={1} className="w-full" /></Form.Item>
          </div>
          <Form.Item name="remark" label="备注（选填）"><Input.TextArea rows={2} maxLength={2000} /></Form.Item>

          <div className="mb-2 text-sm font-medium">报价商品行</div>
          <Form.List name="items" rules={[
            { validator: async (_, value) => { if (!value || value.length < 1) throw new Error("至少添加一个商品行"); } },
          ]}>
            {(fields, { add, remove }) => (
              <div className="space-y-2">
                {fields.map((field) => (
                  <div key={field.key} className="grid grid-cols-12 gap-2 items-start border border-brand-line p-2 rounded">
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
                    {fields.length > 1 && (
                      <Button type="link" danger size="small" className="col-span-12 -mt-1" onClick={() => remove(field.name)}>移除该行</Button>
                    )}
                  </div>
                ))}
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })} className="w-full">添加商品行</Button>
              </div>
            )}
          </Form.List>
          <p className="text-xs text-brand-muted mt-2">提示：转订单时商品行需关联 SKU（暂支持手录，SKU 关联可在详情补全后转单）。</p>
        </Form>
      </Modal>

      {/* 转订单 Modal */}
      <Modal
        title="报价单转订单"
        open={!!convertTarget}
        onCancel={() => { setConvertTarget(null); convertForm.resetFields(); }}
        onOk={handleConvert}
        confirmLoading={convertLoading}
        okText="确认转订单"
        destroyOnClose
      >
        {convertTarget && (
          <div className="space-y-3">
            <div className="text-sm text-brand-muted">
              报价单 <code className="text-brand-gold">{convertTarget.quoteNo}</code> · 客户 {convertTarget.customerName} · 报价合计 <span className="text-brand-gold">¥{Number(convertTarget.finalAmount).toLocaleString()}</span>
            </div>
            {convertTarget.items?.some((it) => !it.skuId) && (
              <div className="text-xs text-red-500 border border-red-200 bg-red-50 p-2 rounded">
                警告：该报价单存在未关联 SKU 的商品行，转订单将失败。请先在报价单补全商品 SKU。
              </div>
            )}
            <Form form={convertForm} layout="vertical" initialValues={{ orderType: "SPOT" }}>
              <Form.Item name="address" label="收货地址" rules={[{ required: true, message: "请输入收货地址" }]}>
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
              <Form.Item name="orderType" label="订单类型">
                <Select options={[
                  { value: "SPOT", label: "现货订单" },
                  { value: "CUSTOM", label: "定制订单" },
                  { value: "RESERVATION", label: "预订订单" },
                  { value: "OFFLINE", label: "线下订单" },
                ]} />
              </Form.Item>
              <p className="text-xs text-brand-muted">转单后自动生成订单号、预占库存、记录交易事件，并保留报价单↔订单关联。</p>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}
