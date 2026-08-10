import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Form,
  message,
  Modal,
  Descriptions,
} from "antd";
import {
  EyeOutlined,
  PrinterOutlined,
  TruckOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { orderApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { Order, PaginatedResult } from "@/types";

const sm: Record<string, { c: string; t: string }> = {
  PENDING_PAYMENT: { c: "gold", t: "待付款" },
  PENDING_SHIP: { c: "blue", t: "待发货" },
  SHIPPED: { c: "cyan", t: "已发货" },
  COMPLETED: { c: "green", t: "已完成" },
  CANCELLED: { c: "red", t: "已取消" },
};

const tabs = [
  { k: "all", l: "全部" },
  { k: "PENDING_PAYMENT", l: "待付款" },
  { k: "PENDING_SHIP", l: "待发货" },
  { k: "SHIPPED", l: "已发货" },
  { k: "COMPLETED", l: "已完成" },
];

export default function OrderManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const [shipping, setShipping] = useState(false);
  const requestedStatus = searchParams.get("status") || "all";
  const statusFilter = tabs.some((tab) => tab.k === requestedStatus)
    ? requestedStatus
    : "all";

  const handleStatusFilter = (status: string) => {
    setSearchParams(status === "all" ? {} : { status });
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await orderApi.getList({
        keyword: keyword || undefined,
        pageSize: 50,
      });
      const data = unwrapResponse<PaginatedResult<Order>>(res);
      setOrders(data?.list || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered =
    statusFilter === "all"
      ? orders.filter(
          (o) =>
            !keyword ||
            o.orderNo.includes(keyword) ||
            o.customerName.includes(keyword),
        )
      : orders.filter(
          (o) =>
            o.status === statusFilter &&
            (!keyword ||
              o.orderNo.includes(keyword) ||
              o.customerName.includes(keyword)),
        );

  const handleShip = async (id: number, values: { logisticsCompany: string; logisticsNo: string; internalNote?: string }) => {
    setShipping(true);
    try {
      await orderApi.ship(id, values);
      message.success("已发货");
      setShippingOrder(null);
      load();
    } catch (e: any) {
      message.error(e?.message || "操作失败");
    } finally {
      setShipping(false);
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await orderApi.updateStatus(id, { status: "COMPLETED" });
      message.success("已完成");
      load();
    } catch (e: any) {
      message.error(e?.message || "操作失败");
    }
  };

  const handleExport = () => {
    const csv = ["订单号,客户,金额,状态,时间"]
      .concat(
        filtered.map(
          (o) =>
            `${o.orderNo},${o.customerName},¥${o.finalAmount},${sm[o.status]?.t || o.status},${o.createdAt}`,
        ),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `订单报表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("导出成功");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-text">
            订单管理
          </h1>
          <p className="text-sm text-brand-muted mt-1">订单处理 · 物流跟踪</p>
        </div>
        <Space>
          <Input
            placeholder="搜索订单号/客户"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-48"
          />
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出
          </Button>
        </Space>
      </div>
      <div className="flex gap-2">
        {tabs.map((s) => (
          <button
            key={s.k}
            onClick={() => handleStatusFilter(s.k)}
            className={`px-4 py-2 text-sm border transition-all ${statusFilter === s.k ? "border-brand-gold text-brand-gold" : "border-brand-line text-brand-muted hover:text-brand-text hover:border-brand-gold"}`}
          >
            {s.l}{" "}
            <span className="text-brand-gold ml-1">
              {s.k === "all"
                ? orders.length
                : orders.filter((o) => o.status === s.k).length}
            </span>
          </button>
        ))}
      </div>
      <Card className="!bg-white !border-brand-line">
        <Table
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          columns={[
            {
              title: "订单号",
              dataIndex: "orderNo",
              render: (v: string) => (
                <code className="text-xs text-brand-gold">{v}</code>
              ),
            },
            { title: "客户", dataIndex: "customerName" },
            {
              title: "金额",
              dataIndex: "finalAmount",
              render: (v: number) => (
                <span className="text-brand-gold font-medium">
                  ¥{v?.toLocaleString()}
                </span>
              ),
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v: string) => {
                const s = sm[v];
                return <Tag color={s?.c}>{s?.t}</Tag>;
              },
            },
            {
              title: "时间",
              dataIndex: "createdAt",
              render: (v: string) => (
                <span className="text-brand-muted text-xs">{v}</span>
              ),
            },
            {
              title: "操作",
              render: (_: any, r: Order) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => setDetailOrder(r)}
                  >
                    详情
                  </Button>
                  {r.status === "PENDING_SHIP" && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<TruckOutlined />}
                      onClick={() => setShippingOrder(r)}
                    >
                      发货
                    </Button>
                  )}
                  {r.status === "SHIPPED" && (
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => handleComplete(r.id)}
                    >
                      完成
                    </Button>
                  )}
                  <Button
                    size="small"
                    icon={<PrinterOutlined />}
                    onClick={() => window.print()}
                  >
                    打印
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title="订单详情"
        open={!!detailOrder}
        onCancel={() => setDetailOrder(null)}
        footer={null}
        width={560}
      >
        {detailOrder && (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="订单号">
              {detailOrder.orderNo}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag>{sm[detailOrder.status]?.t}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="客户">
              {detailOrder.customerName}
            </Descriptions.Item>
            <Descriptions.Item label="金额">
              ¥{detailOrder.finalAmount?.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>
              {detailOrder.createdAt}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
      <Modal title="登记发货物流" open={!!shippingOrder} onCancel={() => setShippingOrder(null)} footer={null} destroyOnClose>
        {shippingOrder && <Form layout="vertical" onFinish={(values) => handleShip(shippingOrder.id, values)}>
          <Form.Item name="logisticsCompany" label="物流公司" rules={[{ required: true, message: '请填写物流公司' }]}><Input /></Form.Item>
          <Form.Item name="logisticsNo" label="物流单号" rules={[{ required: true, message: '请填写物流单号' }]}><Input /></Form.Item>
          <Form.Item name="internalNote" label="内部备注"><Input.TextArea rows={3} /></Form.Item>
          <div className="flex justify-end gap-2"><Button onClick={() => setShippingOrder(null)}>取消</Button><Button type="primary" htmlType="submit" loading={shipping}>确认发货</Button></div>
        </Form>}
      </Modal>
    </div>
  );
}
