import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Form, Input, Radio, message } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';

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

export default function Checkout() {
  const [cartItems, setCartItems] = useState<CartItemData[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setCartItems(loadCart()); }, []);

  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

  const handleSubmit = async (values: any) => {
    if (cartItems.length === 0) { message.warning('购物车为空'); return; }
    setSubmitting(true);
    try {
      // Mock: simulate order creation
      await new Promise(r => setTimeout(r, 500));
      localStorage.removeItem('cart');
      message.success('订单已提交，我们会尽快为您处理');
      setCartItems([]);
    } catch (e: any) {
      message.error(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0 && !submitting) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="text-center">
          <CheckCircleOutlined className="text-5xl text-brand-gold mb-4" />
          <p className="text-xl font-display text-brand-text mb-4">购物车为空</p>
          <Link to="/products" className="btn btn-primary">继续选购</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="page-header"><h1 className="h1">结算</h1></div>
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="bg-brand-surface border border-brand-line p-8">
          {/* Order Summary */}
          <div className="mb-6 pb-6 border-b border-brand-line">
            <h3 className="font-display text-lg mb-3">订单商品</h3>
            {cartItems.map(item => (
              <div key={item.skuId} className="flex justify-between text-sm py-2">
                <span>{item.name} × {item.qty}</span>
                <span className="text-brand-gold">¥{(item.price * item.qty).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-display text-lg mt-3 pt-3 border-t border-brand-line">
              <span>合计</span><span className="price">¥{total.toLocaleString()}</span>
            </div>
          </div>

          <Form layout="vertical" onFinish={handleSubmit}>
            <div className="grid grid-cols-2 gap-4">
              <Form.Item name="customerName" label="收货人" rules={[{ required: true, message: '请输入收货人' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="customerPhone" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}>
                <Input />
              </Form.Item>
            </div>
            <Form.Item name="address" label="收货地址" rules={[{ required: true, message: '请输入收货地址' }]}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="paymentMethod" label="支付方式">
              <Radio.Group defaultValue="transfer">
                <Radio value="transfer">线下转账（上传凭证）</Radio>
              </Radio.Group>
            </Form.Item>
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? '提交中...' : `提交订单 ¥${total.toLocaleString()}`}
            </button>
          </Form>
        </div>
        <div className="text-center mt-6"><Link to="/cart" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">← 返回购物车</Link></div>
      </div>
    </div>
  );
}
