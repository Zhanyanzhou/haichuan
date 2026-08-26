import { useEffect, useState } from "react";
import { Input, Modal, Rate, Select, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { reviewApi, uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { CustomerReviewOrder } from "./types";

type CustomerReviewDialogProps = {
  order: CustomerReviewOrder | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export default function CustomerReviewDialog({
  order,
  onClose,
  onSubmitted,
}: CustomerReviewDialogProps) {
  const [rating, setRating] = useState(5);
  const [productId, setProductId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setProductId(order?.items[0]?.productId ?? null);
    setRating(5);
    setContent("");
    setImages([]);
  }, [order]);

  const uploadReviewImage: NonNullable<UploadProps["customRequest"]> = async (
    options,
  ) => {
    const { onSuccess, onError, file } = options;
    try {
      const response = await uploadApi.uploadImage(file as File);
      const url = unwrapResponse<{ url: string }>(response)?.url;
      if (!url) throw new Error("上传失败");
      setImages((list) => (list.length >= 6 ? list : [...list, url]));
      onSuccess?.(url);
    } catch (error) {
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

    setSubmitting(true);
    try {
      await reviewApi.submit({
        orderId: order.id,
        productId,
        rating,
        content: content.trim(),
        imageUrls: images.length ? images : undefined,
      });
      message.success("评价已提交，审核通过后将在作品页展示");
      onSubmitted();
    } catch (error) {
      const candidate = error as {
        message?: string;
        response?: { data?: { message?: string } };
      };
      message.error(
        candidate.response?.data?.message || candidate.message || "提交失败",
      );
    } finally {
      setSubmitting(false);
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
      destroyOnClose
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
            {images.map((url) => (
              <div key={url} style={{ position: "relative" }}>
                <img
                  src={url}
                  alt="晒单图"
                  style={{ width: 64, height: 64, objectFit: "cover" }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setImages((list) => list.filter((item) => item !== url))
                  }
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
