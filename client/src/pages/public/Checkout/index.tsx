import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Form, Input, Spin, message } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { cartApi, customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { trackBeginCheckout, trackOrderCreated } from "@/hooks/useAnalytics";
import CustomerPaymentDialog from "@/components/commerce/CustomerPaymentDialog";

type CartItem = {
  id: number;
  skuId: number;
  quantity: number;
  product: { name: string };
  sku: { price: number | string };
};

const getItemPrice = (item: CartItem) => Number(item.sku.price || 0);

type CreatedOrder = { id: number; orderNo: string; finalAmount: number };
const PENDING_PAYMENT_ORDER_KEY = "haichuan:pending-payment-order";

function restorePendingPaymentOrder(): CreatedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(PENDING_PAYMENT_ORDER_KEY) || "null",
    ) as CreatedOrder | null;
    return parsed && Number.isInteger(parsed.id) ? parsed : null;
  } catch {
    return null;
  }
}

export default function Checkout() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(
    restorePendingPaymentOrder,
  );
  const returnedFromPayment =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("paymentReturn") === "1";
  const [paymentOpen, setPaymentOpen] = useState(
    Boolean(returnedFromPayment && restorePendingPaymentOrder()),
  );
  const [paymentInitialAction, setPaymentInitialAction] = useState<
    "create" | "query"
  >(returnedFromPayment ? "query" : "create");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  // P0-1 联动：后端 checkout 已要求登录态；未登录需引导先登录/注册
  const customerToken = typeof window !== "undefined" ? localStorage.getItem("customerToken") : null;
  const [customer, setCustomer] = useState<{ name?: string; phone?: string; email?: string } | null>(null);

  // 结算契约对齐（P0 修复）：后端 checkout 仅接受 { address, items, customerEmail? }，
  // 客户身份（姓名/手机号）来自登录态；订单创建后由客户本人发起微信支付。
  // 前端不再展示后端会忽略的 customerName/customerPhone/paymentMethod 输入框，
  // 改为只读展示登录客户信息，仅收集收货地址（必要时邮箱）。
  const loadCustomer = useCallback(async () => {
    if (!customerToken) return;
    try {
      const res = await customerApi.getProfile();
      setCustomer(unwrapResponse<{ name?: string; phone?: string; email?: string }>(res));
    } catch {
      // 客户信息加载失败不阻断结算；后端会用登录态的客户资料。
    }
  }, [customerToken]);

  const loadCart = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadCart();
    void loadCustomer();
  }, [loadCart, loadCustomer]);

  const total = cartItems.reduce(
    (sum, item) => sum + getItemPrice(item) * item.quantity,
    0,
  );

  const handleSubmit = async (values: any) => {
    if (cartItems.length === 0) {
      message.warning("购物车为空");
      return;
    }
    setSubmitting(true);
    try {
      trackBeginCheckout(cartItems.length, total);
      // 结算契约对齐（P0）：仅传后端会使用的字段 { address, items, customerEmail? }。
      // 客户身份（姓名/手机号）由后端从登录态取，支付场景由服务端按终端判断。
      const response = await customerApi.checkout({
        address: values.address,
        customerEmail: values.customerEmail || undefined,
        items: cartItems.map((item) => ({ skuId: item.skuId, quantity: item.quantity })),
      });
      // P0-1 联动：后端 checkout 已改为要求登录态、不再签发 access token；返回仅含 order
      const result = unwrapResponse<{ order: { id: number; orderNo: string; finalAmount: number } }>(response);
      if (!result?.order) throw new Error("订单创建响应不完整");
      trackOrderCreated(result.order.id, Number(result.order.finalAmount));
      setCreatedOrder(result.order);
      sessionStorage.setItem(
        PENDING_PAYMENT_ORDER_KEY,
        JSON.stringify(result.order),
      );
      setCartItems([]);
      setPaymentInitialAction("create");
      setPaymentOpen(true);
      message.success("订单已创建，请继续完成微信支付");
    } catch (error: any) {
      message.error(error?.message || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (createdOrder) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center bg-brand-surface border border-brand-line p-10">
          <CheckCircleOutlined className="text-5xl text-brand-gold mb-4" />
          <h1 className="text-2xl font-display mb-3">
            {paymentConfirmed ? "支付已确认" : "订单已创建"}
          </h1>
          <p className="text-brand-muted">订单号：{createdOrder.orderNo}</p>
          <p className="price text-2xl mt-3">¥{Number(createdOrder.finalAmount).toLocaleString()}</p>
          <p className="text-sm text-brand-muted mt-6 leading-6">
            {paymentConfirmed
              ? "微信支付已经由服务端确认，订单将进入拣货与发货流程。"
              : "库存已为您保留至订单支付截止时间。请完成微信支付；最终结果以微信回调或服务端查单为准，请勿重复付款。"}
          </p>
          {!paymentConfirmed ? (
            <button
              type="button"
              className="btn btn-primary w-full mt-8"
              onClick={() => {
                setPaymentInitialAction("create");
                setPaymentOpen(true);
              }}
            >
              继续微信支付
            </button>
          ) : null}
          <Link to="/customer" className={`${paymentConfirmed ? "btn btn-primary" : "btn btn-secondary"} w-full mt-3`}>
            查看我的订单
          </Link>
          <CustomerPaymentDialog
            open={paymentOpen}
            order={createdOrder}
            initialAction={paymentInitialAction}
            onClose={() => setPaymentOpen(false)}
            onPaid={() => {
              setPaymentConfirmed(true);
              setPaymentOpen(false);
            }}
          />
        </div>
      </div>
    );
  }

  if (!customerToken) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center bg-brand-surface border border-brand-line p-10">
          <h1 className="text-2xl font-display mb-3">请先登录后下单</h1>
          <p className="text-brand-muted mb-6 leading-6">为保障账户与订单安全，结算需先登录或注册客户账号。登录后可继续结算当前购物车。</p>
          <div className="flex flex-col gap-3">
            <Link to="/customer" className="btn btn-primary">前往登录 / 注册</Link>
            <Link to="/cart" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">← 返回购物车</Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-brand-bg flex items-center justify-center"><Spin size="large" /></div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <div className="text-center"><p className="text-xl font-display mb-4">结算信息暂时无法加载</p><button type="button" onClick={() => void loadCart()} className="btn btn-primary">重新加载</button></div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="text-center">
          <CheckCircleOutlined className="text-5xl text-brand-gold mb-4" />
          <p className="text-xl font-display text-brand-text mb-4">购物车为空</p>
          <Link to="/catalog" className="btn btn-primary">继续选购</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="page-header"><h1 className="h1">结算</h1></div>
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="bg-brand-surface border border-brand-line p-8">
          <div className="mb-6 pb-6 border-b border-brand-line">
            <h3 className="font-display text-lg mb-3">订单商品</h3>
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm py-2">
                <span>{item.product.name} × {item.quantity}</span>
                <span className="text-brand-gold">¥{(getItemPrice(item) * item.quantity).toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-display text-lg mt-3 pt-3 border-t border-brand-line">
              <span>合计</span><span className="price">¥{total.toLocaleString()}</span>
            </div>
          </div>

          <Form layout="vertical" onFinish={handleSubmit}>
            {/* 只读展示登录客户信息（后端从登录态取，前端不可改） */}
            <div className="mb-6 pb-6 border-b border-brand-line">
              <h3 className="font-display text-lg mb-3">收货人信息</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-brand-muted">称呼：</span>
                  <span className="text-brand-text">{customer?.name || "（未设置）"}</span>
                </div>
                <div>
                  <span className="text-brand-muted">手机号：</span>
                  <span className="text-brand-text">{customer?.phone || "（未设置）"}</span>
                </div>
              </div>
              <p className="text-xs text-brand-muted mt-2">收货人姓名与手机号取自您的会员账户，如需修改请前往客户中心个人资料。</p>
            </div>
            <Form.Item name="address" label="收货地址" rules={[{ required: true, message: "请输入收货地址" }]}>
              <Input.TextArea rows={2} placeholder="请输入详细收货地址" />
            </Form.Item>
            <Form.Item name="customerEmail" label="邮箱（可选）">
              <Input type="email" placeholder="用于接收订单通知" />
            </Form.Item>
            <div className="mb-6">
              <span className="text-sm text-brand-muted">
                支付方式：微信支付（桌面端扫码，手机浏览器唤起微信）
              </span>
              <p className="mt-2 text-xs leading-5 text-brand-muted">
                微信内网页的 JSAPI 支付尚未开放；请使用系统浏览器完成支付。
              </p>
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? "提交中..." : `提交订单并支付 ¥${total.toLocaleString()}`}
            </button>
          </Form>
        </div>
        <div className="text-center mt-6"><Link to="/cart" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">← 返回购物车</Link></div>
      </div>
    </div>
  );
}
