import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Select,
  Modal,
  InputNumber,
  message,
} from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { inventoryApi, warehouseApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";

const sm: Record<string, { c: string; t: string }> = {
  normal: { c: "green", t: "正常" },
  low: { c: "gold", t: "偏低" },
  out: { c: "red", t: "缺货" },
};

export default function Inventory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [adjustModal, setAdjustModal] = useState<{
    open: boolean;
    record: any;
  }>({ open: false, record: null });
  const [adjustQty, setAdjustQty] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getList({ page, pageSize, warehouseId });
      const data = unwrapResponse<{ list: any[]; total: number }>(res);
      // 服务端返回嵌套 sku/warehouse，mock 返回扁平字段——两侧兼容，并在前端统一计算库存状态
      const rows = (data?.list || []).map((i: any) => {
        const quantity = i.quantity ?? 0;
        const safety = i.safetyStock ?? 0;
        return {
          id: i.id,
          skuCode: i.sku?.skuCode ?? i.skuCode,
          productName: i.sku?.product?.name ?? i.productName,
          warehouse: i.warehouse?.name ?? i.warehouse,
          quantity,
          safetyStock: safety,
          status: quantity <= 0 ? "out" : quantity <= safety ? "low" : "normal",
        };
      });
      setItems(rows);
      setTotal(data?.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, pageSize, warehouseId]);

  useEffect(() => {
    warehouseApi
      .list()
      .then((res) => {
        const data = unwrapResponse<any[]>(res);
        setWarehouses(
          (Array.isArray(data) ? data : []).map((w) => ({ id: w.id, name: w.name })),
        );
      })
      .catch(() => {
        /* 仓库列表加载失败不阻断库存展示 */
      });
  }, []);

  const filtered =
    filter === "all" ? items : items.filter((i) => i.status === filter);

  const handleAdjust = async () => {
    if (!adjustModal.record) return;
    try {
      await inventoryApi.update(adjustModal.record.id, { quantity: adjustQty });
      message.success("库存已调整");
      setAdjustModal({ open: false, record: null });
      load();
    } catch (e: any) {
      message.error(getSafeAdminErrorMessage(e, "库存调整失败，请重新加载库存后核对数量。"));
    }
  };

  const handleExport = () => {
    const csv = ["SKU,产品,仓库,库存,状态"]
      .concat(
        filtered.map(
          (i) =>
            `${i.skuCode},${i.productName},${i.warehouse},${i.quantity},${sm[i.status]?.t || i.status}`,
        ),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `库存报表_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("导出成功");
  };

  const stats = [
    { t: "库存总数", v: total },
    { t: "正常", v: items.filter((i) => i.status === "normal").length },
    { t: "偏低", v: items.filter((i) => i.status === "low").length },
    { t: "缺货", v: items.filter((i) => i.status === "out").length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-brand-text">
            库存管理
          </h1>
          <p className="text-sm text-brand-muted mt-1">多仓库 · 安全预警</p>
        </div>
        <Space>
          <Select
            allowClear
            placeholder="全部仓库"
            className="w-36"
            value={warehouseId}
            onChange={(v) => {
              setWarehouseId(v);
              setPage(1);
            }}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <Select value={filter} onChange={setFilter} className="w-32">
            <Select.Option value="all">全部</Select.Option>
            <Select.Option value="normal">正常</Select.Option>
            <Select.Option value="low">偏低</Select.Option>
            <Select.Option value="out">缺货</Select.Option>
          </Select>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出
          </Button>
        </Space>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.t} className="bg-white border border-brand-line p-4">
            <p className="text-xs text-brand-muted">{s.t}</p>
            <p className="text-xl font-sans font-bold text-brand-text mt-1">
              {s.v}
            </p>
          </div>
        ))}
      </div>
      <Card className="!bg-white !border-brand-line">
        <Table
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          columns={[
            {
              title: "SKU",
              dataIndex: "skuCode",
              render: (v: string) => (
                <code className="text-xs text-brand-gold">{v}</code>
              ),
            },
            { title: "产品", dataIndex: "productName" },
            {
              title: "仓库",
              dataIndex: "warehouse",
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: "库存",
              dataIndex: "quantity",
              render: (v: number, r: any) => (
                <span
                  className={`font-sans font-bold ${r.status === "out" ? "text-red-400" : r.status === "low" ? "text-brand-gold" : "text-brand-text"}`}
                >
                  {v}
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
              title: "操作",
              render: (_: any, r: any) => (
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    setAdjustQty(r.quantity);
                    setAdjustModal({ open: true, record: r });
                  }}
                >
                  调整
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="调整库存"
        open={adjustModal.open}
        onCancel={() => setAdjustModal({ open: false, record: null })}
        onOk={handleAdjust}
        okText="保存库存调整"
        cancelText="取消"
      >
        <div className="py-4">
          <p className="text-sm text-brand-muted mb-2">
            产品：{adjustModal.record?.productName}
          </p>
          <p className="text-sm text-brand-muted mb-3">
            SKU：{adjustModal.record?.skuCode}
          </p>
          <InputNumber
            min={0}
            value={adjustQty}
            onChange={(v) => setAdjustQty(v || 0)}
            className="w-full"
            size="large"
          />
        </div>
      </Modal>
    </div>
  );
}
