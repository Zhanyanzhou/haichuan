import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App as AntdApp } from "antd";
import { trackAddToCart } from "@/hooks/useAnalytics";
import { getRequestErrorMessage } from "@/services/httpClient";
import { addListingToCart, type ListingCartReference, type ListingCartResult } from "@/utils/addListingToCart";

export function ListingCartButton({
  product,
  className,
  onFinished,
}: {
  product: ListingCartReference;
  className?: string;
  onFinished?: (result: ListingCartResult) => void;
}) {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const pending = useRef(false);

  const add = async () => {
    if (pending.current) return;
    pending.current = true;
    setAdding(true);
    try {
      const result = await addListingToCart(product);
      if (result.status === "added") {
        trackAddToCart(result.productId, 1);
        message.success("已加入购物车");
      } else if (result.status === "choose-specification") {
        navigate(result.path);
      } else {
        message.warning("这件作品目前不能直接加入购物车，请先查看作品。");
      }
      onFinished?.(result);
    } catch (error: unknown) {
      message.error(getRequestErrorMessage(error, "加入购物车失败，请稍后重试"));
    } finally {
      pending.current = false;
      setAdding(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      disabled={adding}
      onClick={() => void add()}
    >
      {adding ? "加入中..." : "加入购物车"}
    </button>
  );
}
