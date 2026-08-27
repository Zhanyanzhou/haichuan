import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App as AntdApp, Modal, QRCode, Spin } from "antd";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { trackAddPaymentInfo, trackPurchase } from "@/hooks/useAnalytics";
import { getRequestErrorMessage } from "@/services/httpClient";

export type CustomerPaymentOrder = {
  id: number;
  orderNo: string;
  finalAmount: number | string;
};

type CreatePaymentResult = {
  provider: "wechat";
  scene: "native" | "h5";
  qrCode?: string;
  payUrl?: string;
  reused?: boolean;
  payment: { id: number; paymentNo: string; amount: number | string };
};

type PaymentStatusResult = {
  state: "NONE" | "PENDING" | "PAID" | "FAILED" | "ATTENTION";
  gatewayState?: string;
};

type Props = {
  open: boolean;
  order: CustomerPaymentOrder | null;
  initialAction?: "create" | "query";
  onClose: () => void;
  onPaid?: () => void;
};

const isWechatBrowser = () =>
  typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

export default function CustomerPaymentDialog({
  open,
  order,
  initialAction = "create",
  onClose,
  onPaid,
}: Props) {
  const { message, modal } = AntdApp.useApp();
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState<CreatePaymentResult | null>(null);
  const [statusText, setStatusText] = useState("等待发起微信支付");
  const [error, setError] = useState<string | null>(null);
  const startedForOrder = useRef<string | null>(null);

  const applyStatus = useCallback(
    (status: PaymentStatusResult) => {
      if (status.state === "PAID") {
        sessionStorage.removeItem("haichuan:pending-payment-order");
        setStatusText("支付已确认，订单正在进入履约流程");
        message.success("微信支付已确认");
        if (order) trackPurchase(order.id, Number(order.finalAmount));
        onPaid?.();
        return true;
      }
      if (status.state === "FAILED") {
        setStatusText("本次支付已结束，可使用原订单重新发起");
        setResult(null);
        return true;
      }
      if (status.state === "ATTENTION") {
        setError("渠道状态与本地订单需要核对，请勿重复支付，并联系珠宝顾问。");
        setStatusText("支付状态待核对");
        return true;
      }
      setStatusText(
        status.gatewayState === "USERPAYING"
          ? "微信正在处理付款，请稍候"
          : "尚未确认到账，请完成支付后再次查询",
      );
      return false;
    },
    [message, onPaid, order],
  );

  const checkPayment = useCallback(async () => {
    if (!order) return false;
    setChecking(true);
    setError(null);
    try {
      const response = await customerApi.getOrderPayment(order.id);
      return applyStatus(unwrapResponse<PaymentStatusResult>(response));
    } catch (requestError: unknown) {
      setError(getRequestErrorMessage(
        requestError,
        "支付状态暂时无法查询，请稍后重试。",
      ));
      return true;
    } finally {
      setChecking(false);
    }
  }, [applyStatus, order]);

  const createPayment = useCallback(async () => {
    if (!order) return;
    setError(null);
    if (isWechatBrowser()) {
      setError(
        "微信内网页支付尚未开放。请点右上角菜单，选择“在浏览器打开”，再继续支付。",
      );
      setStatusText("当前浏览器暂不支持支付");
      return;
    }
    setCreating(true);
    setStatusText("正在创建微信支付订单…");
    try {
      const response = await customerApi.createOrderPayment(order.id);
      const payment = unwrapResponse<CreatePaymentResult>(response);
      setResult(payment);
      trackAddPaymentInfo(order.id, Number(order.finalAmount), payment.provider);
      if (payment.scene === "h5") {
        if (!payment.payUrl) throw new Error("微信 H5 支付链接缺失");
        setStatusText("正在前往微信支付…");
        window.location.assign(payment.payUrl);
        return;
      }
      if (!payment.qrCode) throw new Error("微信支付二维码内容缺失");
      setStatusText("请使用微信扫描二维码完成支付");
    } catch (requestError: unknown) {
      setError(getRequestErrorMessage(
        requestError,
        "微信支付暂时无法发起，请稍后重试。",
      ));
      setStatusText("支付未发起");
    } finally {
      setCreating(false);
    }
  }, [order]);

  useEffect(() => {
    if (!open || !order) return;
    const startKey = `${order.id}:${initialAction}`;
    if (startedForOrder.current === startKey) return;
    startedForOrder.current = startKey;
    setResult(null);
    setError(null);
    if (initialAction === "query") {
      void checkPayment();
    } else {
      void createPayment();
    }
  }, [checkPayment, createPayment, initialAction, open, order]);

  useEffect(() => {
    if (!open || result?.scene !== "native" || !result.qrCode) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= 60_000) {
        window.clearInterval(timer);
        setStatusText("自动查询已暂停；完成支付后可手动查询");
        return;
      }
      void checkPayment().then((terminal) => {
        if (terminal) window.clearInterval(timer);
      });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [checkPayment, open, result]);

  const closePayment = () => {
    if (!order) return;
    modal.confirm({
      title: "结束本次微信支付？",
      content: "系统会先向微信查单；只有确认未支付时才会关单。订单本身仍保留，可稍后重新支付。",
      okText: "查单并结束",
      cancelText: "继续支付",
      onOk: async () => {
        setClosing(true);
        try {
          const response = await customerApi.closeOrderPayment(order.id);
          applyStatus(unwrapResponse<PaymentStatusResult>(response));
        } catch (requestError: unknown) {
          setError(getRequestErrorMessage(
            requestError,
            "本次支付暂时无法结束，请稍后查单。",
          ));
        } finally {
          setClosing(false);
        }
      },
    });
  };

  return (
    <Modal
      open={open}
      title="微信支付"
      footer={null}
      destroyOnHidden
      onCancel={onClose}
      width={440}
    >
      <div className="py-4 text-center" aria-live="polite">
        <p className="text-sm text-brand-muted">订单号：{order?.orderNo}</p>
        <p className="price mt-2 text-2xl">
          ¥{Number(order?.finalAmount || 0).toLocaleString("zh-CN")}
        </p>

        {error ? (
          <Alert className="mt-5 text-left" type="warning" showIcon message={error} />
        ) : null}

        {creating ? (
          <div className="flex min-h-48 items-center justify-center"><Spin /></div>
        ) : result?.scene === "native" && result.qrCode ? (
          <div className="mt-6 flex justify-center">
            <QRCode value={result.qrCode} size={216} color="#181A1B" bordered={false} />
          </div>
        ) : null}

        <p className="mt-5 text-sm leading-6 text-brand-muted">{statusText}</p>
        <p className="mt-1 text-xs leading-5 text-brand-muted">
          支付结果以微信回调或服务端查单为准，请勿依据前端跳转重复付款。
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {!result || error ? (
            <button type="button" className="btn btn-primary w-full" onClick={() => void createPayment()} disabled={creating}>
              {creating ? "正在发起…" : "重新发起微信支付"}
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary w-full" onClick={() => void checkPayment()} disabled={checking}>
            {checking ? "正在查询…" : "我已完成支付，查询结果"}
          </button>
          {result ? (
            <button type="button" className="text-sm text-brand-muted underline underline-offset-4" onClick={closePayment} disabled={closing}>
              {closing ? "正在查单…" : "结束本次支付"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
