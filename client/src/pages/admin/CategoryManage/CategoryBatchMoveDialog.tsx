import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Select } from "antd";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { productApi } from "@/services/api";
import { currentSessionEpoch, isCurrentSessionEpoch } from "@/services/sessionEpoch";
import type { ProductListItem } from "../ProductManage/productManageModel";
import { categoryMoveOptions, getCategoryPath, subtreeIds, type CatTreeNode } from "./categoryManageModel";
import "./CategoryBatchMoveDialog.css";

type MoveFailure = { product: ProductListItem; message: string };

export default function CategoryBatchMoveDialog({
  products, tree, onCancel, onBusyChange, onApplied,
}: Readonly<{
  products: ProductListItem[];
  tree: CatTreeNode[];
  onCancel: () => void;
  onBusyChange: (moving: boolean) => void;
  onApplied: (completedIds: number[], moved: number, failed: number) => Promise<void>;
}>) {
  const [target, setTarget] = useState<number>();
  const [moving, setMoving] = useState(false);
  const [failures, setFailures] = useState<MoveFailure[]>([]);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const excluded = new Set<number>();
  function excludeInactive(nodes: CatTreeNode[]) {
    for (const node of nodes) {
      if (node.isActive === false) subtreeIds(node).forEach((id) => excluded.add(id));
      else if (node.children?.length) excludeInactive(node.children);
    }
  }
  excludeInactive(tree);
  const destinations = categoryMoveOptions(tree, excluded);
  const destination = destinations.find((option) => option.value === target);
  const changes = destination ? products.filter((product) => product.categoryId !== destination.value) : [];
  const skipped = destination ? products.length - changes.length : 0;

  async function apply() {
    if (!destination || !changes.length || running.current) return;
    running.current = true;
    setMoving(true);
    onBusyChange(true);
    setFailures([]);
    const epoch = currentSessionEpoch("admin");
    const succeeded: number[] = [];
    const failed: MoveFailure[] = [];
    try {
      for (let start = 0; start < changes.length; start += 3) {
        if (!mounted.current) break;
        if (!isCurrentSessionEpoch("admin", epoch)) {
          for (const product of changes.slice(start)) failed.push({ product, message: "登录状态已变化，此商品未提交。" });
          break;
        }
        const batch = changes.slice(start, start + 3);
        const results = await Promise.allSettled(batch.map((product) =>
          productApi.update(
            product.id,
            { categoryId: destination.value, expectedCategoryId: product.categoryId },
            { suppressGlobalError: true },
          )));
        results.forEach((result, index) => {
          const product = batch[index];
          if (result.status === "fulfilled") succeeded.push(product.id);
          else failed.push({
            product,
            message: getSafeAdminErrorMessage(result.reason, "未能改分类。请检查商品状态和目标分类后重试。"),
          });
        });
      }
      if (!mounted.current) return;
      const unchanged = products.filter((product) => product.categoryId === destination.value).map((product) => product.id);
      setFailures(failed);
      await onApplied([...succeeded, ...unchanged], succeeded.length, failed.length);
    } finally {
      running.current = false;
      if (mounted.current) setMoving(false);
      onBusyChange(false);
    }
  }

  return (
    <Modal
      title="批量改分类"
      open
      okText={destination ? `确认移动 ${changes.length} 件` : "确认移动"}
      cancelText="取消"
      okButtonProps={{ disabled: !changes.length }}
      confirmLoading={moving}
      cancelButtonProps={{ disabled: moving }}
      keyboard={!moving}
      maskClosable={!moving}
      closable={!moving}
      onCancel={() => { if (!moving) onCancel(); }}
      onOk={() => void apply()}
    >
      <div className="cat-batch-dialog">
        <label className="cat-batch-dialog__field">
          目标分类
          <Select
            aria-label="目标分类"
            placeholder="搜索并选择目标分类"
            showSearch
            optionFilterProp="label"
            options={destinations}
            value={target}
            disabled={moving}
            onChange={(value) => { setTarget(value); setFailures([]); }}
          />
        </label>
        <p>已选 {products.length} 件{destination ? `，将移动 ${changes.length} 件` : ""}{skipped > 0 ? `，${skipped} 件已在目标分类` : ""}。</p>
        {products.some((product) => product.status === "PUBLISHED") ? (
          <Alert type="info" showIcon message="已上架商品移动成功后，选款中心的分类归属也会更新。" />
        ) : null}
        {failures.length > 0 ? <Alert type="warning" showIcon message={`${failures.length} 件未移动，已保留选择。`} /> : null}
        <ul aria-label="已选商品" className="cat-batch-dialog__items">
          {products.map((product) => {
            const from = getCategoryPath(tree, product.categoryId).map((node) => node.name).join(" / ");
            const failure = failures.find((entry) => entry.product.id === product.id);
            const original = from || product.category?.name || "原分类";
            return <li key={product.id}><strong>{product.name}</strong><span>{product.code} · {original}{destination && product.categoryId !== destination.value ? ` → ${destination.label}` : ""}</span>
              {failure ? <span role="status">{failure.message}</span> : null}</li>;
          })}
        </ul>
      </div>
    </Modal>
  );
}
