import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { App as AntdApp } from "antd";
import { cartApi, customerApi, productApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getMaterialLabel } from "@/utils/material";
import type { CatalogProduct } from "@/data/catalogData";
import type { InventoryPolicy, Product, ProductImage } from "@/types";
import { trackRemoveFromCart, trackViewCart } from "@/hooks/useAnalytics";
import { getRequestErrorMessage } from "@/services/httpClient";
import RouteLoading from "@/components/common/RouteLoading";
import { clampProductTitle } from "@/utils/productTitleLength";
import { useCommerceCapabilities } from "@/store/featureFlags";
import { SecureImage } from "@/components/common/SecureImage";
import { formatPrice } from "@/utils/format";
import { getListingImage } from "@/utils/productImage";
import { publicProductInquiryPath, publicProductPath } from "@/utils/publicProductPath";
import { addListingToCart } from "@/utils/addListingToCart";
import { useProductData, type ProductQuery } from "@/hooks/useProductData";
import { useSelectionStore } from "@/store/selectionStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import SelectionTray from "@/pages/public/Catalog/SelectionTray";
import "./Cart.css";

type CartItem = {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  product: {
    name: string;
    code?: string | null;
    images?: ProductImage[] | string[];
    goldWeight?: number | string | null;
    inventoryPolicy?: InventoryPolicy;
  };
  sku: {
    material: string;
    size?: string | null;
    color?: string | null;
    skuCode?: string | null;
    goldWeight?: number | string | null;
    price: number | string;
    inventories?: Array<{ quantity: number | string }>;
  };
  availability?: {
    available: boolean;
    status:
      | "AVAILABLE"
      | "PRODUCT_UNAVAILABLE"
      | "SKU_UNAVAILABLE"
      | "OUT_OF_STOCK"
      | "INSUFFICIENT_STOCK"
      | "QUANTITY_INVALID";
    message: string | null;
  };
};

type UndoPiece = {
  productId: number;
  skuId: number;
  quantity: number;
  name: string;
};

const getItemPrice = (item: CartItem) => Number(item.sku.price || 0);
const getItemGoldWeight = (item: CartItem) =>
  Number(item.sku.goldWeight ?? item.product.goldWeight ?? 0);

function stockCount(item: CartItem): number | null {
  if (!Array.isArray(item.sku.inventories)) return null;
  return item.sku.inventories.reduce(
    (sum, row) => sum + Math.max(0, Number(row.quantity) || 0),
    0,
  );
}

function specParts(item: CartItem): string[] {
  const weight = getItemGoldWeight(item);
  const material = item.sku.material ? getMaterialLabel(item.sku.material) : "";
  return [
    material,
    item.sku.color?.trim() || null,
    item.sku.size?.trim() ? `规格 ${item.sku.size.trim()}` : null,
    Number.isFinite(weight) && weight > 0 ? `金重 ${weight.toFixed(2)} g` : null,
  ].filter((part): part is string => Boolean(part));
}

