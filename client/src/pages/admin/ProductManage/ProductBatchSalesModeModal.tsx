import { useState } from "react";
import { Alert, Modal, Select } from "antd";
import type { SalesMode } from "@/types";
import { salesModeLabels, type ProductListItem } from "./productManageModel";

export type SalesModeTarget = ProductListItem & { salesMode: SalesMode };

export function ProductBatchSalesModeModal({
  products, applying, onCancel, onApply,
}: Readonly<{
  products: SalesModeTarget[];
  applying: boolean;
  onCancel: () => void;
  onApply: (salesMode: SalesMode, changes: SalesModeTarget[]) => Promise<void>;
}>) {
  const [targetMode, setTargetMode] = useState<SalesMode>();
  const changes = targetMode ? products.filter(({ salesMode }) => salesMode !== targetMode) : [];
  const unchanged = targetMode ? products.length - changes.length : 0;
  const changesDirectSales = changes.some(({ salesMode, status }) =>
    salesMode === "DIRECT_PURCHASE" && status === "PUBLISHED");

  return (
    <Modal
      title="批量改销售方式"
      open
      width={580}
      confirmLoading={applying}
      okText={targetMode ? `确认修改 ${changes.length} 件商品` : "确认修改"}
      okButtonProps={{ disabled: changes.length === 0 }}
      cancelText="取消"
      cancelButtonProps={{ disabled: applying }}
      closable={!applying}
      keyboard={!applying}
      maskClosable={!applying}
      onCancel={onCancel}
      onOk={() => { if (targetMode) void onApply(targetMode, changes); }}
    >
      <div className="product-manage__sales-mode-fields">
        <label className="product-manage__sales-mode-fields">
          目标销售方式
          <Select<SalesMode>
            aria-label="目标销售方式"
            placeholder="请选择销售方式"
            options={Object.entries(salesModeLabels).map(([value, label]) => ({ value: value as SalesMode, label }))}
            value={targetMode}
            onChange={setTargetMode}
            disabled={applying}
          />
        </label>
        <div>已选 {products.length} 件{targetMode ? `，将修改 ${changes.length} 件` : ""}{unchanged > 0 ? `，${unchanged} 件已是目标方式` : ""}。</div>
        <Alert
          type={changesDirectSales ? "warning" : "info"}
          showIcon
          message={changesDirectSales
            ? "已上架的直接销售商品切换后，将停止标准零售加购和下单。"
            : "已上架商品保存后会更新顾客看到的操作。"}
          description={targetMode === "DIRECT_PURCHASE"
            ? "已上架商品改为直接销售时，须通过规格、成交价和运费模板等发布校验。"
            : "沿用每件商品已有的价格和库存设置。"}
        />
        <ul className="product-manage__batch-list" aria-label="选中的商品">
          {products.map(({ id, name, code, salesMode }) => (
            <li key={id}>
              <strong>{name}</strong> · {code} · {salesModeLabels[salesMode]}
              {targetMode && targetMode !== salesMode ? ` → ${salesModeLabels[targetMode]}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
