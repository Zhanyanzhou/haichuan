import { useState } from "react";
import { Alert, App as AntdApp, Form, Input, Modal, Select } from "antd";
import { customerApi } from "@/services/api";
import type { CustomerOrder } from "./types";

const activeAfterSalesStatuses = new Set([
  "REQUESTED",
  "APPROVED",
  "RETURNING",
  "QC_PASSED",
  "QC_FAILED",
]);

const customerAfterSalesTypes = [
  { value: "REFUND", label: "申请退款" },
  { value: "EXCHANGE", label: "申请换货" },
  { value: "REPAIR", label: "申请维修" },
] as const;

type AfterSalesAttempt = {
  fingerprint: string;
  key: string;
};

const afterSalesAttemptStorageKey = (orderId: number) =>
  `hc:customer-after-sales-attempt:${orderId}`;

async function hashAfterSalesRequest(
  orderId: number,
  payload: {
    orderItemId: number;
    type: "REFUND" | "EXCHANGE" | "REPAIR";
    reason: string;
  },
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ orderId, ...payload })),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readAfterSalesAttempt(orderId: number): AfterSalesAttempt | null {
  try {
    const raw = sessionStorage.getItem(afterSalesAttemptStorageKey(orderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AfterSalesAttempt>;
    return typeof parsed.fingerprint === "string" && typeof parsed.key === "string"
      ? { fingerprint: parsed.fingerprint, key: parsed.key }
      : null;
  } catch {
    return null;
  }
}

function persistAfterSalesAttempt(orderId: number, attempt: AfterSalesAttempt) {
  try {
    const serialized = JSON.stringify(attempt);
    sessionStorage.setItem(afterSalesAttemptStorageKey(orderId), serialized);
    return sessionStorage.getItem(afterSalesAttemptStorageKey(orderId)) === serialized;
  } catch {
    return false;
  }
}

function clearAfterSalesAttempt(orderId: number) {
  try {
    sessionStorage.removeItem(afterSalesAttemptStorageKey(orderId));
  } catch {
    // 已得到权威成功或确定拒绝，不让存储清理失败覆盖业务结果。
  }
}

function getRequestStatus(error: unknown) {
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate?.status ?? candidate?.response?.status;
  return typeof status === "number" ? status : null;
}

export function getRequestableAfterSalesItems(order: CustomerOrder) {
  const activeItemIds = new Set(
    (order.afterSalesCases || [])
      .filter((caseRecord) => activeAfterSalesStatuses.has(caseRecord.status))
      .map((caseRecord) => caseRecord.orderItemId)
      .filter((itemId): itemId is number => typeof itemId === "number"),
  );
  return (order.items || []).filter((item) => !activeItemIds.has(item.id));
}

export function getCustomerAfterSalesError(error: unknown, fallback: string) {
  const candidate = error as {
    status?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: { message?: unknown } };
  };
  const status = candidate?.status ?? candidate?.response?.status;
  const responseMessage = candidate?.response?.data?.message;
  const errorMessage =
    typeof responseMessage === "string"
      ? responseMessage
      : typeof candidate?.message === "string"
        ? candidate.message
        : "";
  return typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    errorMessage.trim()
    ? errorMessage
    : fallback;
}

type CustomerAfterSalesDialogProps = {
  order: CustomerOrder | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export default function CustomerAfterSalesDialog({
  order,
  onClose,
  onSubmitted,
}: CustomerAfterSalesDialogProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!order) return;
    let values: {
      orderItemId: number;
      type: "REFUND" | "EXCHANGE" | "REPAIR";
      reason: string;
    };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    setError(null);
    let requestSent = false;
    try {
      const payload = {
        ...values,
        reason: values.reason.trim(),
      };
      const fingerprint = await hashAfterSalesRequest(order.id, payload);
      const storedAttempt = readAfterSalesAttempt(order.id);
      const attempt = storedAttempt?.fingerprint === fingerprint
        ? storedAttempt
        : { fingerprint, key: `after-sales-${crypto.randomUUID()}` };
      if (
        storedAttempt?.fingerprint !== fingerprint &&
        !persistAfterSalesAttempt(order.id, attempt)
      ) {
        setError(
          "浏览器无法安全保存本次售后申请的重试凭据，系统未发送申请。请恢复会话存储后再试。",
        );
        return;
      }

      requestSent = true;
      await customerApi.createAfterSales(order.id, payload, attempt.key);
      clearAfterSalesAttempt(order.id);
      message.success("售后申请已提交，我们会尽快处理");
      onSubmitted();
    } catch (requestError) {
      if (!requestSent) {
        setError(
          "浏览器无法准备本次售后申请的安全重试凭据，系统未发送申请。请刷新页面后再试。",
        );
        return;
      }
      const status = getRequestStatus(requestError);
      if (status !== null && status >= 400 && status < 500) {
        clearAfterSalesAttempt(order.id);
      }
      setError(
        getCustomerAfterSalesError(
          requestError,
          "售后申请结果待确认；请保持当前内容不变并重试，系统会沿用同一凭据恢复结果。",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const requestableItems = order ? getRequestableAfterSalesItems(order) : [];

  const initialItem = requestableItems[0];

  return (
    <Modal
      open={order !== null}
      title={order?.status === "PENDING_SHIP" ? "申请退款" : "申请售后"}
      onCancel={close}
      onOk={submit}
      confirmLoading={submitting}
      okButtonProps={{ disabled: submitting }}
      okText="提交申请"
      cancelText="取消"
      destroyOnHidden
    >
      <p className="my-account__after-sales-intro">
        请选择需要服务的订单商品并说明原因。退款金额将在售后审核时根据订单与处理结果核定，无需在此填写。
      </p>
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          orderItemId: initialItem?.id,
          type: "REFUND",
          reason: "",
        }}
      >
        <Form.Item
          name="orderItemId"
          label="订单商品"
          rules={[{ required: true, message: "请选择需要服务的商品" }]}
        >
          <Select
            options={requestableItems.map((item) => ({
              value: item.id,
              label: `${item.product?.name || `作品 #${item.productId}`} · 订单项 ${item.id}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="type"
          label="售后类型"
          rules={[{ required: true, message: "请选择售后类型" }]}
        >
          <Select
            options={
              order?.status === "PENDING_SHIP"
                ? customerAfterSalesTypes.slice(0, 1)
                : [...customerAfterSalesTypes]
            }
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="申请原因"
          rules={[
            { required: true, whitespace: true, message: "请填写售后原因" },
            { max: 500, message: "售后原因不能超过 500 个字" },
          ]}
        >
          <Input.TextArea
            rows={4}
            maxLength={500}
            showCount
            placeholder="请说明商品情况和希望获得的处理方式"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
