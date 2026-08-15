import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { motion, useInView } from "framer-motion";
import { Spin, Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { trackPageView } from "@/hooks/useAnalytics";
import {
  useProductData,
  expandCategoryIds,
  type ProductQuery,
  type RealCategory,
} from "@/hooks/useProductData";
import { categoryApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { CatalogProduct } from "@/data/catalogData";
import { SecureImage } from "@/components/common/SecureImage";
import FilterPanel from "@/components/common/FilterPanel";

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

  // 服务端查询模式：关键词/材质/排序/分类透传后端（替代原 2000 全量 + 本地过滤）
  // keyword 拆输入态/查询态：输入不触发请求，回车或搜索按钮才应用（防逐键请求风暴）
  const [filters, setFilters] = useState({ keyword: "", materialType: "", sortBy: "updatedAt_desc" });
  const [keywordInput, setKeywordInput] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  // 累积页结果：触底加载下一页并追加（服务端分页下的无限滚动）
  const [accum, setAccum] = useState<CatalogProduct[]>([]);
  const [seenRevision, setSeenRevision] = useState<number | null>(null);
  const [categories, setCategories] = useState<RealCategory[]>([]);

  // 解析 ?categoryId=：分类树就绪后展开为"该分类+全部后代"ID 集合（首页链接由此激活）
  const [searchParams] = useSearchParams();
  const categoryIdParam = searchParams.get("categoryId");

  // 分类树独立拉取：query 组装依赖它，不能等商品 hook 返回（否则形成循环）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await categoryApi.getTree();
        const cats = unwrapResponse<any[]>(res) || [];
        if (!cancelled) setCategories(Array.isArray(cats) ? cats : []);
      } catch {
        // 分类树拉取失败不阻塞列表（分类筛选不生效但商品可浏览）
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryIds = useMemo(
    () =>
      categoryIdParam && categories.length > 0
        ? expandCategoryIds(categories, Number(categoryIdParam))
        : "",
    [categories, categoryIdParam],
  );
  // 带 URL 分类参数时先等分类树（null 暂停查询，避免首拉漏过滤）
  const query = useMemo<ProductQuery | null>(() => {
    if (categoryIdParam && categories.length === 0) return null;
    return {
      keyword: filters.keyword.trim() || undefined,
      materialType: filters.materialType || undefined,
      sortBy:
        filters.sortBy === "updatedAt_desc"
          ? undefined
          : (filters.sortBy as NonNullable<ProductQuery["sortBy"]>),
      ids: categoryIds || undefined,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [filters, categoryIds, page, categoryIdParam, categories.length]);

  const { products: pageProducts, total, loading, error, reload, revision } =
    useProductData(query);
  const waitingCategory = query === null;

  // SSE 商品变更（revision 变化）→ 回第一页重新累积；正常翻页 → 追加去重
  useEffect(() => {
    if (seenRevision === null) {
      setSeenRevision(revision);
      return;
    }
    if (revision !== seenRevision) {
      setSeenRevision(revision);
      setPage(1);
      setAccum([]);
      return;
    }
    if (loading) return;
    if (page === 1) {
      setAccum(pageProducts);
      return;
    }
    setAccum((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...pageProducts.filter((p) => !seen.has(p.id))];
    });
  }, [revision, seenRevision, loading, page, pageProducts]);

  // 筛选条件 / URL 分类参数变化 → 回第一页重新累积
  useEffect(() => {
    setPage(1);
    setAccum([]);
  }, [filters, categoryIdParam]);

  const hasMore = !loading && !error && !waitingCategory && accum.length < total;
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 触底加载下一页（服务端分页，替代原 visibleCount 全量切片）
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPage((p) => p + 1);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);
  useEffect(() => {
    trackPageView();
  }, []);

  const products = accum;

  return (
    <div style={{ background: V.bg, overflowX: "hidden", minHeight: "100vh" }}>
      <PageHeader />

      {/* ── 筛选与排序（服务端查询） ── */}
      <section className="w-full" style={{ background: V.bg }}>
        <div className={MX} style={{ paddingTop: "clamp(28px,4vh,48px)", ...SX }}>
          <FilterPanel
            keyword={keywordInput}
            onKeywordChange={(value) => {
              setKeywordInput(value);
              // allowClear 清空时同步重置已应用的关键词
              if (value === "" && filters.keyword) {
                setFilters((f) => ({ ...f, keyword: "" }));
              }
            }}
            onSearch={() => {
              const applied = keywordInput.trim();
              setKeywordInput(applied);
              // 值未变化时保持原引用，避免无谓的列表重置
              setFilters((f) => (f.keyword === applied ? f : { ...f, keyword: applied }));
            }}
            materialType={filters.materialType}
            onMaterialTypeChange={(value) => setFilters((f) => ({ ...f, materialType: value }))}
            sortValue={filters.sortBy}
            onSortChange={(value) => setFilters((f) => ({ ...f, sortBy: value }))}
            onReset={() => {
              setKeywordInput("");
              setFilters({ keyword: "", materialType: "", sortBy: "updatedAt_desc" });
            }}
          />
          {!loading && !error && !waitingCategory && total > 0 && (
            <p style={{ fontSize: "12px", color: V.sec, marginTop: "12px" }}>
              共 {total} 件作品
            </p>
          )}
        </div>
      </section>

      {/* ── 产品网格 ── */}
      <section
        className="w-full"
        style={{ paddingBottom: "clamp(100px,12vh,150px)", background: V.bg }}
      >
        <div className={MX} style={SX}>
          {(loading || waitingCategory) && (
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

          {!loading && !waitingCategory && !error && products.length === 0 && (
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
                {filters.keyword || filters.materialType || categoryIdParam
                  ? "没有符合筛选条件的作品，试试调整关键词或材质"
                  : "暂无珠宝作品，敬请期待"}
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
              {products.map((p, i) => (
                <ProductCardItem key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
          {hasMore && (
            <>
              <div
                ref={sentinelRef}
                style={{ height: 1, width: "100%", marginTop: 40 }}
                aria-hidden
              />
              {loading && products.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 32,
                  }}
                >
                  <Spin />
                </div>
              )}
            </>
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