function HeldSelections() {
  const ready = useSelectionStore((state) => state.ready);
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const removeMany = useSelectionStore((state) => state.removeMany);
  const loggedIn = useCustomerAuthStore((state) => state.isLoggedIn);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [moveError, setMoveError] = useState("");
  const selectedIdsKey = useMemo(
    () => Array.from(selectedIds).sort((left, right) => left - right).join(","),
    [selectedIds],
  );
  const selectedQuery = useMemo<ProductQuery | null>(
    () => (ready && selectedIdsKey
      ? { ids: selectedIdsKey, page: 1, pageSize: Math.min(2_000, selectedIds.size), sortBy: "sortOrder" }
      : null),
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
    requireFresh: true,
  });
  const responseCurrent = dataQueryKey === queryKey;
  const responseComplete = products.length >= total;
  const lookupFailed = ready && selectedIds.size > 0 && (Boolean(error) || (!loading && responseCurrent && !responseComplete));
  const lookupLoading = ready && selectedIds.size > 0 && !lookupFailed && (loading || !responseCurrent);
  const orderedProducts = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return Array.from(selectedIds).flatMap((id) => {
      const product = byId.get(id);
      return product ? [product] : [];
    });
  }, [products, selectedIds]);

  if (!ready || selectedIds.size === 0) return null;

  const moveToWishlist = async (productId: number) => {
    setMovingId(productId);
    setMoveError("");
    try {
      await customerApi.setFavorite(productId, true);
      removeMany([productId]);
    } catch {
      setMoveError("暂时无法移入心愿单，请稍后再试。");
    } finally {
      setMovingId(null);
    }
  };

  return (
    <section className="cart-page__held" aria-labelledby="cart-held-heading">
      <h2 id="cart-held-heading">尚不能直接购买</h2>
      <p>这些作品已加入选款。可以交给顾问比较，或移入心愿单继续看。</p>
      {lookupFailed ? (
        <p role="alert">
          选款作品暂时无法读取。
          <button type="button" className="cart-page__text-link" onClick={() => reload()}>重试</button>
        </p>
      ) : null}
      {lookupLoading ? <p role="status">正在读取选款作品</p> : null}
      {!lookupFailed && !lookupLoading && orderedProducts.length === 0 ? (
        <p>选款记录还在，作品详情暂时对不上。可以先去选款页核对。</p>
      ) : null}
      {orderedProducts.length > 0 ? (
        <>
          <ul className="cart-page__held-list">
            {orderedProducts.map((product) => {
              const name = clampProductTitle(product.name || product.sku);
              const moving = movingId === product.id;
              return (
                <li key={product.id}>
                  <Link to={publicProductPath(product)} className="cart-page__held-piece">
                    <SecureImage src={getListingImage(product)} alt="" width={72} height={90} />
                    <span>{name}</span>
                  </Link>
                  {loggedIn ? (
                    <button
                      type="button"
                      className="cart-page__text-link"
                      disabled={moving}
                      onClick={() => void moveToWishlist(product.id)}
                    >
                      {moving ? "正在移入" : "移入心愿单"}
                    </button>
                  ) : (
                    <Link to="/customer" className="cart-page__text-link">登录后收入心愿单</Link>
                  )}
                </li>
              );
            })}
          </ul>
          {moveError ? <p role="alert">{moveError}</p> : null}
          <SelectionTray
            products={orderedProducts}
            lookupState={lookupFailed ? "error" : lookupLoading ? "loading" : "ready"}
            onRetry={() => reload()}
            presentation="page"
          />
        </>
      ) : null}
    </section>
  );
}

