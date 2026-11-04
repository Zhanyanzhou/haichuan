import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp } from "antd";
import AntdProvider from "@/components/common/AntdProvider";
import { SecureImage } from "@/components/common/SecureImage";
import SelectionTray from "@/pages/public/Catalog/SelectionTray";
import type { SelectionLookupState } from "@/pages/public/Catalog/SelectionTray";
import { useProductData, type ProductQuery } from "@/hooks/useProductData";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { useSelectionStore } from "@/store/selectionStore";
import { getListingImage } from "@/utils/productImage";
import { publicProductPath } from "@/utils/publicProductPath";
import { withPublicMediaWidth } from "@/utils/publicMediaWidth";
import { clampProductTitle } from "@/utils/productTitleLength";

function SelectionBagContent() {
  const { message } = AntdApp.useApp();
  const setPageMeta = usePageMetaStore((state) => state.setMeta);
  const clearPageMeta = usePageMetaStore((state) => state.clear);
  const ready = useSelectionStore((state) => state.ready);
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const removeMany = useSelectionStore((state) => state.removeMany);
  const selectedIdsKey = useMemo(
    () => Array.from(selectedIds).sort((left, right) => left - right).join(","),
    [selectedIds],
  );
  const selectedQuery = useMemo<ProductQuery | null>(
    () =>
      ready && selectedIdsKey
        ? {
            ids: selectedIdsKey,
            page: 1,
            pageSize: Math.min(2_000, selectedIds.size),
            sortBy: "sortOrder",
          }
        : null,
    [ready, selectedIds.size, selectedIdsKey],
  );
  const {
    products,
    total,
    loading,
    error,
    reload,
    queryKey,
    dataQueryKey,
  } = useProductData(selectedQuery, {
    subscribe: false,
    loadCategories: false,
  });
  const responseCurrent = dataQueryKey === queryKey;
  const responseComplete = products.length >= total;
  const lookupState: SelectionLookupState = !ready || selectedIds.size === 0
    ? "ready"
    : error || (!loading && responseCurrent && !responseComplete)
      ? "error"
      : loading || !responseCurrent
        ? "loading"
        : "ready";
  const orderedProducts = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return Array.from(selectedIds).flatMap((id) => {
      const product = byId.get(id);
      return product ? [product] : [];
    });
  }, [products, selectedIds]);
  const reconciliationRef = useRef("");

  useEffect(() => {
    setPageMeta({
      title: "购物袋 | 海川珠宝",
      description: "查看已选作品。线上购买尚未开放时，可以把心仪作品交给顾问。",
    });
    return () => clearPageMeta();
  }, [clearPageMeta, setPageMeta]);

  useEffect(() => {
    if (!selectedQuery || lookupState !== "ready") return;
    const validIds = new Set(products.map((product) => product.id));
    const signature = `${dataQueryKey}|${Array.from(validIds).sort((left, right) => left - right).join(",")}`;
    if (reconciliationRef.current === signature) return;
    reconciliationRef.current = signature;
    const invalidIds = Array.from(selectedIds).filter((id) => !validIds.has(id));
    if (!invalidIds.length) return;
    removeMany(invalidIds);
    message.warning(`已移除 ${invalidIds.length} 款当前不可用的作品`);
  }, [
    dataQueryKey,
    lookupState,
    message,
    products,
    removeMany,
    selectedIds,
    selectedQuery,
  ]);

  const hasVisibleSelection = orderedProducts.length > 0;
  const waitingForSelection = !ready || (
    selectedIds.size > 0 && lookupState === "loading" && !hasVisibleSelection
  );
  const lookupFailed = selectedIds.size > 0 && lookupState === "error";
  const visibleProducts = lookupFailed ? [] : orderedProducts;

  return (
    <div className="shopping-bag">
      <header className="shopping-bag__intro">
        <h1>购物袋</h1>
        <p>线上购买尚未开放。您可以先去选款，或把需求交给顾问。</p>
      </header>

      {waitingForSelection ? (
        <p className="shopping-bag__status" role="status">正在读取已选作品</p>
      ) : null}

      {lookupFailed ? (
        <div className="shopping-bag__status" role="alert">
          <p>已选作品暂时无法确认，请重新读取后再交给顾问。</p>
          <button type="button" onClick={() => reload()}>重新读取</button>
        </div>
      ) : null}

      {!waitingForSelection && !lookupFailed && visibleProducts.length === 0 ? (
        <div className="shopping-bag__empty">
          <p>购物袋里还没有作品。</p>
          <div className="shopping-bag__actions">
            <Link to="/catalog" className="btn btn-primary">去选款</Link>
            <Link to="/contact" className="shopping-bag__quiet">联系顾问</Link>
          </div>
        </div>
      ) : null}

      {visibleProducts.length > 0 ? (
        <div className="shopping-bag__filled">
          <p className="shopping-bag__count">已选 {visibleProducts.length} 款</p>
          <ul className="shopping-bag__list" aria-label="购物袋中的作品">
            {visibleProducts.map((product) => {
              const name = clampProductTitle(product.name || product.sku);
              return (
                <li key={product.id}>
                  <Link to={publicProductPath(product)} className="shopping-bag__piece">
                    <span className="shopping-bag__image">
                      <SecureImage
                        src={withPublicMediaWidth(product.images?.[0] || getListingImage(product), 480)}
                        alt=""
                        width={96}
                        height={120}
                      />
                    </span>
                    <span className="shopping-bag__copy">
                      <span className="shopping-bag__name">{name}</span>
                      <span className="shopping-bag__sku">作品编号 {product.sku}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeMany([product.id])}
                    aria-label={`移除 ${name}`}
                  >
                    移除
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="shopping-bag__actions">
            <SelectionTray
              products={visibleProducts}
              lookupState="ready"
              onRetry={() => reload()}
              presentation="page"
            />
            <Link to="/catalog" className="shopping-bag__quiet">继续选款</Link>
          </div>
        </div>
      ) : (
        <div className="shopping-bag__actions shopping-bag__actions--reserve">
          {waitingForSelection || lookupFailed ? (
            <Link to="/catalog" className="btn btn-primary">去选款</Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** 交易关闭时的购物袋：收纳选款，不进入结算。 */
export default function SelectionBag() {
  return (
    <AntdProvider>
      <SelectionBagContent />
    </AntdProvider>
  );
}
