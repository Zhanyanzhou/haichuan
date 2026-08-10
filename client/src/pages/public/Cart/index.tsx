import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DeleteOutlined, ShoppingOutlined, RightOutlined } from "@ant-design/icons";
import { message } from "antd";
import { cartApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { getMaterialLabel } from "@/utils/material";

type CartItem = {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  product: {
    name: string;
    goldWeight?: number | string | null;
  };
  sku: {
    material: string;
    goldWeight?: number | string | null;
    price: number | string;
  };
};

const getItemPrice = (item: CartItem) => Number(item.sku.price || 0);
const getItemGoldWeight = (item: CartItem) =>
  Number(item.sku.goldWeight ?? item.product.goldWeight ?? 0);

export default function Cart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mutatingId, setMutatingId] = useState<number | null>(null);

  const loadCart = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await cartApi.get();
      setCartItems(unwrapResponse<CartItem[]>(response) || []);
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
    if (quantity < 1 || quantity > 99 || mutatingId === item.id) return;
    setMutatingId(item.id);
    try {
      await cartApi.updateQuantity(item.id, quantity);
      setCartItems((items) =>
        items.map((current) =>
          current.id === item.id ? { ...current, quantity } : current,
        ),
      );
    } catch (error: any) {
      message.error(error?.message || "更新商品数量失败");
    } finally {
      setMutatingId(null);
    }
  };

  const removeItem = async (item: CartItem) => {
    if (mutatingId === item.id) return;
    setMutatingId(item.id);
    try {
      await cartApi.remove(item.id);
      setCartItems((items) => items.filter((current) => current.id !== item.id));
    } catch (error: any) {
      message.error(error?.message || "移除商品失败");
    } finally {
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

  if (loading) {
    return <div className="min-h-screen bg-brand-bg flex items-center justify-center"><div className="text-brand-muted">加载中...</div></div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg px-6">
        <div className="text-center">
          <p className="text-xl font-display text-brand-text mb-4">购物车暂时无法加载</p>
          <button type="button" onClick={() => void loadCart()} className="btn btn-primary">重新加载</button>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <div className="text-center"><p className="text-2xl font-display text-brand-muted mb-4">购物车为空</p><Link to="/products" className="btn btn-primary">去选购</Link></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="page-header"><h1 className="h1">购物车</h1><p className="text-brand-muted mt-2">{itemCount} 件臻品</p></div>
      <div className="max-w-5xl mx-auto px-6 md:px-20 py-10">
        <div className="grid md:grid-cols-3 gap-10">
          <div className="md:col-span-2 space-y-6">
            {cartItems.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-6 p-6 bg-brand-surface border border-brand-line">
                <div className="w-24 h-24 bg-brand-bg flex-shrink-0 flex items-center justify-center"><ShoppingOutlined className="text-brand-muted text-2xl" /></div>
                <div className="flex-1 min-w-0">
                  <Link to={`/products/${item.productId}`} className="font-display text-lg hover:text-brand-gold transition-colors">{item.product.name}</Link>
                  <p className="text-sm text-brand-muted mt-1">{getMaterialLabel(item.sku.material as any)} · {getItemGoldWeight(item)}g</p>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => void updateQuantity(item, item.quantity - 1)} disabled={item.quantity <= 1 || mutatingId === item.id}
                        className="w-8 h-8 border border-brand-line flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-gold transition-colors disabled:opacity-40">−</button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button type="button" onClick={() => void updateQuantity(item, item.quantity + 1)} disabled={item.quantity >= 99 || mutatingId === item.id}
                        className="w-8 h-8 border border-brand-line flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-gold transition-colors disabled:opacity-40">+</button>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="price">¥{(getItemPrice(item) * item.quantity).toLocaleString()}</span>
                      <button type="button" onClick={() => void removeItem(item)} disabled={mutatingId === item.id} aria-label={`移除${item.product.name}`} className="text-brand-muted hover:text-red-500 transition-colors disabled:opacity-40"><DeleteOutlined /></button>
                    </div>
                  </div>
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
            <Link to="/checkout" className="btn btn-primary w-full mt-8">去结算 <RightOutlined /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
