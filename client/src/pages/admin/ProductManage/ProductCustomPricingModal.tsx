import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, InputNumber, Modal, Radio, Space, Spin } from "antd";
import { productApi } from "@/services/api";
import { requestStatus } from "@/services/httpClient";
import { useAuthStore } from "@/store/authStore";
import { currentSessionEpoch, isCurrentSessionEpoch } from "@/services/sessionEpoch";
import { unwrapResponse } from "@/utils/unwrap";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import type { Product } from "@/types";

type Props = {
  selectedIds: number[];
  onCancel: () => void;
  onUpdated: () => void;
};

// 与 AdminProductQueryDto.pageSize 的服务端上限一致。
const BATCH_PREVIEW_PAGE_SIZE = 50;

export function ProductCustomPricingModal({ selectedIds, onCancel, onUpdated }: Props) {
  const { message } = App.useApp();
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [price, setPrice] = useState<number | null>(1000);
  const [targets, setTargets] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const validPrice = price !== null && Number.isFinite(price) && price > 0 && price <= 9_999_999;
  const applyingRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionEpoch = useRef(currentSessionEpoch("admin"));
  const selectedKey = selectedIds.join(",");
  const hasSession = () => mountedRef.current && isCurrentSessionEpoch("admin", sessionEpoch.current)
    && ["SUPER_ADMIN", "ADMIN"].includes(useAuthStore.getState().user?.role || "");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setTargets([]);
    void (async () => {
      try {
        if (!hasSession()) throw new Error("员工会话已变化，请重新打开后再试。");
        if (scope === "selected" && !selectedKey) return;
        const collected = new Map<number, Product>();
        let expectedTotal: number | undefined;
        for (let page = 1; ; page += 1) {
          const result = unwrapResponse<{ list: Product[]; total: number }>(await productApi.getList({
            page, pageSize: BATCH_PREVIEW_PAGE_SIZE, sortBy: "code_asc",
            ...(scope === "selected" ? { ids: selectedKey } : {}),
          }, controller.signal));
          if (controller.signal.aborted) return;
          if (!hasSession()) throw new Error("员工会话已变化，请重新打开后再试。");
          if (!result || !Array.isArray(result.list) || !Number.isInteger(result.total) || result.total < 0) {
            throw new Error("无法核对商品范围，请重新加载后再试。");
          }
          if (expectedTotal !== undefined && expectedTotal !== result.total) {
            throw new Error("商品数量已变化，请重新加载后核对范围。");
          }
          expectedTotal = result.total;
          for (const product of result.list) collected.set(product.id, product);
          if (collected.size >= expectedTotal) break;
          if (!result.list.length || page * BATCH_PREVIEW_PAGE_SIZE >= expectedTotal) {
            throw new Error("未能完整读取商品范围，请重新加载后再试。");
          }
        }
        const eligible = [...collected.values()].filter((product) => product.status !== "ARCHIVED"
          && !("deletedAt" in product && product.deletedAt));
        if (scope === "selected" && eligible.length !== selectedKey.split(",").length) {
          throw new Error("部分勾选商品已变化或无法读取，请关闭并刷新列表后重试。");
        }
        setTargets(eligible);
      } catch (failure) {
        if (!controller.signal.aborted) setError(getSafeAdminErrorMessage(failure, "商品范围加载失败，请重试。"));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [scope, selectedKey, attempt]);

  const apply = async () => {
    if (applyingRef.current || loading || !targets.length || !validPrice || price === null || !hasSession()) return;
    applyingRef.current = true;
    setApplying(true);
    setProgress(0);
    setError("");
    const failed: Product[] = [];
    let succeeded = 0;
    let firstFailure: unknown;
    let stopped = false;
    try {
      // 顺序执行，保留每件商品现有事务、权限与发布检查；失败项可单独重试。
      for (const product of targets) {
        if (stopped || !hasSession()) {
          failed.push(product);
          continue;
        }
        try {
          const saved: Product = unwrapResponse<Product>(await productApi.update(product.id, { salesMode: "CUSTOM_INQUIRY", priceMin: price }));
          if (saved?.id !== product.id || saved.salesMode !== "CUSTOM_INQUIRY" || Number(saved.priceMin) !== price) {
            throw new Error("服务端未确认保存定制起价，请核对后台版本并重新加载后再试。");
          }
          succeeded += 1;
        } catch (failure) {
          failed.push(product);
          firstFailure ??= failure;
          const status = requestStatus(failure);
          if (status === 401 || status === 403 || status === 429 || status === undefined || status >= 500) stopped = true;
        }
        setProgress(succeeded + failed.length);
      }
      if (!hasSession()) return;
      if (succeeded) onUpdated();
      if (!failed.length) {
        message.success(`已将 ${succeeded} 件商品设为预约定制，参考起价 ¥${price.toLocaleString()}。`);
        onCancel();
      } else {
        setTargets(failed);
        setError(`已更新 ${succeeded} 件，${failed.length} 件未确认完成。${getSafeAdminErrorMessage(firstFailure, "请核对商品最新状态后重试。")}`);
      }
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  return <Modal open title="统一设置预约定制" width={640} maskClosable={!applying} closable={!applying}
    onCancel={() => { if (!applying) onCancel(); }}
    footer={<Space wrap>
      <Button disabled={applying} onClick={onCancel}>取消</Button>
      <Button type="primary" loading={applying} disabled={loading || !targets.length || !validPrice}
        onClick={() => void apply()}>{applying ? `正在修改 ${progress}/${targets.length}` : `确认修改 ${targets.length} 件商品`}</Button>
    </Space>}>
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Radio.Group value={scope} disabled={applying} onChange={(event) => setScope(event.target.value)}>
        <Space wrap><Radio value="all">全部非回收站商品</Radio><Radio value="selected" disabled={!selectedIds.length}>已勾选的 {selectedIds.length} 件</Radio></Space>
      </Radio.Group>
      <label>定制参考起价（元）<InputNumber aria-label="定制参考起价（元）" min={0.01} max={9_999_999}
        precision={2} value={price} onChange={setPrice} disabled={applying} style={{ width: "100%" }} /></label>
      <Alert type="info" showIcon message="统一改为预约定制，前台显示参考起价。最终金额以确认定制方案后的报价为准。"
        description="包含草稿、仓库与已上架商品；回收站不在范围内。已上架商品保存后会更新前台。SKU 成交价、库存及历史订单金额保留，标准零售加购和下单将按定制模式停止。" />
      {error && <Alert type="warning" showIcon message={error} action={!targets.length && !applying
        ? <Button size="small" onClick={() => setAttempt((value) => value + 1)}>重新加载</Button> : undefined} />}
      {loading ? <Spin aria-label="正在核对商品范围" /> : <div>
        <p>本次范围：{targets.length} 件商品；{scope === "all" ? "包含其他分页的商品，不受列表筛选影响。" : "仅包含勾选的商品。"}</p>
        <ul aria-label="本次修改的商品" style={{ maxHeight: 200, overflowY: "auto", paddingInlineStart: 20 }}>
          {targets.map((product) => <li key={product.id}>{product.name || "珠宝作品"} · {product.code}</li>)}
        </ul>
      </div>}
    </Space>
  </Modal>;
}
