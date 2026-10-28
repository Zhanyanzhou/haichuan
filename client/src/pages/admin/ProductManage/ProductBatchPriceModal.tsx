import { useEffect, useMemo, useState } from "react";
import { Alert, InputNumber, Modal, Radio, Space, Table } from "antd";
import { AdminLoadingState } from "@/components/common/AdminDataStates";
import type { Product } from "@/types";
import {
  planBatchPrices,
  type BatchPriceMode,
  type BatchPriceUpdate,
} from "./productBatchPrice";

const MAX_BATCH_PRICE = 9_999_999;

export function ProductBatchPriceModal({
  open,
  loading,
  products,
  unresolvedCount,
  canChangePublished,
  applying,
  onCancel,
  onApply,
}: {
  open: boolean;
  loading: boolean;
  products: Product[];
  unresolvedCount: number;
  canChangePublished: boolean;
  applying: boolean;
  onCancel: () => void;
  onApply: (updates: BatchPriceUpdate[]) => void;
}) {
  const [mode, setMode] = useState<BatchPriceMode>("fill-empty");
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("fill-empty");
    setPrice(null);
  }, [open]);

  const priceReady = price != null && price > 0 && price <= MAX_BATCH_PRICE;
  const rows = useMemo(
    () => priceReady
      ? planBatchPrices({
          products,
          price,
          mode,
          canChangePublished,
        })
      : [],
    [canChangePublished, mode, price, priceReady, products],
  );
  const updates = rows.flatMap((row) => row.updates);
  const unchangedCount = rows.filter((row) => row.updates.length === 0).length;

  return (
    <Modal
      title="批量设置成交价"
      open={open}
      width={720}
      okText="确认改价"
      cancelText="取消"
      confirmLoading={applying}
      okButtonProps={{ disabled: loading || !priceReady || updates.length === 0 }}
      onOk={() => onApply(updates)}
      onCancel={onCancel}
      destroyOnHidden
    >
      {loading ? (
        <AdminLoadingState subject="所选商品" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <p style={{ margin: 0 }}>
            只改直接销售的成交价。仅展示、选款咨询、预约到店和定制咨询会列出来，但不会写入价格。
          </p>
          <Radio.Group
            value={mode}
            onChange={(event) => setMode(event.target.value as BatchPriceMode)}
          >
            <Space direction="vertical">
              <Radio value="fill-empty">只填还没标价的规格，已经标价的保持不变</Radio>
              <Radio value="overwrite">覆盖全部有效规格，已经标过的价格也会改成这个成交价</Radio>
            </Space>
          </Radio.Group>
          <InputNumber
            aria-label="成交价"
            min={0.01}
            max={MAX_BATCH_PRICE}
            precision={2}
            prefix="¥"
            addonAfter="元"
            style={{ width: 220 }}
            value={price}
            placeholder="填写成交价"
            onChange={(value) => setPrice(typeof value === "number" ? value : null)}
          />
          {unresolvedCount > 0 && (
            <Alert
              showIcon
              type="warning"
              message={`${unresolvedCount} 件商品没能读到最新资料，这次不会改价`}
            />
          )}
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rows}
            locale={{ emptyText: priceReady ? "没有可预览的商品" : "先填写大于 0 的成交价，再看哪些规格会改" }}
            columns={[
              { title: "商品", dataIndex: "productName", width: 220 },
              { title: "这次会怎样", dataIndex: "detail" },
            ]}
          />
          {priceReady && (
            <p style={{ margin: 0 }}>
              将修改 {updates.length} 个规格，{unchangedCount} 件商品这次不改。
            </p>
          )}
        </Space>
      )}
    </Modal>
  );
}
