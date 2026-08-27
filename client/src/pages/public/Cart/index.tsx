import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DeleteOutlined, ShoppingOutlined, RightOutlined } from "@ant-design/icons";
import { App as AntdApp } from "antd";
import { cartApi, productApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getMaterialLabel } from "@/utils/material";
import type { InventoryPolicy, Product } from "@/types";
import { trackRemoveFromCart, trackViewCart } from "@/hooks/useAnalytics";
import { getRequestErrorMessage } from "@/services/httpClient";

type CartItem = {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  product: {
    name: string;
    goldWeight?: number | string | null;
    inventoryPolicy?: InventoryPolicy;
  };
  sku: {
    material: string;
    goldWeight?: number | string | null;
    price: number | string;
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

const getItemPrice = (item: CartItem) => Number(item.sku.price || 0);
const getItemGoldWeight = (item: CartItem) =>
  Number(item.sku.goldWeight ?? item.product.goldWeight ?? 0);

export default function Cart() {
  const { message } = AntdApp.useApp();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [policyLoadError, setPolicyLoadError] = useState(false);
  const [cartError, setCartError] = useState("");
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const mutatingIdRef = useRef<number | null>(null);

  const loadCart = async () => {
    setLoading(true);
    setLoadError(false);
    setPolicyLoadError(false);
    setCartError("");
    try {
      const response = await cartApi.get();
      const items = unwrapResponse<CartItem[]>(response) || [];
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
    const maxQuantity = item.product.inventoryPolicy === "SINGLE_UNIT" ? 1 : 99;
    const canRepairQuantity =
      item.availability?.status === "INSUFFICIENT_STOCK" ||
      item.availability?.status === "QUANTITY_INVALID";
    if (
      (item.availability?.available !== true && !canRepairQuantity) ||
      (!item.product.inventoryPolicy && quantity >= item.quantity) ||
      quantity < 1 ||
      quantity > maxQuantity ||
      mutatingIdRef.current === item.id
    ) return;
    setCartError("");
    mutatingIdRef.current = item.id;
    setMutatingId(item.id);
    try {
      await cartApi.updateQuantity(item.id, quantity);
      await loadCart();
    } catch (error: unknown) {
      const reason = getRequestErrorMessage(error, "更新商品数量失败");
      setCartError(reason);
      message.error(reason);
    } finally {
      mutatingIdRef.current = null;
      setMutatingId(null);
    }
  };

  const removeItem = async (item: CartItem) => {
    if (mutatingIdRef.current === item.id) return;
    setCartError("");
    mutatingIdRef.current = item.id;
    setMutatingId(item.id);
    try {
      await cartApi.remove(item.id);
      setCartItems((items) => items.filter((current) => current.id !== item.id));
      trackRemoveFromCart(item.productId, item.quantity);
    } catch (error: unknown) {
      const reason = getRequestErrorMessage(error, "移除商品失败");
      setCartError(reason);
      message.error(reason);
    } finally {
      mutatingIdRef.current = null;
      setMutatingId(null);
    }
  };

  const total = cartItems.reduce(
    (sum, item) => sum + getItemPrice(item) * item.quantity,
    0,
  );
  const goldTotal = cartItems.reduce(
    (sum, item) => sum + getItemGoldWeight(item) * item.quantity,
    0,
  );
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (!loading && !loadError) trackViewCart(itemCount, total);
  }, [itemCount, loadError, loading, total]);
  const hasUnknownPolicy = cartItems.some((item) => !item.product.inventoryPolicy);
  const hasInvalidSingleUnitQuantity = cartItems.some(
    (item) => item.product.inventoryPolicy === "SINGLE_UNIT" && item.quantity > 1,
  );
  const hasUnknownAvailability = cartItems.some(
    (item) => item.availability === undefined,
  );
  const hasUnavailableItems = cartItems.some(
    (item) => item.availability?.available === false,
  );
  const canCheckout =
    !hasUnknownPolicy &&
    !hasInvalidSingleUnitQuantity &&
    !hasUnknownAvailability &&
    !hasUnavailableItems;

  if (loading) {
    return (
      <div className="cart-page min-h-screen bg-brand-bg flex items-center justify-center">
        <h1 className="sr-only">购物车</h1>
        <div className="text-brand-muted" role="status" aria-live="polite">购物车加载中…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="cart-page min-h-screen flex items-center justify-center bg-brand-bg px-6">
        <div className="text-center" role="alert">
          <h1 className="text-xl font-display text-brand-text mb-4">购物车暂时无法加载</h1>
          <button type="button" onClick={() => void loadCart()} className="btn btn-primary">重新加载</button>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="cart-page min-h-screen flex items-center justify-center bg-brand-bg">
        <div className="text-center"><h1 className="text-2xl font-display text-brand-muted mb-4">购物车为空</h1><Link to="/catalog" className="btn btn-primary">去选购</Link></div>
      </div>
    );
  }

  return (
    <div className="cart-page min-h-screen bg-brand-bg">
      <div className="page-header"><h1 className="h1">购物车</h1><p className="text-brand-muted mt-2">{itemCount} 件臻品</p></div>
      <div className="max-w-5xl mx-auto px-6 md:px-20 py-10">
        {policyLoadError || hasUnknownPolicy || hasUnknownAvailability ? (
          <div className="mb-6 border border-brand-line bg-brand-surface p-4 text-sm leading-6 text-brand-muted" role="alert">
            {policyLoadError || hasUnknownPolicy
              ? "部分商品的数量规则暂时无法确认。"
              : ""}
            {hasUnknownAvailability
              ? "商品的上下架、规格、价格或库存状态暂时无法确认。"
              : ""}
            为避免误购，已暂停增加数量和结算；您可以重新加载或移除该商品。
            <button type="button" onClick={() => void loadCart()} className="ml-3 min-h-11 underline underline-offset-4">
              重新加载
            </button>
          </div>
        ) : null}
        {cartError ? (
          <p className="mb-6 text-sm leading-6 text-[#8C3F3B]" role="alert">{cartError}</p>
        ) : null}
        <div className="grid md:grid-cols-3 gap-10">
          <div className="md:col-span-2 space-y-6">
            {cartItems.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4 p-5 bg-brand-surface border border-brand-line sm:flex-row sm:gap-6 sm:p-6">
                <div className="w-full aspect-[4/3] bg-brand-bg flex-shrink-0 flex items-center justify-center sm:w-24 sm:h-24 sm:aspect-auto"><ShoppingOutlined className="text-brand-muted text-2xl" /></div>
                <div className="flex-1 min-w-0">
                  <Link to={`/products/${item.productId}`} className="font-display text-lg hover:text-brand-gold transition-colors">{item.product.name}</Link>
                  <p className="text-sm text-brand-muted mt-1">{getMaterialLabel(item.sku.material)} · {getItemGoldWeight(item)}g</p>
                  <div className="flex flex-col gap-4 mt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => void updateQuantity(item, item.quantity - 1)} disabled={item.quantity <= 1 || mutatingId === item.id || (item.availability?.available !== true && item.availability?.status !== "INSUFFICIENT_STOCK" && item.availability?.status !== "QUANTITY_INVALID")}
                        aria-label={`减少${item.product.name}数量`}
                        className="w-11 h-11 border border-brand-line flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-gold transition-colors disabled:opacity-40">−</button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button type="button" onClick={() => void updateQuantity(item, item.quantity + 1)} disabled={item.availability?.available !== true || !item.product.inventoryPolicy || item.product.inventoryPolicy === "SINGLE_UNIT" || item.quantity >= 99 || mutatingId === item.id}
                        aria-label={`增加${item.product.name}数量`}
                        className="w-11 h-11 border border-brand-line flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-gold transition-colors disabled:opacity-40">+</button>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="price">¥{(getItemPrice(item) * item.quantity).toLocaleString()}</span>
                      <button type="button" onClick={() => void removeItem(item)} disabled={mutatingId === item.id} aria-label={`移除${item.product.name}`} className="w-11 h-11 flex items-center justify-center text-brand-muted hover:text-[#8C3F3B] transition-colors disabled:opacity-40"><DeleteOutlined /></button>
                    </div>
                  </div>
                  {item.product.inventoryPolicy === "SINGLE_UNIT" ? (
                    <p className="mt-3 text-xs leading-5 text-brand-muted">一物一件，购物车数量上限为 1。</p>
                  ) : null}
                  {item.product.inventoryPolicy === "SINGLE_UNIT" && item.quantity > 1 ? (
                    <p className="mt-2 text-xs leading-5 text-[#8C3F3B]" role="alert">数量不符合一物一件规则，请减少至 1 后结算。</p>
                  ) : null}
                  {item.availability?.available === false && item.availability.message ? (
                    <p className="mt-2 text-xs leading-5 text-[#8C3F3B]" role="alert">
                      {item.availability.message}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="bg-brand-surface border border-brand-line p-8 h-fit">
            <h3 className="font-display text-xl mb-6">订单摘要</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-brand-muted">金重合计</span><span>{goldTotal.toFixed(2)}g</span></div>
              <div className="border-t border-brand-line pt-3 flex justify-between text-lg font-display">
                <span>合计</span><span className="price text-2xl">¥{total.toLocaleString()}</span>
              </div>
            </div>
            {canCheckout ? (
              <Link to="/checkout" className="btn btn-primary w-full mt-8">去结算 <RightOutlined /></Link>
            ) : (
              <button type="button" className="btn btn-primary w-full mt-8" disabled>暂不可结算</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
