import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App as AntdApp, Modal, QRCode, Spin } from "antd";
import { customerApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { trackAddPaymentInfo, trackPurchase } from "@/hooks/useAnalytics";
import { getRequestErrorMessage, requestStatus } from "@/services/httpClient";

export type CustomerPaymentOrder = {
  id: number;
  orderNo: string;
  finalAmount: number | string;
};

const PAYMENT_TYPES = ["DEPOSIT", "BALANCE", "FULL", "SUPPLEMENT"] as const;
type PaymentType = (typeof PAYMENT_TYPES)[number];

type CreatePaymentResult = {
  provider: "wechat";
  scene: "native" | "h5";
  qrCode?: string;
  payUrl?: string;
  reused?: boolean;
  payment: {
    id: number;
    paymentNo: string;
    amount: number | string;
    type: PaymentType;
  };
};

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  DEPOSIT: "定金",
  BALANCE: "尾款",
  FULL: "全款",
  SUPPLEMENT: "补款",
};

type PaymentStatusResult = {
  state: "NONE" | "PENDING" | "PAID" | "FAILED" | "ATTENTION";
  gatewayState?: string;
};

type PaymentCreateState =
  | "idle"
  | "creating"
  | "ready"
  | "uncertain"
  | "rejected"
  | "resume"
  | "retry"
  | "attention"
  | "paid";

type Props = {
  open: boolean;
  order: CustomerPaymentOrder | null;
  initialAction?: "create" | "query";
  onClose: () => void;
  onPaid?: () => void;
};

const isWechatBrowser = () =>
  typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

const formatCurrencyAmount = (value: number | string | undefined) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
    : "—";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseCreatePaymentResult = (value: unknown): CreatePaymentResult => {
  if (!isRecord(value) || value.provider !== "wechat") {
    throw new Error("微信支付响应缺少有效的支付渠道");
  }
  if (value.scene !== "native" && value.scene !== "h5") {
    throw new Error("微信支付响应缺少有效的支付场景");
  }
  if (!isRecord(value.payment)) {
    throw new Error("微信支付响应缺少有效的支付记录");
  }

  const { id, paymentNo, amount, type } = value.payment;
  const numericAmount = typeof amount === "number" || typeof amount === "string"
    ? Number(amount)
    : Number.NaN;
  if (!Number.isInteger(id) || Number(id) <= 0 || typeof paymentNo !== "string" || !paymentNo.trim()) {
    throw new Error("微信支付响应缺少有效的支付单号");
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("微信支付响应缺少有效的本期金额");
  }
  if (typeof type !== "string" || !PAYMENT_TYPES.includes(type as PaymentType)) {
    throw new Error("微信支付响应缺少有效的款项类型");
  }

  return value as CreatePaymentResult;
};

