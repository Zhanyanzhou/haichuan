import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { motion, useInView } from "framer-motion";
import { Spin, Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { trackPageView } from "@/hooks/useAnalytics";
import { useProductData } from "@/hooks/useProductData";
import type { CatalogProduct } from "@/data/catalogData";
import { SecureImage } from "@/components/common/SecureImage";

/* ═══════ 视觉常量 ═══════ */
const V = {
  bg: "#F4F1EA",
  surface: "#F8F6F1",
  text: "#29241F",
  sec: "rgba(41,36,31,0.56)",
  line: "rgba(41,36,31,0.12)",
  acc: "#A7895B",
};
const MX = "max-w-[1760px] mx-auto";
const PX = "clamp(48px,5vw,88px)";
const SX = { paddingInline: PX } as const;

/* ═══════ 工具 ═══════ */
const U = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } };
const F = {
  hidden: { opacity: 0, scale: 1.01 },
  visible: { opacity: 1, scale: 1 },
};
const D = 0.9;
const E: [number, number, number, number] = [0.22, 1, 0.36, 1];

function useReveal(m?: string) {
  const r = useRef<HTMLDivElement>(null);
  return {
    ref: r,
    inView: useInView(r, { once: true, margin: m || "-60px 0px" }),
  };
}

/* ═══════ 页面标题区 ═══════ */
function PageHeader() {
  const { ref, inView } = useReveal();
  return (
    <section
      ref={ref}
      className="w-full"
      style={{
        paddingTop: "clamp(100px,12vh,150px)",
        paddingBottom: "clamp(60px,7vh,90px)",
        background: V.bg,
      }}
    >
      <div className={MX} style={SX}>
        <motion.p
          variants={U}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={{ duration: D, ease: E }}
          style={{
            fontSize: "9px",
            letterSpacing: "0.22em",
            color: V.acc,
            marginBottom: "14px",
          }}
        >
          JEWELRY COLLECTION
        </motion.p>
        <motion.h1
          variants={U}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={{ duration: D, ease: E, delay: 0.1 }}
          style={{
            fontSize: "clamp(34px,3.5vw,58px)",
            fontWeight: 400,
            lineHeight: 1.15,
            letterSpacing: "0.05em",
            color: V.text,
          }}
        >
          珠宝作品
        </motion.h1>
      </div>
    </section>
  );
}

/* ═══════ 产品卡片 ═══════ */
function ProductCardItem({
  product,
  index,
}: {
  product: CatalogProduct;
  index: number;
}) {
  const { ref, inView } = useReveal();
  return (
    <motion.div
      ref={ref}
      variants={U}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      transition={{ duration: D, ease: E, delay: 0.05 * (index % 8) }}
    >
      <Link
        to={`/products/${product.id}`}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div
          className="overflow-hidden"
          style={{
            aspectRatio: "3/4",
            background: V.surface,
            marginBottom: "14px",
          }}
        >
          {product.images?.[0] ? (
            <SecureImage
              src={product.images?.[0]}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transition: "transform 0.6s",
              }}
              className="hover:scale-105"
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: V.acc,
                fontSize: "28px",
              }}
            >
              ◆
            </div>
          )}
        </div>
        <p
          style={{
            fontSize: "9px",
            letterSpacing: "0.14em",
            color: V.acc,
            marginBottom: "6px",
          }}
        >
          {product.sku}
        </p>
        <h3
          style={{
            fontSize: "clamp(14px,1vw,17px)",
            fontWeight: 500,
            color: V.text,
            lineHeight: 1.4,
            marginBottom: "4px",
          }}
        >
          {product.name}
        </h3>
        <p
          style={{
            fontSize: "12px",
            color: V.sec,
            lineHeight: 1.5,
            marginBottom: "6px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.shortDescription || product.material}
        </p>
        <div
          style={{
            display: "flex",
            gap: "14px",
            fontSize: "11px",
            color: V.sec,
          }}
        >
          <span>{product.material}</span>
          {product.weight && <span>{product.weight}</span>}
        </div>
      </Link>
    </motion.div>
  );
}

/* ═══════ 主组件 ═══════ */
export default function ProductList() {
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  useEffect(() => {
    setPageMeta({
      title: "珠宝作品 | 海川珠宝",
      description: "浏览海川珠宝公开作品，涵盖黄金、镶嵌与花丝等东方工艺。",
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);

  // 与选款中心/搜索共用同一数据源与映射逻辑，避免重复拉取与字段漂移
  const { products: allProducts, loading, error, reload } = useProductData();
  // 解析 ?categoryId= 并按主分类过滤（首页 storyBands 的 /products?categoryId=6 由此激活）
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("categoryId");
  const products = categoryId
    ? allProducts.filter((p) => p.primaryCategoryId === categoryId)
    : allProducts;
  // P1-35：客户端逐步加载，避免一次渲染上千张卡片（DOM + IntersectionObserver 爆炸）
  const [visibleCount, setVisibleCount] = useState(24);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // P1-35：sentinel 进入视口时加载下一批（逐步加载，避免首屏渲染上千卡片）
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + 12);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    trackPageView();
  }, []);

  return (
    <div style={{ background: V.bg, overflowX: "hidden", minHeight: "100vh" }}>
      <PageHeader />

      {/* ── 产品网格 ── */}
      <section
        className="w-full"
        style={{ paddingBottom: "clamp(100px,12vh,150px)", background: V.bg }}
      >
        <div className={MX} style={SX}>
          {loading && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingBlock: "clamp(80px,10vh,120px)",
              }}
            >
              <Spin size="large" />
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                textAlign: "center",
                paddingBlock: "clamp(80px,10vh,120px)",
              }}
            >
              <p
                style={{ fontSize: "15px", color: V.sec, marginBottom: "16px" }}
              >
                加载失败，请检查网络后重试
              </p>
              <Button
                icon={<ReloadOutlined />}
                onClick={reload}
                style={{ color: V.acc, borderColor: V.line }}
              >
                重新加载
              </Button>
            </div>
          )}

          {!loading && !error && products.length === 0 && (
            <div
              style={{
                textAlign: "center",
                paddingBlock: "clamp(80px,10vh,120px)",
              }}
            >
              <p
                style={{
                  fontSize: "36px",
                  color: V.line,
                  marginBottom: "12px",
                }}
              >
                ◆
              </p>
              <p style={{ fontSize: "15px", color: V.sec }}>
                暂无珠宝作品，敬请期待
              </p>
            </div>
          )}

          {!loading && !error && products.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(clamp(240px,22vw,300px), 1fr))",
                gap: "clamp(32px,4vw,56px) clamp(20px,2.5vw,36px)",
              }}
            >
              {products.slice(0, visibleCount).map((p, i) => (
                <ProductCardItem key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
          {products.length > visibleCount && (
            <div
              ref={sentinelRef}
              style={{ height: 1, width: "100%", marginTop: 40 }}
              aria-hidden
            />
          )}

          {/* ── 选款中心入口 ── */}
          {!loading && !error && products.length > 0 && (
            <div
              style={{
                textAlign: "center",
                marginTop: "clamp(60px,8vh,100px)",
              }}
            >
              <Link
                to="/catalog"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  color: V.sec,
                  fontSize: "11px",
                  letterSpacing: "0.1em",
                  textDecoration: "none",
                  minHeight: "44px",
                  transition: "color 280ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = V.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = V.sec)}
              >
                选款中心 → 寻找具体款式
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
