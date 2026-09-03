import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Form, Input, Spin } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import { cartApi, customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { trackBeginCheckout, trackOrderCreated } from "@/hooks/useAnalytics";
import CustomerPaymentDialog from "@/components/commerce/CustomerPaymentDialog";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { getRequestErrorMessage } from "@/services/httpClient";

type CartItem = {
  id: number;
  skuId: number;
  quantity: number;
  product: { name: string };
  sku: { price: number | string };
  availability?: {
    available: boolean;
    status: string;
    message: string | null;
  };
};

const getItemPrice = (item: CartItem) => Number(item.sku.price || 0);

type CreatedOrder = { id: number; orderNo: string; finalAmount: number };
type UsableCoupon = {
  id: number;
  name: string;
  type: string;
  value: number | string;
  minAmount: number | string;
  estimatedDiscount: number;
};
type CheckoutFormValues = {
  address: string;
  customerEmail?: string;
};
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
  const { message } = AntdApp.useApp();
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
  const isSignedIn = useCustomerAuthStore((state) => state.isLoggedIn);
  const [customer, setCustomer] = useState<{ name?: string; phone?: string; email?: string } | null>(null);

  // 结算契约对齐（P0 修复）：后端 checkout 仅接受 { address, items, customerEmail? }，
  // 客户身份（姓名/手机号）来自登录态；订单创建后由客户本人发起微信支付。
  // 前端不再展示后端会忽略的 customerName/customerPhone/paymentMethod 输入框，
  // 改为只读展示登录客户信息，仅收集收货地址（必要时邮箱）。
  const loadCustomer = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await customerApi.getProfile();
      setCustomer(unwrapResponse<{ name?: string; phone?: string; email?: string }>(res));
    } catch {
      // 客户信息加载失败不阻断结算；后端会用登录态的客户资料。
    }
  }, [isSignedIn]);

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
  // 可用券试算：失败静默（券功能不阻断结算）；折扣以服务端建单事务核销为准
  const [coupons, setCoupons] = useState<UsableCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<number | null>(null);
  const selectedCoupon = coupons.find((coupon) => coupon.id === selectedCouponId) ?? null;
  const discountAmount = selectedCoupon ? Number(selectedCoupon.estimatedDiscount || 0) : 0;
  const payableTotal = Math.max(0, total - discountAmount);

  useEffect(() => {
    if (!isSignedIn || total <= 0) {
      setCoupons([]);
      setSelectedCouponId(null);
      return;
    }
    let cancelled = false;
    customerApi
      .usableCoupons(Math.round(total * 100))
      .then((res: unknown) => {
        const data = unwrapResponse<UsableCoupon[]>(res);
        if (!cancelled) setCoupons(Array.isArray(data) ? data.filter((coupon) => coupon.estimatedDiscount > 0) : []);
      })
      .catch(() => {
        if (!cancelled) setCoupons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, total]);

  const hasUnverifiedCartItem = cartItems.some(
    (item) => item.availability?.available !== true,
  );

  const handleSubmit = async (values: CheckoutFormValues) => {
    if (cartItems.length === 0) {
      message.warning("购物车为空");
      return;
    }
    if (hasUnverifiedCartItem) {
      message.warning("购物车中的商品状态已变化，请返回购物车处理后再结算");
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
        couponId: selectedCouponId ?? undefined,
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
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "提交失败"));
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

  if (!isSignedIn) {
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
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <h1 className="sr-only">结算</h1>
        <div role="status" aria-label="结算信息加载中"><Spin size="large" /></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <div className="text-center" role="alert"><h1 className="text-xl font-display mb-4">结算信息暂时无法加载</h1><button type="button" onClick={() => void loadCart()} className="btn btn-primary">重新加载</button></div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="text-center">
          <CheckCircleOutlined className="text-5xl text-brand-gold mb-4" />
          <h1 className="text-xl font-display text-brand-text mb-4">购物车为空</h1>
          <Link to="/catalog" className="btn btn-primary">继续选购</Link>
        </div>
      </div>
    );
  }

  if (hasUnverifiedCartItem) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center bg-brand-surface border border-brand-line p-10">
          <h1 className="text-2xl font-display mb-3">商品状态需要重新确认</h1>
          <p className="text-brand-muted mb-6 leading-6">
            购物车中有商品已下架、规格或库存发生变化，或当前服务未能返回可验证状态。请先处理购物车后再提交订单。
          </p>
          <Link to="/cart" className="btn btn-primary">返回购物车处理</Link>
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
            {coupons.length > 0 ? (
              <div className="mt-4" role="group" aria-label="选择优惠券">
                <p className="text-sm text-brand-muted mb-2">优惠券</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="coupon"
                      checked={selectedCouponId === null}
                      onChange={() => setSelectedCouponId(null)}
                    />
                    <span>不使用优惠券</span>
                  </label>
                  {coupons.map((coupon) => (
                    <label key={coupon.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="coupon"
                          checked={selectedCouponId === coupon.id}
                          onChange={() => setSelectedCouponId(coupon.id)}
                        />
                        <span>
                          {coupon.name}
                          <span className="text-brand-gold ml-2">
                            −¥{Number(coupon.estimatedDiscount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs text-brand-muted">
                        满 ¥{Number(coupon.minAmount).toLocaleString()} 可用
                      </span>
                    </label>
                  ))}
                </div>
                {selectedCoupon ? (
                  <div className="flex justify-between text-sm mt-3 pt-3 border-t border-brand-line">
                    <span className="text-brand-muted">优惠</span>
                    <span className="text-brand-gold">−¥{discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-display text-lg mt-2">
                  <span>应付</span><span className="price">¥{payableTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <p className="text-xs text-brand-muted mt-2">最终折扣以下单时服务端核销结果为准；若券在提交瞬间失效将提示重新选择。</p>
              </div>
            ) : null}
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
              {submitting ? "提交中..." : `提交订单并支付 ¥${payableTotal.toLocaleString()}`}
            </button>
          </Form>
        </div>
        <div className="text-center mt-6"><Link to="/cart" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">← 返回购物车</Link></div>
      </div>
    </div>
  );
}
