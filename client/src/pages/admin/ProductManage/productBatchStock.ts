export type BatchStockSource = {
  id: number;
  productId: number;
  productName: string;
  skuCode: string;
  warehouse: string;
  quantity: number;
  inventoryPolicy?: string | null;
};

export type BatchStockUpdate = {
  id: number;
  quantity: number;
  expectedQuantity: number;
};

export type BatchStockPlanRow = {
  key: string;
  productName: string;
  detail: string;
  update: BatchStockUpdate | null;
};

function locationLabel(record: BatchStockSource) {
  const warehouse = record.warehouse.trim() || "未命名仓库";
  const sku = record.skuCode.trim() || "未命名规格";
  return `${warehouse} · ${sku}`;
}

export function planBatchStock(input: {
  records: BatchStockSource[];
  missingProductNames: string[];
  quantity: number;
}): BatchStockPlanRow[] {
  const quantity = input.quantity;
  const grouped = new Map<number, BatchStockSource[]>();
  for (const record of input.records) {
    const rows = grouped.get(record.productId) ?? [];
    rows.push(record);
    grouped.set(record.productId, rows);
  }

  const rows: BatchStockPlanRow[] = [];
  for (const records of grouped.values()) {
    const singleUnit = records.some((record) => record.inventoryPolicy === "SINGLE_UNIT");
    const blocked = singleUnit && quantity > 1
      ? "一件一物的库存只能是 0 或 1"
      : singleUnit && quantity === 1 && records.length > 1
        ? "一件一物有多条库存，请到库存页逐条调整，避免总量超过 1"
        : null;
    for (const record of records) {
      if (blocked) {
        rows.push({
          key: `stock-${record.id}`,
          productName: record.productName,
          detail: `${locationLabel(record)}：${blocked}`,
          update: null,
        });
        continue;
      }
      if (record.quantity === quantity) {
        rows.push({
          key: `stock-${record.id}`,
          productName: record.productName,
          detail: `${locationLabel(record)}：已经是 ${quantity}，保持不变`,
          update: null,
        });
        continue;
      }
      rows.push({
        key: `stock-${record.id}`,
        productName: record.productName,
        detail: `${locationLabel(record)}：${record.quantity} → ${quantity}`,
        update: {
          id: record.id,
          quantity,
          expectedQuantity: record.quantity,
        },
      });
    }
  }

  input.missingProductNames.forEach((productName, index) => {
    rows.push({
      key: `missing-${index}`,
      productName,
      detail: "没有库存记录，这次不会新建",
      update: null,
    });
  });
  return rows;
}