function CartSuggestions({ onAdded }: { onAdded: () => Promise<void> }) {
  const navigate = useNavigate();
  const query = useMemo<ProductQuery>(() => ({
    page: 1,
    pageSize: 8,
    sortBy: "sortOrder",
    salesMode: "DIRECT_PURCHASE",
  }), []);
  const { products, loading, error } = useProductData(query, {
    subscribe: false,
    loadCategories: false,
  });
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addError, setAddError] = useState("");
  const picks = products.slice(0, 4);
  if (loading || error || picks.length === 0) return null;

  const addPick = async (product: CatalogProduct) => {
    setAddingId(product.id);
    setAddError("");
    try {
      const result = await addListingToCart(product);
      if (result.status === "choose-specification") {
        navigate(result.path);
        return;
      }
      if (result.status !== "added") {
        setAddError("这件作品目前不能直接加入购物袋，请先查看详情。");
        return;
      }
      await onAdded();
    } catch (caught: unknown) {
      setAddError(getRequestErrorMessage(caught, "暂时无法加入购物袋。"));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section className="cart-page__picks" aria-labelledby="cart-picks-heading">
      <div className="cart-page__section-heading">
        <h2 id="cart-picks-heading">为您精选</h2>
        <p>来自当前在售作品。</p>
      </div>
      <ul>
        {picks.map((product) => {
          const name = clampProductTitle(product.name || product.code || "作品");
          const path = publicProductPath(product);
          const price = Number(product.price);
          return (
            <li key={product.id}>
              <Link to={path} className="cart-page__pick">
                <span className="cart-page__pick-media">
                  <SecureImage src={getListingImage(product)} alt="" width={280} height={280} />
                </span>
                <span className="cart-page__pick-name">{name}</span>
                {Number.isFinite(price) && price > 0 ? <small>{formatPrice(price)}</small> : null}
              </Link>
              <div className="cart-page__pick-actions">
                <Link to={path} className="cart-page__text-link">查看详情</Link>
                <button
                  type="button"
                  className="cart-page__text-link"
                  disabled={addingId !== null}
                  onClick={() => void addPick(product)}
                >
                  {addingId === product.id ? "正在加入" : "加入购物袋"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {addError ? <p role="alert">{addError}</p> : null}
    </section>
  );
}

function BagMark() {
  return (
    <svg className="cart-page__mark" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M16 18.5h16l-1.4 16.5h-13.2L16 18.5z" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M19 18.5v-2.2a5 5 0 0 1 10 0v2.2" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export default function Cart() {
  const { message } = AntdApp.useApp();
  const { flags } = useCommerceCapabilities();
  const completionClosed = flags != null
    && !(flags.commerceEnabled === true && flags.paymentEnabled === true);
  const selectionReady = useSelectionStore((state) => state.ready);
  const heldSelectionCount = useSelectionStore((state) => state.selectedIds.size);
  const hasHeldSelections = selectionReady && heldSelectionCount > 0;
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [undo, setUndo] = useState<UndoPiece[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [policyLoadError, setPolicyLoadError] = useState(false);
  const [cartError, setCartError] = useState("");
  const [notice, setNotice] = useState("");
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const mutatingIdRef = useRef<number | null>(null);

  const loadCart = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(false);
    setPolicyLoadError(false);
    setCartError("");
    try {
      const response = await cartApi.get();
      const items = unwrapResponse<CartItem[]>(response) || [];
      setCartItems(items);
      setLoading(false);
      const missingProductIds = Array.from(new Set(
        items
          .filter((item) => !item.product.inventoryPolicy)
          .map((item) => item.productId),
      ));
      const policies = new Map<number, InventoryPolicy>();
      let failedToLoadPolicies = false;
      if (missingProductIds.length > 0) {
        try {
          const productResponse = await productApi.getPublicList({
            ids: missingProductIds.join(","),
            page: 1,
            pageSize: missingProductIds.length,
          });
          const productPayload = unwrapResponse<{ list?: Product[] } | Product[]>(productResponse);
          const products = Array.isArray(productPayload)
            ? productPayload
            : productPayload?.list ?? [];
          for (const product of products) {
            if (product.inventoryPolicy) policies.set(product.id, product.inventoryPolicy);
          }
        } catch {
          failedToLoadPolicies = true;
        }
      }
      setPolicyLoadError(failedToLoadPolicies);
      setCartItems(items.map((item) => ({
        ...item,
        product: {
          ...item.product,
          inventoryPolicy: item.product.inventoryPolicy || policies.get(item.productId),
        },
      })));
    } catch {
      setLoadError(true);
      setCartItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCart();
  }, []);

  const updateQuantity = async (item: CartItem, quantity: number) => {
    const stock = stockCount(item);
    const maxQuantity = item.product.inventoryPolicy === "SINGLE_UNIT"
      ? 1
      : Math.min(99, stock ?? 99);
    const canRepairQuantity =
      item.availability?.status === "INSUFFICIENT_STOCK" ||
      item.availability?.status === "QUANTITY_INVALID";
    if (
      (item.availability?.available !== true && !canRepairQuantity) ||
      (!item.product.inventoryPolicy && quantity >= item.quantity) ||
      quantity < 1 ||
      quantity > maxQuantity ||
      (stock !== null && quantity > stock) ||
      mutatingIdRef.current !== null
    ) return;
    setCartError("");
    mutatingIdRef.current = item.id;
    setMutatingId(item.id);
    try {
      await cartApi.updateQuantity(item.id, quantity);
      await loadCart(false);
    } catch (error: unknown) {
      const reason = getRequestErrorMessage(error, "更新商品数量失败");
      setCartError(reason);
      message.error(reason);
    } finally {
      mutatingIdRef.current = null;
      setMutatingId(null);
    }
  };

  const deleteItems = async (items: CartItem[]) => {
    if (items.length === 0 || mutatingIdRef.current !== null) return;
    setCartError("");
    setNotice("");
    mutatingIdRef.current = items[0].id;
    setMutatingId(items[0].id);
    const removed: UndoPiece[] = [];
    try {
      for (const item of items) {
        await cartApi.remove(item.id);
        removed.push({
          productId: item.productId,
          skuId: item.skuId,
          quantity: item.quantity,
          name: item.product.name,
        });
        trackRemoveFromCart(item.productId, item.quantity);
      }
      setUndo(removed);
      setNotice(removed.length === 1 ? `已移除${removed[0].name}。` : `已移除 ${removed.length} 件作品。`);
      setCartItems((current) => current.filter((item) => !items.some((target) => target.id === item.id)));
    } catch (error: unknown) {
      const reason = getRequestErrorMessage(error, "移除商品失败");
      setCartError(reason);
      message.error(reason);
      await loadCart(false);
    } finally {
      mutatingIdRef.current = null;
      setMutatingId(null);
    }
  };

  const restoreUndo = async () => {
    if (!undo || mutatingIdRef.current !== null) return;
    setCartError("");
    mutatingIdRef.current = -1;
    setMutatingId(-1);
    try {
      for (const piece of undo) {
        await cartApi.add({
          productId: piece.productId,
          skuId: piece.skuId,
          quantity: piece.quantity,
        });
      }
      setUndo(null);
      setNotice("已放回购物袋。");
      await loadCart(false);
    } catch (error: unknown) {
      const reason = getRequestErrorMessage(error, "暂时无法恢复作品。");
      setCartError(reason);
      message.error(reason);
    } finally {
      mutatingIdRef.current = null;
      setMutatingId(null);
    }
  };

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const merchandise = cartItems.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);
  const goldWeight = cartItems.reduce((sum, item) => sum + getItemGoldWeight(item) * item.quantity, 0);

  useEffect(() => {
    if (!loading && !loadError) trackViewCart(itemCount, merchandise);
  }, [itemCount, loadError, loading, merchandise]);

  const hasUnknownPolicy = cartItems.some((item) => !item.product.inventoryPolicy);
  const hasInvalidSingleUnitQuantity = cartItems.some(
    (item) => item.product.inventoryPolicy === "SINGLE_UNIT" && item.quantity > 1,
  );
  const hasUnknownAvailability = cartItems.some((item) => item.availability === undefined);
  const hasUnavailableItems = cartItems.some((item) => item.availability?.available === false);
  const hasUnknownPrice = cartItems.some((item) => {
    const price = getItemPrice(item);
    return !Number.isFinite(price) || price <= 0;
  });
  const advisorPath = cartItems.length === 1
    ? publicProductInquiryPath(
      { id: cartItems[0].productId, code: cartItems[0].product.code },
      "purchase-support",
    )
    : "/contact?type=purchase-support";
  const canCheckout = cartItems.length > 0
    && !hasUnknownPolicy
    && !hasInvalidSingleUnitQuantity
    && !hasUnknownAvailability
    && !hasUnavailableItems
    && !hasUnknownPrice;
  const busy = mutatingId !== null;
  const needsAttention = policyLoadError || cartItems.some((item) => (
    !item.product.inventoryPolicy || item.availability === undefined || getItemPrice(item) <= 0
  ));

  const checkoutBlock = (
    <div className="cart-page__checkout">
      {canCheckout && !busy && completionClosed ? (
        <Link to={advisorPath} className="cart-page__button">请顾问协助这组作品</Link>
      ) : canCheckout && !busy ? (
        <Link to="/checkout" className="cart-page__button">前往结算</Link>
      ) : (
        <button type="button" className="cart-page__button" disabled>
          {busy ? "正在更新购物袋" : "暂不可结算"}
        </button>
      )}
      {canCheckout && !busy && completionClosed ? (
        <Link to="/checkout" className="cart-page__text-link">核对结算</Link>
      ) : null}
      {canCheckout && completionClosed ? (
        <p className="cart-page__summary-note" role="status">您可以核对此处的作品与金额。暂时不能提交订单或付款。</p>
      ) : null}
      {!canCheckout ? (
        <p className="cart-page__summary-note">请先处理上方有提示的作品，再核对金额。</p>
      ) : null}
      <Link to="/catalog" className="cart-page__text-link">继续购物</Link>
    </div>
  );

  return (
    <div className="cart-page">
      <div className="cart-page__frame">
        <nav className="cart-page__crumb" aria-label="面包屑">
          <Link to="/">首页</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">购物袋</span>
        </nav>
        <header className="cart-page__header">
          <div>
            <h1>购物袋</h1>
            <p>核对您甄选的珠宝、数量与应付金额。</p>
          </div>
          {!loading && !loadError ? <p className="cart-page__count">{itemCount} 件</p> : null}
        </header>

        {loading ? (
          <RouteLoading scope="region" surface="public" label="购物车加载中…" className="cart-page__loading" />
        ) : loadError ? (
          <section className="cart-page__state" aria-labelledby="cart-load-heading">
            <h2 id="cart-load-heading">购物袋暂时无法加载</h2>
            <p role="alert">暂时无法读取您的作品，请重试。</p>
            <button type="button" onClick={() => void loadCart()} className="cart-page__button">重新加载</button>
          </section>
        ) : cartItems.length === 0 ? (
          <>
            <section className="cart-page__empty" aria-labelledby="cart-empty-heading">
              <BagMark />
              <h2 id="cart-empty-heading">您的购物袋目前是空的</h2>
              <p>探索海川珠宝精选系列，发现属于您的优雅与光芒。</p>
              {hasHeldSelections ? <p>还不能直接购买的作品列在下方。</p> : null}
              <div className="cart-page__actions">
                <Link to="/catalog" className="cart-page__button">探索珠宝系列</Link>
                <Link to="/catalog?sort=newest" className="cart-page__button cart-page__button--quiet">查看新品</Link>
              </div>
            </section>
            <CartSuggestions onAdded={() => loadCart(false)} />
          </>
        ) : (
          <>
            {needsAttention ? (
              <div className="cart-page__notice">
                <p role="alert">部分作品的规格、数量规则、金额或库存暂时无法确认。请重新加载，或移除受影响的作品后继续。</p>
                <button type="button" disabled={busy} onClick={() => void loadCart()} className="cart-page__text-link">
                  重新加载
                </button>
              </div>
            ) : null}
            {cartError ? <p className="cart-page__error" role="alert">{cartError}</p> : null}
            {notice ? (
              <p className="cart-page__status" role="status">
                {notice}
                {undo ? (
                  <button type="button" className="cart-page__text-link" disabled={busy} onClick={() => void restoreUndo()}>
                    撤销
                  </button>
                ) : null}
              </p>
            ) : null}

            <div className="cart-page__layout">
              <section className="cart-page__works" aria-labelledby="cart-works-heading">
                <h2 id="cart-works-heading">作品</h2>
                <ul className="cart-page__list">
                  {cartItems.map((item) => {
                    const title = clampProductTitle(item.product.name);
                    const status = item.availability?.status;
                    const available = item.availability?.available === true;
                    const productPath = status && status !== "PRODUCT_UNAVAILABLE"
                      ? publicProductPath({ id: item.productId, code: item.product.code })
                      : null;
                    const singleUnit = item.product.inventoryPolicy === "SINGLE_UNIT";
                    const stock = stockCount(item);
                    const maxQuantity = singleUnit ? 1 : Math.min(99, stock ?? 99);
                    const validQuantity = Math.max(1, Math.min(item.quantity, singleUnit ? 1 : 99));
                    const quantityOutOfRange = status === "QUANTITY_INVALID" || validQuantity !== item.quantity;
                    const repairQuantity = status === "INSUFFICIENT_STOCK" && item.quantity > 1
                      ? (stock !== null && stock >= 1 && stock < item.quantity ? stock : 1)
                      : quantityOutOfRange && item.product.inventoryPolicy && validQuantity !== item.quantity
                        ? validQuantity
                        : null;
                    const unit = getItemPrice(item);
                    const specs = specParts(item);
                    return (
                      <li key={item.id} className="cart-page__item" aria-busy={mutatingId === item.id}>
                        <div className="cart-page__image" aria-hidden="true">
                          <SecureImage
                            src={getListingImage(productPath ? item.product : null)}
                            fallback={getListingImage(null)}
                            alt=""
                            width={160}
                            height={200}
                            deferUntilVisible
                          />
                        </div>
                        <div className="cart-page__piece">
                          <div className="cart-page__piece-head">
                            <h3>
                              {productPath ? <Link to={productPath} title={item.product.name}>{title}</Link> : title}
                            </h3>
                            <p className="cart-page__price">
                              <strong>{formatPrice(unit * item.quantity, "金额待确认")}</strong>
                              <span>单价 {formatPrice(unit, "待确认")}</span>
                            </p>
                          </div>
                          {item.sku.skuCode || item.product.code ? (
                            <p className="cart-page__meta">
                              {item.sku.skuCode ? `SKU ${item.sku.skuCode}` : ""}
                              {item.sku.skuCode && item.product.code ? " · " : ""}
                              {item.product.code ? `作品编号 ${item.product.code}` : ""}
                            </p>
                          ) : null}
                          {specs.length > 0 ? <p className="cart-page__specs">{specs.join(" · ")}</p> : null}
                          {singleUnit && !quantityOutOfRange ? (
                            <p className="cart-page__specs">一物一件，购物袋数量上限为 1。</p>
                          ) : null}
                          <div className="cart-page__item-actions">
                            {available && !quantityOutOfRange ? (
                              <div className="cart-page__quantity" role="group" aria-label={`${item.product.name}数量`}>
                                <button type="button" onClick={() => void updateQuantity(item, item.quantity - 1)} disabled={item.quantity <= 1 || busy} aria-label={`减少${item.product.name}数量`}>−</button>
                                <span aria-live="polite">{item.quantity}</span>
                                <button type="button" onClick={() => void updateQuantity(item, item.quantity + 1)} disabled={!item.product.inventoryPolicy || item.quantity >= maxQuantity || busy} aria-label={`增加${item.product.name}数量`}>+</button>
                              </div>
                            ) : <span className="cart-page__quantity-label">数量 {item.quantity}</span>}
                            {productPath ? <Link to={productPath} className="cart-page__text-link">修改规格</Link> : null}
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`移除${item.product.name}`}
                              className="cart-page__text-link"
                              onClick={() => void deleteItems([item])}
                            >
                              移除
                            </button>
                          </div>
                          {(!available || quantityOutOfRange) && status ? (
                            <div className="cart-page__recovery">
                              <p className="cart-page__error" role="alert">
                                {item.availability?.message || (quantityOutOfRange
                                  ? "当前数量不符合购买规则，请调整后重试。"
                                  : "此作品或所选规格暂时无法购买。")}
                              </p>
                              {repairQuantity !== null ? (
                                <button type="button" onClick={() => void updateQuantity(item, repairQuantity)} disabled={busy} aria-label={`将${item.product.name}调整至 ${repairQuantity} 件`} className="cart-page__text-link">
                                  调整至 {repairQuantity} 件
                                </button>
                              ) : status === "PRODUCT_UNAVAILABLE" ? (
                                <Link to="/catalog" className="cart-page__text-link">重新选款</Link>
                              ) : productPath && (status === "OUT_OF_STOCK" || status === "SKU_UNAVAILABLE") ? (
                                <Link to={productPath} className="cart-page__text-link">查看作品规格</Link>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="cart-page__summary" aria-labelledby="cart-summary-heading">
                <h2 id="cart-summary-heading">订单金额</h2>
                {checkoutBlock}
                <dl>
                  <div><dt>商品数量</dt><dd>{itemCount} 件</dd></div>
                  {Number.isFinite(goldWeight) && goldWeight > 0 ? <div><dt>金重合计</dt><dd>{goldWeight.toFixed(2)} g</dd></div> : null}
                  <div><dt>商品金额</dt><dd>{canCheckout ? formatPrice(merchandise) : "待确认"}</dd></div>
                  <div className="cart-page__total">
                    <dt>应付金额</dt>
                    <dd>{canCheckout ? formatPrice(merchandise) : "待确认"}</dd>
                  </div>
                </dl>
                <p className="cart-page__summary-note">运费与税费以结算页确认的订单结果为准，此处不另行估算。</p>
              </section>
            </div>
          </>
        )}

        {!loading ? <HeldSelections /> : null}
        {!loading ? (
          <section className="cart-page__services" aria-labelledby="cart-services-heading">
            <div>
              <h2 id="cart-services-heading">需要选款帮助？</h2>
              <p>我们的珠宝顾问可为您提供选款建议、规格对比与购买咨询服务。</p>
            </div>
            <Link to="/contact" className="cart-page__text-link">联系顾问</Link>
          </section>
        ) : null}
      </div>
    </div>
  );
}
