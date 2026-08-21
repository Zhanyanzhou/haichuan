import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { recommendationApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { SecureImage } from "@/components/common/SecureImage";

type RecItem = {
  id: number;
  name: string;
  code?: string;
  price?: number | string | null;
  listingImage?: { mediaUrl?: string } | null;
  images?: Array<{ mediaUrl?: string }>;
};

function imageOf(item: RecItem): string {
  return item.listingImage?.mediaUrl || item.images?.[0]?.mediaUrl || "";
}

/**
 * 猜你喜欢：基于浏览历史的规则推荐（无历史时后端回退热门）。
 * recommendations 模块 /for-you 首次接入客户中心；未登录不会渲染（CustomerCenter 已保证登录态）。
 */
export default function ForYouRecommendations() {
  const [list, setList] = useState<RecItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    recommendationApi
      .getForYou(6)
      .then((res) => {
        if (!cancelled) setList(unwrapResponse<RecItem[]>(res) || []);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 无推荐结果（如暂无上架商品）时不渲染，避免空区块占位
  if (!loading && list.length === 0) return null;

  return (
    <section aria-label="为你推荐" style={{ paddingBottom: 48 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <h2
          style={{
            fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
            fontSize: 24,
            color: "#181a1b",
            margin: 0,
          }}
        >
          为你推荐
        </h2>
        <span
          style={{
            fontSize: 11,
            letterSpacing: ".18em",
            color: "#5f6568",
            textTransform: "uppercase",
          }}
        >
          For You
        </span>
      </div>
      {loading ? (
        <div style={{ color: "#6E7477", fontSize: 13, padding: "24px 0" }}>
          正在为您挑选作品…
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 20,
          }}
        >
          {list.map((item) => (
            <Link
              key={item.id}
              to={`/products/${item.id}`}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div
                style={{
                  aspectRatio: "1 / 1",
                  background: "#f4f5f5",
                  overflow: "hidden",
                  borderRadius: 8,
                }}
              >
                <SecureImage
                  src={imageOf(item)}
                  alt={item.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "#181a1b",
                  margin: "10px 0 4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={item.name}
              >
                {item.name}
              </p>
              {item.price != null && Number(item.price) > 0 ? (
                <p style={{ fontSize: 13, color: "#181a1b", margin: 0 }}>
                  ¥{Number(item.price).toLocaleString()}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