/** H5 支付跳转仅信任微信支付域名；后端被攻破或响应被污染时不跳向任意站点 */
const isTrustedWechatPayUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ["wx.tenpay.com", "pay.weixin.qq.com", "open.weixin.qq.com"].includes(
      parsed.hostname,
    );
  } catch {
    return false;
  }
};

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
  const [createState, setCreateState] = useState<PaymentCreateState>("idle");
  const [statusText, setStatusText] = useState("等待发起微信支付");
  const [error, setError] = useState<string | null>(null);
  const startedForOrder = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const creatingRef = useRef(false);
  const checkingRef = useRef(false);
  const closingRef = useRef(false);
  const activeOrderId = open && order ? order.id : null;
  const activeOrderIdRef = useRef<number | null>(activeOrderId);
  if (activeOrderIdRef.current !== activeOrderId) {
    activeOrderIdRef.current = activeOrderId;
    requestGeneration.current += 1;
    startedForOrder.current = null;
    creatingRef.current = false;
    checkingRef.current = false;
    closingRef.current = false;
  }

  const applyStatus = useCallback(
    (status: PaymentStatusResult) => {
      if (status.state === "PAID") {
        sessionStorage.removeItem("haichuan:pending-payment-order");
        setCreateState("paid");
        setStatusText("支付已确认，订单正在进入履约流程");
        message.success("微信支付已确认");
        if (order) trackPurchase(order.id);
        onPaid?.();
        return true;
      }
      if (status.state === "FAILED") {
        setStatusText("本次支付已结束，可使用原订单重新发起");
        setResult(null);
        setCreateState("retry");
        return true;
      }
      if (status.state === "ATTENTION") {
        setError("渠道状态与本地订单需要核对，请勿重复支付，并联系珠宝顾问。");
        setStatusText("支付状态待核对");
        setResult(null);
        setCreateState("attention");
        return true;
      }
      if (status.state === "NONE") {
        setResult(null);
        setCreateState("retry");
        setStatusText("当前没有待处理支付，可重新发起微信支付");
        return true;
      }
      if (status.gatewayState === "NOTPAY") {
        setCreateState((current) => current === "ready" ? current : "resume");
        setStatusText(
          "微信尚未确认付款；如需继续，请恢复原微信支付入口，请勿重复付款",
        );
        return false;
      }
      setCreateState((current) => current === "ready" ? current : "uncertain");
      setStatusText(
        status.gatewayState === "USERPAYING"
          ? "微信正在处理付款，稍后自动确认"
          : "尚未确认到账；若您已完成支付，系统会自动确认，请勿重复付款",
      );
      return false;
    },
    [message, onPaid, order],
  );

  const checkPayment = useCallback(async (options?: { silent?: boolean }) => {
    if (!order || checkingRef.current) return false;
    const activeOrder = order;
    const generation = requestGeneration.current;
    checkingRef.current = true;
    const silent = options?.silent === true;
    if (!silent) setChecking(true);
    if (!silent) setError(null);
    try {
      const response = await customerApi.getOrderPayment(activeOrder.id);
      if (
        generation !== requestGeneration.current ||
        activeOrderIdRef.current !== activeOrder.id
      ) return true;
      setError(null);
      return applyStatus(unwrapResponse<PaymentStatusResult>(response));
    } catch (requestError: unknown) {
      if (
        generation !== requestGeneration.current ||
        activeOrderIdRef.current !== activeOrder.id
      ) return true;
      // 静默轮询失败不打扰用户；下一轮或手动查询会再次尝试
      if (!silent) {
        setError(getRequestErrorMessage(
          requestError,
          "支付状态暂时无法查询，请稍后重试。",
        ));
      }
      // 瞬时静默查单失败不是支付终态，保留自动轮询；手动查询仍结束本次调用并展示错误。
      return !silent;
    } finally {
      if (
        generation === requestGeneration.current &&
        activeOrderIdRef.current === activeOrder.id
      ) {
        checkingRef.current = false;
        if (!silent) setChecking(false);
      }
    }
  }, [applyStatus, order]);

  const createPayment = useCallback(async () => {
    if (!order || creatingRef.current) return;
    const activeOrder = order;
    const generation = requestGeneration.current;
    creatingRef.current = true;
    setError(null);
    if (isWechatBrowser()) {
      setResult(null);
      setCreateState("rejected");
      setError(
        "微信内网页支付尚未开放。请点右上角菜单，选择“在浏览器打开”，再继续支付。",
      );
      setStatusText("当前浏览器暂不支持支付");
      creatingRef.current = false;
      return;
    }
    setCreating(true);
    setCreateState("creating");
    setStatusText("正在创建微信支付订单…");
    try {
      const response = await customerApi.createOrderPayment(activeOrder.id);
      if (
        generation !== requestGeneration.current ||
        activeOrderIdRef.current !== activeOrder.id
      ) return;
      const payment = parseCreatePaymentResult(unwrapResponse<unknown>(response));
      if (payment.scene === "h5") {
        if (typeof payment.payUrl !== "string" || !payment.payUrl.trim()) {
          throw new Error("微信 H5 支付链接缺失");
        }
        if (!isTrustedWechatPayUrl(payment.payUrl)) {
          throw new Error("微信支付链接异常，已阻止跳转；请关闭后重新发起支付");
        }
        setCreateState("ready");
        trackAddPaymentInfo(activeOrder.id);
        setStatusText("正在前往微信支付…");
        window.location.assign(payment.payUrl);
        return;
      }
      if (typeof payment.qrCode !== "string" || !payment.qrCode.trim()) {
        throw new Error("微信支付二维码内容缺失");
      }
      setResult(payment);
      setCreateState("ready");
      trackAddPaymentInfo(activeOrder.id);
      setStatusText("请使用微信扫描二维码完成支付");
    } catch (requestError: unknown) {
      if (
        generation !== requestGeneration.current ||
        activeOrderIdRef.current !== activeOrder.id
      ) return;
      setResult(null);
      const status = requestStatus(requestError);
      const rejected = status !== undefined
        && status >= 400
        && status < 500
        && status !== 409;
      const uncertain = !rejected;
      if (uncertain) {
        setCreateState("uncertain");
        setError(getRequestErrorMessage(
          requestError,
          "支付发起结果待确认，请勿重复付款。",
        ));
        setStatusText("支付发起结果待确认，请勿重复付款；系统正在查询微信支付状态");
        void checkPayment({ silent: true });
      } else {
        setCreateState("rejected");
        setError(getRequestErrorMessage(
          requestError,
          "本次支付请求未被受理，请核对提示后再处理。",
        ));
        setStatusText("本次支付请求未被受理");
      }
    } finally {
      if (
        generation === requestGeneration.current &&
        activeOrderIdRef.current === activeOrder.id
      ) {
        creatingRef.current = false;
        setCreating(false);
      }
    }
  }, [checkPayment, order]);

  useEffect(() => {
    if (!open || !order) return;
    const startKey = `${order.id}:${initialAction}`;
    if (startedForOrder.current === startKey) return;
    startedForOrder.current = startKey;
    setResult(null);
    setCreateState("idle");
    setError(null);
    if (initialAction === "query") {
      void checkPayment();
    } else {
      void createPayment();
    }
  }, [checkPayment, createPayment, initialAction, open, order]);

  // 掉单自愈：对话框打开期间（扫码展示、H5 回跳查单、人工查询后）统一自动轮询，
  // 与服务端 5 分钟兜底查单互补；60 秒未到终态暂停，保留手动查询入口。
  useEffect(() => {
    if (!open || !order) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= 60_000) {
        window.clearInterval(timer);
        setStatusText("自动查询已暂停；完成支付后可手动查询");
        return;
      }
      void checkPayment({ silent: true }).then((terminal) => {
        if (terminal) window.clearInterval(timer);
      });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [checkPayment, open, order]);

  const closePayment = () => {
    if (!order) return;
    modal.confirm({
      title: "结束本次微信支付？",
      content: "系统会先向微信查单；只有确认未支付时才会关单。订单本身仍保留，可稍后重新支付。",
      okText: "查单并结束",
      cancelText: "继续支付",
      onOk: async () => {
        if (closingRef.current) return;
        const activeOrder = order;
        const generation = requestGeneration.current;
        closingRef.current = true;
        setClosing(true);
        try {
          const response = await customerApi.closeOrderPayment(activeOrder.id);
          if (
            generation !== requestGeneration.current ||
            activeOrderIdRef.current !== activeOrder.id
          ) return;
          applyStatus(unwrapResponse<PaymentStatusResult>(response));
        } catch (requestError: unknown) {
          if (
            generation !== requestGeneration.current ||
            activeOrderIdRef.current !== activeOrder.id
          ) return;
          setError(getRequestErrorMessage(
            requestError,
            "本次支付暂时无法结束，请稍后查单。",
          ));
        } finally {
          if (
            generation === requestGeneration.current &&
            activeOrderIdRef.current === activeOrder.id
          ) {
            closingRef.current = false;
            setClosing(false);
          }
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
        <dl className="mt-4 border border-brand-line bg-brand-bg px-4 py-3 text-left">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-brand-muted">订单总额</dt>
            <dd className="price tabular-nums text-base text-brand-text">
              ¥{formatCurrencyAmount(order?.finalAmount)}
            </dd>
          </div>
          {result ? (
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-brand-line pt-3">
              <dt className="text-sm font-medium text-brand-text">
                本期应付（{PAYMENT_TYPE_LABELS[result.payment.type]}）
              </dt>
              <dd className="price tabular-nums text-2xl text-brand-text">
                ¥{formatCurrencyAmount(result.payment.amount)}
              </dd>
            </div>
          ) : null}
        </dl>

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
          {createState === "resume" ? (
            <button type="button" className="btn btn-primary w-full" onClick={() => void createPayment()} disabled={creating}>
              {creating ? "正在恢复…" : "恢复原微信支付入口"}
            </button>
          ) : createState === "retry" ? (
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
