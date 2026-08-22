import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";

const sm: Record<string, { c: string; t: string }> = {
  normal: { c: "green", t: "正常" },
  low: { c: "gold", t: "偏低" },
  out: { c: "red", t: "缺货" },
};

type InventoryApiItem = {
  id: number;
  skuCode?: string;
  productName?: string;
  warehouse?: string | { name?: string };
  quantity?: number;
  safetyStock?: number;
  sku?: {
    skuCode?: string;
    product?: { name?: string };
  };
};

type InventoryRow = {
  id: number;
  skuCode?: string;
  productName?: string;
  warehouse?: string;
  quantity: number;
  safetyStock: number;
  status: "normal" | "low" | "out";
};

export default function Inventory() {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [warehouseError, setWarehouseError] = useState(false);
  const [adjustModal, setAdjustModal] = useState<{
    open: boolean;
    record: any;
  }>({ open: false, record: null });
  const [adjustQty, setAdjustQty] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await inventoryApi.getList({ page, pageSize, warehouseId });
      const data = unwrapResponse<{ list: InventoryApiItem[]; total: number }>(res);
      if (!data || !Array.isArray(data.list) || !Number.isFinite(Number(data.total))) {
        throw new Error("Invalid inventory response");
      }
      // 服务端返回嵌套 sku/warehouse，mock 返回扁平字段——两侧兼容，并在前端统一计算库存状态
      const rows = data.list.map((i): InventoryRow => {
        const quantity = i.quantity ?? 0;
        const safety = i.safetyStock ?? 0;
        return {
          id: i.id,
          skuCode: i.sku?.skuCode ?? i.skuCode,
          productName: i.sku?.product?.name ?? i.productName,
          warehouse:
            typeof i.warehouse === "string"
              ? i.warehouse
              : i.warehouse?.name,
          quantity,
          safetyStock: safety,
          status: quantity <= 0 ? "out" : quantity <= safety ? "low" : "normal",
        };
      });
      if (requestId !== requestIdRef.current) return;
      setItems(rows);
      setTotal(Number(data.total));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(
        getSafeAdminErrorMessage(
          loadError,
          "库存数据加载失败，请稍后重新加载。",
        ),
      );
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, pageSize, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadWarehouses = useCallback(async () => {
    setWarehouseLoading(true);
    setWarehouseError(false);
    try {
      const res = await warehouseApi.list();
      const data = unwrapResponse<Array<{ id: number; name: string }>>(res);
      if (!Array.isArray(data)) throw new Error("Invalid warehouse response");
      setWarehouses(data.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })));
    } catch {
      setWarehouses([]);
      setWarehouseError(true);
    } finally {
      setWarehouseLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  const filtered = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.status === filter),
    [filter, items],
  );

  const handleAdjust = async () => {
    if (!adjustModal.record) return;
    try {
      await inventoryApi.update(adjustModal.record.id, { quantity: adjustQty });
      message.success("库存已调整");
      setAdjustModal({ open: false, record: null });
      void load();
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
    message.success(`已导出当前页 ${filtered.length} 条库存记录`);
  };

  const stats = [
    { t: "库存记录总数（全量）", v: total },
    { t: "本页正常", v: items.filter((i) => i.status === "normal").length },
    { t: "本页偏低", v: items.filter((i) => i.status === "low").length },
    { t: "本页缺货", v: items.filter((i) => i.status === "out").length },
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
            aria-label="仓库筛选"
            className="w-36"
            value={warehouseId}
            loading={warehouseLoading}
            disabled={warehouseLoading || warehouseError}
            onChange={(v) => {
              setWarehouseId(v);
              setPage(1);
            }}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
          <Select value={filter} onChange={setFilter} className="w-32" aria-label="本页库存状态筛选">
            <Select.Option value="all">全部</Select.Option>
            <Select.Option value="normal">正常</Select.Option>
            <Select.Option value="low">偏低</Select.Option>
            <Select.Option value="out">缺货</Select.Option>
          </Select>
          <Button
            icon={<ExportOutlined />}
            onClick={handleExport}
            disabled={loading || Boolean(error) || filtered.length === 0}
          >
            导出当前页
          </Button>
        </Space>
      </div>
      {warehouseError && (
        <Alert
          showIcon
          type="warning"
          message="仓库筛选项加载失败"
          description="库存数据仍可查看；重新加载仓库后可继续按仓库筛选。"
          action={<Button onClick={() => void loadWarehouses()}>重新加载仓库</Button>}
        />
      )}
      {loading ? (
        <AdminLoadingState subject="库存数据" />
      ) : error ? (
        <AdminErrorState subject="库存数据" message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <Card className="!bg-white !border-brand-line">
          <AdminEmptyState subject="库存记录" />
        </Card>
      ) : (
        <>
          <p className="text-xs leading-[18px] text-brand-muted">
            全量总数来自服务端；状态统计与状态筛选仅针对当前页已加载记录。
          </p>
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
            {filtered.length === 0 ? (
              <AdminEmptyState description="当前页没有符合状态筛选的库存记录" />
            ) : (
              <Table
                dataSource={filtered}
                rowKey="id"
                size="middle"
                pagination={{
                  current: page,
                  pageSize,
                  total,
                  showSizeChanger: true,
                  showTotal: (t) => `全量共 ${t} 条`,
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
                  className="font-sans font-bold"
                  style={{ color: r.status === "out" ? "var(--adm-error)" : r.status === "low" ? "var(--adm-warning)" : "var(--adm-ink)" }}
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
              render: (_: unknown, r: InventoryRow) => (
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
            )}
          </Card>
        </>
      )}

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
