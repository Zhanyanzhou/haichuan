import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DeleteOutlined, ShoppingOutlined, RightOutlined } from '@ant-design/icons';

interface CartItemData {
  productId: number;
  skuId: number;
  name: string;
  material: string;
  goldWeight: number;
  price: number;
  qty: number;
}

function loadCart(): CartItemData[] {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}

function saveCart(items: CartItemData[]) {
  localStorage.setItem('cart', JSON.stringify(items));
}

export default function Cart() {
  const [cartItems, setCartItems] = useState<CartItemData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCartItems(loadCart());
    setLoaded(true);
  }, []);

  const updateQty = (skuId: number, delta: number) => {
    const updated = cartItems.map(item =>
      item.skuId === skuId ? { ...item, qty: Math.max(1, item.qty + delta) } : item
    );
    setCartItems(updated);
    saveCart(updated);
  };

  const removeItem = (skuId: number) => {
    const updated = cartItems.filter(item => item.skuId !== skuId);
    setCartItems(updated);
    saveCart(updated);
  };

  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const goldTotal = cartItems.reduce((s, i) => s + (i.goldWeight || 0) * i.qty, 0);

  if (!loaded) {
    return <div className="min-h-screen bg-brand-bg flex items-center justify-center"><div className="text-brand-muted">加载中...</div></div>;
  }

  if (cartItems.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg">
      <div className="text-center"><p className="text-2xl font-display text-brand-muted mb-4">购物车为空</p><Link to="/products" className="btn btn-primary">去选购</Link></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="page-header"><h1 className="h1">购物车</h1><p className="text-brand-muted mt-2">{cartItems.length} 件臻品</p></div>
      <div className="max-w-5xl mx-auto px-6 md:px-20 py-10">
        <div className="grid md:grid-cols-3 gap-10">
          <div className="md:col-span-2 space-y-6">
            {cartItems.map(item => (
              <motion.div key={item.skuId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-6 p-6 bg-brand-surface border border-brand-line">
                <div className="w-24 h-24 bg-brand-bg flex-shrink-0 flex items-center justify-center"><ShoppingOutlined className="text-brand-muted text-2xl" /></div>
                <div className="flex-1 min-w-0">
                  <Link to={`/products/${item.productId}`} className="font-display text-lg hover:text-brand-gold transition-colors">{item.name}</Link>
                  <p className="text-sm text-brand-muted mt-1">{item.material} · {item.goldWeight}g</p>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateQty(item.skuId, -1)}
                        className="w-8 h-8 border border-brand-line flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-gold transition-colors">−</button>
                      <span className="text-sm w-6 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(item.skuId, 1)}
                        className="w-8 h-8 border border-brand-line flex items-center justify-center text-brand-muted hover:text-brand-text hover:border-brand-gold transition-colors">+</button>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="price">¥{(item.price * item.qty).toLocaleString()}</span>
                      <button onClick={() => removeItem(item.skuId)} className="text-brand-muted hover:text-red-500 transition-colors"><DeleteOutlined /></button>
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
              <div className="flex justify-between"><span className="text-brand-muted">金价参考</span><span className="text-brand-gold">¥485.60/克</span></div>
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
