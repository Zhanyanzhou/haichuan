import { useEffect, useState } from "react";
import { Alert, Form, Input, Modal, Select, message } from "antd";
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
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (submitting) return;
    setError(null);
    form.resetFields();
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
    try {
      await customerApi.createAfterSales(order.id, {
        ...values,
        reason: values.reason.trim(),
      });
      message.success("售后申请已提交，我们会尽快处理");
      form.resetFields();
      onSubmitted();
    } catch (requestError) {
      setError(
        getCustomerAfterSalesError(
          requestError,
          "售后申请暂时无法提交，请稍后重试。",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const requestableItems = order ? getRequestableAfterSalesItems(order) : [];

  useEffect(() => {
    if (!order) {
      setError(null);
      form.resetFields();
      return;
    }
    const initialItem = getRequestableAfterSalesItems(order)[0];
    form.setFieldsValue({
      orderItemId: initialItem?.id,
      type: "REFUND",
      reason: "",
    });
  }, [form, order]);

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
      destroyOnClose
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
      <Form form={form} layout="vertical">
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
