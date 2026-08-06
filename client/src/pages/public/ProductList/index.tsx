import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { Spin, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { productApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { getMaterialLabel } from '@/utils/material';

/* ═══════ 视觉常量 ═══════ */
const V = { bg: '#F4F1EA', surface: '#F8F6F1', text: '#29241F', sec: 'rgba(41,36,31,0.56)', line: 'rgba(41,36,31,0.12)', acc: '#A7895B' };
const MX = 'max-w-[1760px] mx-auto';
const PX = 'clamp(48px,5vw,88px)';
const SX = { paddingInline: PX } as const;

/* ═══════ 类型 ═══════ */
interface ProductCard {
  id: number;
  code: string;
  name: string;
  categoryName: string;
  materialLabel: string;
  shortDescription: string;
  imageUrl: string;
  price: number;
  goldWeight: string;
}

/* ═══════ 工具 ═══════ */
const U = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } };
const F = { hidden: { opacity: 0, scale: 1.01 }, visible: { opacity: 1, scale: 1 } };
const D = 0.9;
const E: [number, number, number, number] = [0.22, 1, 0.36, 1];

function useReveal(m?: string) { const r = useRef<HTMLDivElement>(null); return { ref: r, inView: useInView(r, { once: true, margin: m || '-60px 0px' }) }; }

function mapProduct(p: any): ProductCard {
  return {
    id: p.id,
    code: p.code || '',
    name: p.name || '',
    categoryName: p.category?.name || '',
    materialLabel: getMaterialLabel(p.materialType),
    shortDescription: p.shortDescription || '',
    imageUrl: p.images?.[0]?.url || '',
    price: Number(p.price) || 0,
    goldWeight: p.goldWeight ? `${p.goldWeight}g` : '',
  };
}

/* ═══════ 页面标题区 ═══════ */
function PageHeader() {
  const { ref, inView } = useReveal();
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(100px,12vh,150px)', paddingBottom: 'clamp(60px,7vh,90px)', background: V.bg }}>
      <div className={MX} style={SX}>
        <motion.p variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
          style={{ fontSize: '9px', letterSpacing: '0.22em', color: V.acc, marginBottom: '14px' }}>JEWELRY COLLECTION</motion.p>
        <motion.h1 variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.1 }}
          style={{ fontSize: 'clamp(34px,3.5vw,58px)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '0.05em', color: V.text }}>珠宝作品</motion.h1>
      </div>
    </section>
  );
}

/* ═══════ 产品卡片 ═══════ */
function ProductCardItem({ product, index }: { product: ProductCard; index: number }) {
  const { ref, inView } = useReveal();
  return (
    <motion.div ref={ref} variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'}
      transition={{ duration: D, ease: E, delay: 0.05 * (index % 8) }}>
      <Link to={`/products/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div className="overflow-hidden" style={{ aspectRatio: '3/4', background: V.surface, marginBottom: '14px' }}>
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s' }}
              className="hover:scale-105" />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.acc, fontSize: '28px' }}>◆</div>
          )}
        </div>
        <p style={{ fontSize: '9px', letterSpacing: '0.14em', color: V.acc, marginBottom: '6px' }}>{product.code}</p>
        <h3 style={{ fontSize: 'clamp(14px,1vw,17px)', fontWeight: 500, color: V.text, lineHeight: 1.4, marginBottom: '4px' }}>{product.name}</h3>
        <p style={{ fontSize: '12px', color: V.sec, lineHeight: 1.5, marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {product.shortDescription || product.materialLabel}
        </p>
        <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: V.sec }}>
          <span>{product.materialLabel}</span>
          {product.goldWeight && <span>{product.goldWeight}</span>}
        </div>
      </Link>
    </motion.div>
  );
}

/* ═══════ 主组件 ═══════ */
export default function ProductList() {
  const [products, setProducts] = useState<ProductCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await productApi.getList({ status: 'PUBLISHED', pageSize: 200 });
      const data = unwrapResponse<any>(res);
      const list: any[] = data?.list || data || [];
      // 只展示有简介的精品（排除纯选款货号）
      const curated = list.filter((p: any) => p.shortDescription);
      setProducts(curated.map(mapProduct));
    } catch {
      setError(true);
      setProducts(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  return (
    <div style={{ background: V.bg, overflowX: 'hidden', minHeight: '100vh' }}>
      <PageHeader />

      {/* ── 产品网格 ── */}
      <section className="w-full" style={{ paddingBottom: 'clamp(100px,12vh,150px)', background: V.bg }}>
        <div className={MX} style={SX}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingBlock: 'clamp(80px,10vh,120px)' }}>
              <Spin size="large" />
            </div>
          )}

          {error && !loading && (
            <div style={{ textAlign: 'center', paddingBlock: 'clamp(80px,10vh,120px)' }}>
              <p style={{ fontSize: '15px', color: V.sec, marginBottom: '16px' }}>加载失败，请检查网络后重试</p>
              <Button icon={<ReloadOutlined />} onClick={fetchProducts}
                style={{ color: V.acc, borderColor: V.line }}>重新加载</Button>
            </div>
          )}

          {!loading && !error && products !== null && products.length === 0 && (
            <div style={{ textAlign: 'center', paddingBlock: 'clamp(80px,10vh,120px)' }}>
              <p style={{ fontSize: '36px', color: V.line, marginBottom: '12px' }}>◆</p>
              <p style={{ fontSize: '15px', color: V.sec }}>暂无珠宝作品，敬请期待</p>
            </div>
          )}

          {!loading && !error && products !== null && products.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(240px,22vw,300px), 1fr))', gap: 'clamp(32px,4vw,56px) clamp(20px,2.5vw,36px)' }}>
              {products.map((p, i) => <ProductCardItem key={p.id} product={p} index={i} />)}
            </div>
          )}

          {/* ── 选款中心入口 ── */}
          {!loading && !error && products !== null && products.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 'clamp(60px,8vh,100px)' }}>
              <Link to="/catalog" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: V.sec, fontSize: '11px', letterSpacing: '0.1em', textDecoration: 'none', minHeight: '44px', transition: 'color 280ms' }}
                onMouseEnter={e => e.currentTarget.style.color = V.text} onMouseLeave={e => e.currentTarget.style.color = V.sec}>
                选款中心 → 寻找具体款式
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
