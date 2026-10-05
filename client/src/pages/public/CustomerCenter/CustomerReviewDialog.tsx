import { useEffect, useRef, useState } from "react";
import { App as AntdApp, Input, Modal, Rate, Select, Upload } from "antd";
import type { UploadProps } from "antd";
import {
  reviewApi,
  type CustomerReviewRecord,
} from "@/services/api";
import { currentSessionEpoch, isCurrentSessionEpoch } from "@/services/sessionEpoch";
import { reviewSubmissionFingerprint } from "@/utils/reviewSubmissionFingerprint";
import { unwrapResponse } from "@/utils/unwrap";
import type { CustomerReviewOrder } from "./types";

type CustomerReviewDialogProps = {
  order: CustomerReviewOrder | null;
  onClose: () => void;
  onSubmitted: () => void;
};

type UploadedReviewImage = {
  reference: string;
  previewUrl: string;
};

async function reviewImageIdempotencyKey(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `review-image:${hash}`;
}

function requestStatus(error: unknown) {
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  const status = candidate.status ?? candidate.response?.status;
  return typeof status === "number" ? status : null;
}

function sameReview(
  review: CustomerReviewRecord,
  expectedFingerprint: string,
) {
  return review.submissionFingerprint === expectedFingerprint;
}

export default function CustomerReviewDialog({
  order,
  onClose,
  onSubmitted,
}: CustomerReviewDialogProps) {
  const { message } = AntdApp.useApp();
  const [rating, setRating] = useState(5);
  const [productId, setProductId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<UploadedReviewImage[]>([]);
  const imagesRef = useRef<UploadedReviewImage[]>([]);
  const activeOrderIdRef = useRef<number | null>(order?.id ?? null);
  activeOrderIdRef.current = order?.id ?? null;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setProductId(order?.items[0]?.productId ?? null);
    setRating(5);
    setContent("");
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
  }, [order]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const uploadReviewImage: NonNullable<UploadProps["customRequest"]> = async (
    options,
  ) => {
    const { onSuccess, onError, file } = options;
    const operationEpoch = currentSessionEpoch("customer");
    const operationOrderId = activeOrderIdRef.current;
    const operationIsCurrent = () => (
      isCurrentSessionEpoch("customer", operationEpoch)
      && activeOrderIdRef.current === operationOrderId
    );
    try {
      const imageFile = file as File;
      const idempotencyKey = await reviewImageIdempotencyKey(imageFile);
      if (!operationIsCurrent()) return;
      let reference: string | undefined;
      try {
        const response = await reviewApi.uploadImage(imageFile, idempotencyKey);
        if (!operationIsCurrent()) return;
        reference = unwrapResponse<{ reference: string }>(response)?.reference;
      } catch (error) {
        if (!operationIsCurrent()) return;
        const status = requestStatus(error);
        if (status !== null && status < 500) throw error;
        const response = await reviewApi.imageUploadStatus(idempotencyKey);
        if (!operationIsCurrent()) return;
        const result = unwrapResponse<{ status: "AVAILABLE" | "MISSING"; reference?: string }>(response);
        if (result?.status === "AVAILABLE") reference = result.reference;
        if (!reference) throw new Error("晒单图尚未写入，请重新选择图片");
      }
      if (!reference) throw new Error("晒单图上传结果无效");
      const previewUrl = URL.createObjectURL(imageFile);
      setImages((list) => {
        if (list.length >= 6 || list.some((image) => image.reference === reference)) {
          URL.revokeObjectURL(previewUrl);
          return list;
        }
        return [...list, { reference, previewUrl }];
      });
      onSuccess?.(reference);
    } catch (error) {
      if (!operationIsCurrent()) return;
      const candidate = error as { message?: string };
      message.error(candidate.message || "晒单图上传失败");
      onError?.(error as Error);
    }
  };

  const submit = async () => {
    if (!order || !productId) {
      message.warning("请选择要评价的作品");
      return;
    }
    if (rating < 1) {
      message.warning("请选择星级");
      return;
    }
    if (content.trim().length < 5) {
      message.warning("评价内容至少 5 个字");
      return;
    }

    const payload = {
      orderId: order.id,
      productId,
      rating,
      content: content.trim(),
      imageUrls: images.length ? images.map((image) => image.reference) : undefined,
    };
    const operationEpoch = currentSessionEpoch("customer");
    let expectedFingerprint: string | null = null;
    setSubmitting(true);
    try {
      expectedFingerprint = await reviewSubmissionFingerprint(payload);
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      await reviewApi.submit(payload);
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      message.success("评价已提交，审核通过后将在作品页展示");
      onSubmitted();
    } catch (error: unknown) {
      if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
      const status = requestStatus(error);
      if (status === null || status >= 500) {
        try {
          const response = await reviewApi.mine();
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
          const mine = unwrapResponse<CustomerReviewRecord[]>(response);
          const existing = Array.isArray(mine)
            ? mine.find((review) => (
              review.orderId === payload.orderId && review.productId === payload.productId
            ))
            : undefined;
          if (existing && expectedFingerprint && sameReview(existing, expectedFingerprint)) {
            message.success("评价已提交并完成权威核验");
            onSubmitted();
            return;
          }
          if (existing) {
            message.warning("该订单中的作品已有评价，已刷新权威状态。");
            onSubmitted();
            return;
          }
          message.warning("评价尚未写入；当前内容已保留，可以安全重试。");
          return;
        } catch {
          if (!isCurrentSessionEpoch("customer", operationEpoch)) return;
          message.warning("评价提交结果待确认；系统不会自动重复提交，请保留当前内容并稍后重试。");
          return;
        }
      }
      const candidate = error as {
        message?: string;
        response?: { data?: { message?: string } };
      };
      message.error(
        candidate.response?.data?.message || candidate.message || "提交失败",
      );
    } finally {
      if (isCurrentSessionEpoch("customer", operationEpoch)) {
        setSubmitting(false);
      }
    }
  };

  return (
    <Modal
      open={order !== null}
      title="评价作品"
      onCancel={onClose}
      onOk={submit}
      confirmLoading={submitting}
      okText="提交评价"
      cancelText="取消"
      destroyOnHidden
    >
      <p style={{ color: "#5f6568", fontSize: 13, marginBottom: 16 }}>
        评价提交后经审核将在作品页展示，感谢您分享佩戴体验。
      </p>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, marginBottom: 8 }}>选择作品</p>
        <Select
          style={{ width: "100%" }}
          value={productId}
          onChange={(value: number) => setProductId(value)}
          options={(order?.items || []).map((item) => ({
            value: item.productId,
            label: item.product?.name || `作品 #${item.productId}`,
          }))}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, marginBottom: 8 }}>星级</p>
        <Rate value={rating} onChange={setRating} />
      </div>
      <div>
        <p style={{ fontSize: 13, marginBottom: 8 }}>评价内容（5-500 字）</p>
        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="工艺、佩戴感受、顾问服务体验…"
        />
      </div>
      <div>
        <p style={{ fontSize: 13, marginBottom: 8 }}>
          晒单图（选填，最多 6 张）
        </p>
        <Upload
          listType="picture-card"
          accept="image/*"
          multiple
          showUploadList={false}
          customRequest={uploadReviewImage}
          disabled={images.length >= 6}
        >
          {images.length >= 6 ? null : (
            <span style={{ fontSize: 20, color: "#181a1b" }}>+</span>
          )}
        </Upload>
        {images.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            {images.map((image) => (
              <div key={image.reference} style={{ position: "relative" }}>
                <img
                  src={image.previewUrl}
                  alt="晒单图"
                  style={{ width: 64, height: 64, objectFit: "cover" }}
                />
                <button
                  type="button"
                  onClick={() => setImages((list) => {
                    const removed = list.find((item) => item.reference === image.reference);
                    if (removed) URL.revokeObjectURL(removed.previewUrl);
                    return list.filter((item) => item.reference !== image.reference);
                  })}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,.6)",
                    color: "#fff",
                    fontSize: 10,
                    lineHeight: "18px",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
