import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, message, Space, Table, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { orderApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { Order, OrderStatus } from "@/types";

const STATUS_LABEL: Record<string, { c: string; t: string }> = {
  PENDING_PAYMENT: { c: "gold", t: "待付款" },
  PENDING_SHIP: { c: "blue", t: "待发货" },
  SHIPPED: { c: "cyan", t: "已发货" },
  COMPLETED: { c: "green", t: "已完成" },
  CANCELLED: { c: "red", t: "已取消" },
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  SPOT: "现货",
  CUSTOM: "定制",
  RESERVATION: "预订",
  OFFLINE: "线下",
};

type AnomalyOrder = Order & { anomalyReasons: string[] };

export default function AnomalyOrders() {
  const navigate = useNavigate();
  const [list, setList] = useState<AnomalyOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await orderApi.getAnomalies();
      const data = unwrapResponse<{ list: AnomalyOrder[]; total: number }>(res);
      setList(data?.list || []);
      setTotal(data?.total || 0);
    } catch (e: any) {
      setLoadError(true);
      message.error(e?.message || "异常订单加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold text-brand-text">
            异常订单
          </h1>
          <p className="text-sm text-brand-muted mt-1">
            自动归集：长时间未付款（&gt;24h）· 超时未发货（&gt;48h）·
            定制超期（&gt;30 天）· 物流异常 · 退款处理中
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      </div>

      {loadError ? (
        <div className="text-center py-16">
          <p className="text-brand-muted mb-4">异常订单数据暂时无法加载</p>
          <Button type="primary" onClick={() => void load()}>
            重新加载
          </Button>
        </div>
      ) : (
        <Card className="!bg-white !border-brand-line">
          <Table
            dataSource={list}
            rowKey="id"
            loading={loading}
            size="middle"
            pagination={{
              pageSize: 20,
              total,
              showTotal: (t) => `共 ${t} 条异常`,
            }}
            locale={{ emptyText: "暂无异常订单（所有订单正常流转中）" }}
            columns={[
              {
                title: "订单号",
                dataIndex: "orderNo",
                render: (v: string) => (
                  <code className="text-xs text-brand-gold">{v}</code>
                ),
              },
              {
                title: "客户",
                dataIndex: "customerName",
                render: (v: string, r: Order) => (
                  <div>
                    <p>{v}</p>
                    <p className="text-xs text-brand-muted">
                      {r.customerPhone}
                    </p>
                  </div>
                ),
              },
              {
                title: "类型",
                dataIndex: "orderType",
                width: 70,
                render: (v: string) => ORDER_TYPE_LABEL[v] || v || "—",
              },
              {
                title: "订单状态",
                dataIndex: "status",
                width: 90,
                render: (v: string) => {
                  const m = STATUS_LABEL[v];
                  return <Tag color={m?.c}>{m?.t || v}</Tag>;
                },
              },
              {
                title: "异常原因",
                dataIndex: "anomalyReasons",
                render: (reasons: string[]) => (
                  <Space size={[4, 4]} wrap>
                    {reasons.map((r) => (
                      <Tag key={r} color="red">
                        {r}
                      </Tag>
                    ))}
                  </Space>
                ),
              },
              {
                title: "下单时间",
                dataIndex: "createdAt",
                width: 140,
                render: (v: string) => (
                  <span className="text-brand-muted text-xs">
                    {v ? dayjs(v).format("YYYY-MM-DD HH:mm") : ""}
                  </span>
                ),
              },
              {
                title: "操作",
                width: 90,
                render: (_: unknown, r: Order) => (
                  <Button
                    size="small"
                    onClick={() => navigate("/admin/orders")}
                  >
                    查看
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
