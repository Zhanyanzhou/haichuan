import { useEffect, useMemo, useState } from "react";
import { Alert, App as AntdApp, Input, InputNumber, Modal, Table } from "antd";
import { AdminLoadingState } from "@/components/common/AdminDataStates";
import {
  planBatchStock,
  type BatchStockSource,
  type BatchStockUpdate,
} from "./productBatchStock";

const MAX_BATCH_STOCK = 1_000_000;

export function ProductBatchStockModal({
  open,
  loading,
  records,
  missingProductNames,
  truncated,
  applying,
  onCancel,
  onApply,
}: {
  open: boolean;
  loading: boolean;
  records: BatchStockSource[];
  missingProductNames: string[];
  truncated: boolean;
  applying: boolean;
  onCancel: () => void;
  onApply: (updates: BatchStockUpdate[], remark: string) => void;
}) {
  const { modal } = AntdApp.useApp();
  const [quantity, setQuantity] = useState<number | null>(null);
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuantity(null);
    setRemark("");
  }, [open]);

  const quantityReady = quantity != null
    && Number.isInteger(quantity)
    && quantity >= 0
    && quantity <= MAX_BATCH_STOCK;
  const rows = useMemo(
    () => quantityReady
      ? planBatchStock({ records, missingProductNames, quantity })
      : [],
    [missingProductNames, quantity, quantityReady, records],
  );
  const updates = rows.flatMap((row) => (row.update ? [row.update] : []));
  const unchangedCount = rows.length - updates.length;
  const reason = remark.trim();

  const submit = async () => {
    if (!quantityReady || updates.length === 0 || !reason) return;
    if (quantity === 0 || quantity >= 10) {
      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: quantity === 0 ? "确认把这些库存调整为 0？" : "确认这次较大的库存调整？",
          content: `将修改 ${updates.length} 条库存记录，目标数量是 ${quantity}。`,
          okText: "确认调整",
          cancelText: "返回修改",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    onApply(updates, reason);
  };

  return (
    <Modal
      title="批量设置库存"
      open={open}
      width={760}
      okText="确认改库存"
      cancelText="取消"
      confirmLoading={applying}
      okButtonProps={{
        disabled: loading || !quantityReady || updates.length === 0 || reason.length === 0,
      }}
      onOk={() => void submit()}
      onCancel={onCancel}
      destroyOnHidden
    >
      {loading ? (
        <AdminLoadingState subject="所选商品的库存" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0 }}>
            每条库存按仓库和规格分别改成这个数量。已有价格和商品资料不会变。一件一物的总量只能是 0 或 1。
          </p>
          <InputNumber
            aria-label="目标库存"
            min={0}
            max={MAX_BATCH_STOCK}
            precision={0}
            style={{ width: 220 }}
            value={quantity}
            placeholder="填写目标数量"
            onChange={(value) => setQuantity(typeof value === "number" ? value : null)}
          />
          <Input.TextArea
            aria-label="调整原因"
            maxLength={200}
            rows={2}
            value={remark}
            placeholder="填写这次调整的原因，例如到货、盘点或售出"
            onChange={(event) => setRemark(event.target.value)}
          />
          {truncated && (
            <Alert
              showIcon
              type="warning"
              message="库存记录较多，这次只预览已读取的部分"
            />
          )}
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rows}
            locale={{ emptyText: quantityReady ? "没有可预览的库存" : "先填写 0 或正整数，再看哪些库存会改" }}
            columns={[
              { title: "商品", dataIndex: "productName", width: 220 },
              { title: "这次会怎样", dataIndex: "detail" },
            ]}
          />
          {quantityReady && (
            <p style={{ margin: 0 }}>
              将修改 {updates.length} 条库存，{unchangedCount} 条这次不改。
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
