import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spin } from 'antd';
import { useSelectionStore } from '@/store/selectionStore';
import {
  MATERIALS, type CatalogProduct,
} from '@/data/catalogData';
import { useProductData, type RealCategory } from '@/hooks/useProductData';

/* ══════════════════════════════════════
   设计令牌
   ══════════════════════════════════════ */
const T = {
  bg: '#FFFFFF',
  bgWarm: '#FAF9F7',
  txt: '#29241F',
  sec: 'rgba(41,36,31,0.68)',
  light: 'rgba(41,36,31,0.48)',
  line: '#E8E7E3',
  imgBg: '#FAF9F7',
};

const HEADER_H = 84;
const PAGE_SIZE = 32;
const SKU_RE = /^[A-Z]{2,3}-[A-Z]{2,3}-\d{3,4}$/i;

/** 从真实分类树查找名称 */
function catNameById(tree: RealCategory[], id: number): string {
  for (const c of tree) {
    if (c.id === id) return c.name;
    if (c.children?.length) {
      const found = catNameById(c.children, id);
      if (found) return found;
    }
  }
  return '';
}

/** 获取一级分类的二级子分类 */
function getRealSubs(tree: RealCategory[], parentId: number): RealCategory[] {
  for (const c of tree) {
    if (c.id === parentId) return c.children || [];
  }
  return [];
}

/** 从真实分类树获取一级分类列表 */
function getPrimaryCats(tree: RealCategory[]): RealCategory[] {
  return tree.filter(c => c.level === 1).sort((a, b) => a.id - b.id);
}

/* ══════════════════════════════════════
   URL 状态管理
   ══════════════════════════════════════ */
interface URLParams {
  category: string; subcategory: string; query: string;
  materials: string[]; crafts: string[]; weights: string[]; sizes: string[];
  sort: string; page: number;
}

function useURLParams() {
  const [p, setP] = useState<URLParams>(() => {
    const u = new URL(window.location.href);
    return {
      category: u.searchParams.get('category') || '',
      subcategory: u.searchParams.get('subcategory') || '',
      query: u.searchParams.get('query') || '',
      materials: u.searchParams.get('material')?.split(',').filter(Boolean) || [],
      crafts: u.searchParams.get('craft')?.split(',').filter(Boolean) || [],
      weights: u.searchParams.get('weight')?.split(',').filter(Boolean) || [],
      sizes: u.searchParams.get('size')?.split(',').filter(Boolean) || [],
      sort: u.searchParams.get('sort') || 'recommended',
      page: parseInt(u.searchParams.get('page') || '1', 10),
    };
  });

  const syncURL = useCallback((next: URLParams) => {
    const u = new URL(window.location.href);
    const s = (k: string, v: string) => v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
    s('category', next.category);
    s('subcategory', next.subcategory);
    s('query', next.query);
    s('material', next.materials.join(','));
    s('craft', next.crafts.join(','));
    s('weight', next.weights.join(','));
    s('size', next.sizes.join(','));
    s('sort', next.sort !== 'recommended' ? next.sort : '');
    s('page', next.page > 1 ? String(next.page) : '');
    window.history.replaceState(null, '', u.toString());
  }, []);

  const update = useCallback((key: string, val: string | string[]) => {
    setP(prev => {
      const next = { ...prev } as Record<string, unknown>;
      if (key === 'category') { next.category = val; next.subcategory = ''; next.page = 1; }
      else if (key === 'page') { next.page = Number(val); }
      else if (Array.isArray(val)) { next[key] = val; next.page = 1; }
      else { next[key] = val; next.page = 1; }
      syncURL(next as unknown as URLParams);
      return next as unknown as URLParams;
    });
  }, [syncURL]);

  return { params: p, update };
}

/* ══════════════════════════════════════
   数据过滤与排序
   ══════════════════════════════════════ */
function useFiltered(p: URLParams, products: CatalogProduct[]) {
  return useMemo(() => {
    let list = [...products];
    const q = p.query.trim();
    const isSku = SKU_RE.test(q);

    if (q && isSku) {
      const ql = q.toLowerCase();
      list = list.filter(x => x.sku.toLowerCase() === ql);
    } else {
      if (p.category) list = list.filter(x => x.primaryCategoryId === p.category);
      if (p.subcategory) list = list.filter(x => x.secondaryCategoryId === p.subcategory);
      if (q) {
        const ql = q.toLowerCase();
        list = list.filter(x =>
          x.sku.toLowerCase().includes(ql) ||
          (x.name && x.name.includes(ql)) ||
          (x.categoryName && x.categoryName.includes(ql)) ||
          x.material.includes(ql)
        );
      }
    }
    if (p.materials.length) list = list.filter(x => p.materials.includes(x.material));
    return list;
  }, [p, products]);
}

function useSorted(list: CatalogProduct[], sort: string) {
  return useMemo(() => {
    const s = [...list];
    if (sort === 'newest') s.reverse();
    else if (sort === 'sku') s.sort((a, b) => a.sku.localeCompare(b.sku));
    return s;
  }, [list, sort]);
}

/* ══════════════════════════════════════
   组件：一级类目（真实分类）
   ══════════════════════════════════════ */
function PrimaryNav({ active, onChange, categories }: { active: string; onChange: (id: string) => void; categories: RealCategory[] }) {
  const primaryCats = getPrimaryCats(categories);
  if (!primaryCats.length) return null;
  return (
    <nav style={{ borderBottom: `1px solid ${T.line}` }}>
      <div style={{
        maxWidth: 1560, marginInline: 'auto',
        paddingInline: 'clamp(48px,5vw,80px)',
        display: 'flex', justifyContent: 'center',
        height: 66, alignItems: 'center',
        gap: 'clamp(48px,6vw,104px)',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {primaryCats.map(c => {
          const cid = String(c.id);
          const isA = active === cid;
          return (
            <button key={c.id} onClick={() => onChange(isA ? '' : cid)}
              style={{
                position: 'relative', background: 'none', border: 0, cursor: 'pointer',
                fontSize: 'clamp(16px,1.8vw,19px)', fontWeight: 400,
                letterSpacing: '0.06em', whiteSpace: 'nowrap',
                color: isA ? T.txt : T.sec, padding: '0 0 8px 0',
                transition: 'color 280ms',
              }}>
              {c.name}
              {isA && <span style={{ position: 'absolute', bottom: -1, left: '50%', transform: 'translateX(-50%)',
                width: 'clamp(28px,3vw,36px)', height: 1.5, background: T.txt }} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ══════════════════════════════════════
   组件：二级类目（真实子分类）
   ══════════════════════════════════════ */
function SecondaryNav({ parentId, active, onChange, categories }: {
  parentId: string; active: string; onChange: (id: string) => void; categories: RealCategory[];
}) {
  const subs = getRealSubs(categories, Number(parentId));
  if (!subs.length) return null;

  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div style={{
        maxWidth: 1560, marginInline: 'auto',
        paddingInline: 'clamp(48px,5vw,80px)',
        display: 'flex', alignItems: 'center',
        minHeight: 52, gap: 4,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        <L2Btn active={!active} onClick={() => onChange('')}>
          全部
        </L2Btn>
        {subs.map(s => (
          <L2Btn key={s.id} active={active === String(s.id)} onClick={() => onChange(String(s.id))}>
            {s.name}
          </L2Btn>
        ))}
      </div>
    </div>
  );
}

function L2Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      paddingInline: 12, height: 52, display: 'inline-flex', alignItems: 'center',
      background: 'none', border: 0, cursor: 'pointer',
      fontSize: 13, letterSpacing: '0.04em',
      color: active ? T.txt : T.sec,
      whiteSpace: 'nowrap', position: 'relative',
    }}>
      {children}
      {active && <span style={{ position: 'absolute', bottom: 12, left: 12, right: 12, height: 1, background: T.txt }} />}
    </button>
  );
}

/* ══════════════════════════════════════
   组件：工具栏（极简风格）
   ══════════════════════════════════════ */
function Toolbar({ category, total, materials, sort, selCount,
  onToggleMaterial, onSort, categories }: {
  category: string; total: number;
  materials: string[]; sort: string; selCount: number;
  onToggleMaterial: (m: string) => void;
  onSort: (s: string) => void;
  categories: RealCategory[];
}) {
  const parentName = catNameById(categories, Number(category));
  const path = category ? parentName : '全部作品';
  const [openDD, setOpenDD] = useState<string | null>(null);

  return (
    <>
      <div style={{ borderBottom: `1px solid ${T.line}` }}>
        <div style={{
          maxWidth: 1560, marginInline: 'auto',
          paddingInline: 'clamp(16px,3vw,28px)',
          height: 52, display: 'flex', alignItems: 'center', gap: 20,
          fontSize: 12, color: T.sec,
        }}>
          <span style={{ color: T.txt, fontSize: 13 }}>{path}</span>
          <span style={{ color: T.light }}>{total} 件作品</span>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setOpenDD(openDD === 'material' ? null : 'material')}
              style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12, color: T.sec, padding: '4px 8px' }}>
              材质{materials.length > 0 ? ` ${materials.length}` : ''}
            </button>
            {openDD === 'material' && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpenDD(null)} />
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, minWidth: 180,
                  background: T.bg, border: `1px solid ${T.line}`, padding: '14px 16px' }}>
                  {MATERIALS.map(o => (
                    <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: T.txt, paddingBlock: 3 }}>
                      <input type="checkbox" checked={materials.includes(o)} onChange={() => onToggleMaterial(o)}
                        style={{ width: 13, height: 13, accentColor: T.txt }} />
                      {o}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <select value={sort} onChange={e => onSort(e.target.value)}
            style={{ background: 'none', border: 0, fontSize: 12, color: T.sec, cursor: 'pointer', outline: 'none' }}>
            <option value="recommended">推荐</option>
            <option value="newest">最新</option>
            <option value="sku">货号</option>
          </select>
          {selCount > 0 && <span style={{ color: T.txt }}>已选 {selCount}</span>}
        </div>
      </div>
    </>
  );
}

function DD({ target, label, count, open, setOpen, options, selected, onToggle }: {
  target: string; label: string; count: string; open: string | null; setOpen: (v: string | null) => void;
  options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  const isOpen = open === target;
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(isOpen ? null : target)}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, minHeight: 44, paddingInline: 10,
          background: 'none', border: 0, cursor: 'pointer', fontSize: 13, letterSpacing: '0.04em', color: T.sec, whiteSpace: 'nowrap' }}>
        {label}⌄{count}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, minWidth: 200,
              background: T.bg, border: `1px solid ${T.line}`, padding: '16px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {options.map(o => (
                <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.txt, paddingBlock: 3 }}>
                  <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)}
                    style={{ width: 13, height: 13, accentColor: T.txt, cursor: 'pointer' }} />
                  {o}
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：当前筛选标签
   ══════════════════════════════════════ */
function ActiveFilters({ materials, crafts, weights, sizes,
  onClearMat, onClearCraft, onClearWeight, onClearSize, onClearAll }: {
  materials: string[]; crafts: string[]; weights: string[]; sizes: string[];
  onClearMat: (m: string) => void; onClearCraft: (c: string) => void;
  onClearWeight: (w: string) => void; onClearSize: (s: string) => void;
  onClearAll: () => void;
}) {
  const all = [...materials, ...crafts, ...weights, ...sizes];
  if (!all.length) return null;
  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div style={{ maxWidth: 1560, marginInline: 'auto', paddingInline: 'clamp(48px,5vw,80px)', paddingBlock: 10,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {materials.map(m => <Tag key={m} label={m} onRemove={() => onClearMat(m)} />)}
        {crafts.map(c => <Tag key={c} label={c} onRemove={() => onClearCraft(c)} />)}
        {weights.map(w => <Tag key={w} label={w} onRemove={() => onClearWeight(w)} />)}
        {sizes.map(s => <Tag key={s} label={s} onRemove={() => onClearSize(s)} />)}
        <button onClick={onClearAll}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 11, color: T.sec, textDecoration: 'underline', padding: '4px 2px' }}>
          清除筛选
        </button>
      </div>
    </div>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, paddingInline: 9, height: 28,
      border: `1px solid ${T.line}`, fontSize: 11, color: T.txt }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 0, cursor: 'pointer', color: T.sec, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </span>
  );
}

/* ══════════════════════════════════════
   组件：更多筛选抽屉
   ══════════════════════════════════════ */
function FilterDrawer({ category, materials, crafts, weights, sizes, onMaterials, onCrafts, onWeights, onSizes, onClear, onClose, total }: {
  category: string; materials: string[]; crafts: string[]; weights: string[]; sizes: string[];
  onMaterials: (m: string[]) => void; onCrafts: (c: string[]) => void;
  onWeights: (w: string[]) => void; onSizes: (s: string[]) => void;
  onClear: () => void; onClose: () => void; total: number;
}) {
  const toggle = (arr: string[], v: string, setter: (a: string[]) => void) => {
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };
  const sizeOptions = SIZES[category] || [];
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.12)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'clamp(380px,28vw,440px)',
        zIndex: 91, background: T.bg, overflowY: 'auto', padding: '32px 28px',
        boxShadow: '-1px 0 0 ' + T.line, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 400, color: T.txt, margin: 0 }}>更多筛选</h3>
          <button onClick={onClose} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 20, color: T.sec, lineHeight: 1, minWidth: 44, minHeight: 44 }}>✕</button>
        </div>
        <div style={{ flex: 1 }}>
          <FG title="材质" options={MATERIALS} selected={materials} onToggle={v => toggle(materials, v, onMaterials)} />
          <FG title="工艺" options={CRAFTS} selected={crafts} onToggle={v => toggle(crafts, v, onCrafts)} />
          <FG title="重量" options={WEIGHT_RANGES} selected={weights} onToggle={v => toggle(weights, v, onWeights)} />
          {sizeOptions.length > 0 && <FG title={category ? `${catName(category)}规格` : '规格'} options={sizeOptions} selected={sizes} onToggle={v => toggle(sizes, v, onSizes)} />}
        </div>
        <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: `1px solid ${T.line}` }}>
          <button onClick={onClear} style={{ flex: 1, height: 40, border: `1px solid ${T.line}`, background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.sec }}>重置</button>
          <button onClick={onClose} style={{ flex: 1, height: 40, border: 0, background: T.txt, cursor: 'pointer', fontSize: 12, color: '#FFFFFF' }}>查看 {total} 款结果</button>
        </div>
      </div>
    </>
  );
}

function FG({ title, options, selected, onToggle }: {
  title: string; options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 10, letterSpacing: '0.1em', color: T.light, marginBottom: 12 }}>{title}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {options.map(o => (
          <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: T.txt, paddingBlock: 2 }}>
            <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)}
              style={{ width: 13, height: 13, accentColor: T.txt, cursor: 'pointer' }} />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：产品卡片（梵克雅宝矩阵风格）
   ══════════════════════════════════════ */
function ProductCard({ product, onQuickView }: { product: CatalogProduct; onQuickView: (p: CatalogProduct) => void }) {
  const toggle = useSelectionStore(s => s.toggle);
  const sel = useSelectionStore(s => s.isSelected)(product.id);
  
  const priceText = product.price && product.price > 0 
    ? `¥${product.price.toLocaleString()}` 
    : '咨询价格';
  
  const subInfo = [product.categoryName, product.material].filter(Boolean).join(' · ');

  return (
    <div style={{ background: T.bg }}>
      {/* 图片区：1:1，干净无框 */}
      <div 
        onClick={() => onQuickView(product)}
        style={{
          aspectRatio: '1/1',
          background: T.imgBg,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img 
          src={product.images[0] || ''} 
          alt={product.name || product.sku} 
          loading="lazy" className="catalog-img"
          style={{
            width: '78%', height: '78%',
            objectFit: 'contain',
            transition: 'transform 0.6s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* 信息区：名称 → 材质 → 价格 → 选款 */}
      <div style={{ padding: '14px 0 20px', textAlign: 'left' }}>
        <h3 style={{
          fontSize: 13, fontWeight: 400, color: T.txt,
          margin: '0 0 5px', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {product.name || product.sku}
        </h3>
        <p style={{
          fontSize: 11, color: T.light, margin: '0 0 8px', lineHeight: 1.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {subInfo}
        </p>
        <p style={{
          fontSize: 12, fontWeight: 400, color: T.txt,
          margin: '0 0 10px', lineHeight: 1.4,
        }}>
          {priceText}
        </p>
        <button 
          onClick={(e) => { e.stopPropagation(); toggle(product.id); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: 28, padding: '0 12px',
            background: 'none',
            border: `1px solid ${T.line}`,
            cursor: 'pointer',
            fontSize: 11, letterSpacing: '0.03em',
            color: sel ? '#fff' : T.sec,
            backgroundColor: sel ? T.txt : 'transparent',
            transition: 'all 0.2s',
          }}
        >
          {sel ? '✓ 已选' : '+ 选款'}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：产品矩阵（横竖分割线网格）
   ══════════════════════════════════════ */
function ProductGrid({ products, page, onQuickView }: {
  products: CatalogProduct[]; page: number; onQuickView: (p: CatalogProduct) => void;
}) {
  const start = (page - 1) * PAGE_SIZE;
  const items = products.slice(start, start + PAGE_SIZE);

  return (
    <>
      <style>{`
        .catalog-matrix {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          background: ${T.line};
          gap: 1px;
        }
        .catalog-matrix > * {
          background: ${T.bg};
        }
        @media (min-width: 768px) { .catalog-matrix { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1080px) { .catalog-matrix { grid-template-columns: repeat(4, 1fr); } }
      `}</style>
      <div className="catalog-matrix" style={{ maxWidth: 1560, margin: '0 auto' }}>
        {items.map(p => (
          <div key={p.id} style={{ padding: 'clamp(16px,3vw,28px)' }}>
            <ProductCard product={p} onQuickView={onQuickView} />
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1560, margin: '0 auto', height: 1, background: T.line }} />
    </>
  );
}

/* ══════════════════════════════════════
   组件：快速查看
   ══════════════════════════════════════ */
function QuickView({ product, onClose }: { product: CatalogProduct | null; onClose: () => void }) {
  if (!product) return null;
  const toggle = useSelectionStore(s => s.toggle);
  const sel = useSelectionStore(s => s.isSelected)(product.id);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.15)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(720px,44vw)',
        zIndex: 96, background: T.bg, overflowY: 'auto', padding: '40px 36px',
        boxShadow: '-1px 0 0 ' + T.line }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 24,
          background: 'none', border: 0, cursor: 'pointer', fontSize: 22, color: T.sec, lineHeight: 1, minWidth: 44, minHeight: 44 }}>✕</button>
        <div style={{ aspectRatio: '1/1', background: T.imgBg, overflow: 'hidden', marginBottom: 28 }}>
          <img src={product.images[0]} alt={product.sku} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={e => { const t = e.currentTarget; if (!t.src.endsWith('/placeholder.svg')) t.src = '/images/products/placeholder.svg'; }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 400, color: T.txt, margin: '0 0 4px' }}>{product.sku}</h2>
        {product.name && <p style={{ fontSize: 16, color: T.txt, margin: '0 0 16px', lineHeight: 1.5 }}>{product.name}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 24 }}>
          <Info label="品类" value={product.categoryName || ''} />
          {product.material && <Info label="材质" value={product.material} />}
          {product.craft && <Info label="工艺" value={product.craft} />}
          {product.weight && <Info label="重量" value={product.weight} />}
          {product.size && <Info label="规格" value={product.size} />}
          {product.series && <Info label="系列" value={product.series} />}
        </div>
        <button onClick={() => toggle(product.id)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, paddingInline: 24,
          border: `1px solid ${sel ? T.txt : T.line}`, background: sel ? T.txt : 'transparent',
          cursor: 'pointer', fontSize: 13, letterSpacing: '0.04em', color: sel ? '#FFFFFF' : T.txt }}>
          {sel ? '✓ 已选' : '+ 加入选款'}
        </button>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span style={{ fontSize: 10, letterSpacing: '0.08em', color: T.light }}>{label}</span><p style={{ fontSize: 13, color: T.txt, margin: '2px 0 0' }}>{value}</p></div>;
}

/* ══════════════════════════════════════
   组件：分页
   ══════════════════════════════════════ */
function Pagination({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  const tp = Math.ceil(total / PAGE_SIZE);
  if (tp <= 1) return null;
  const pages: (number | string)[] = [];
  for (let i = 1; i <= tp; i++) {
    if (i === 1 || i === tp || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <div style={{ maxWidth: 1560, marginInline: 'auto', paddingInline: 'clamp(48px,5vw,80px)',
      paddingBlock: 'clamp(40px,5vh,60px)', display: 'flex', justifyContent: 'center', gap: 4 }}>
      <PBtn disabled={page === 1} onClick={() => onPage(page - 1)}>‹</PBtn>
      {pages.map((p, i) => p === '...'
        ? <span key={`d${i}`} style={{ width: 36, textAlign: 'center', color: T.sec }}>…</span>
        : <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
      )}
      <PBtn disabled={page === tp} onClick={() => onPage(page + 1)}>›</PBtn>
    </div>
  );
}

function PBtn({ children, active, disabled, onClick }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      minWidth: 36, height: 36, border: 'none', background: active ? T.txt : 'transparent',
      cursor: disabled ? 'default' : 'pointer', fontSize: 12,
      color: active ? '#FFFFFF' : disabled ? 'rgba(41,36,31,0.3)' : T.txt }}>
      {children}
    </button>
  );
}

/* ══════════════════════════════════════
   组件：选款托盘（使用 API 产品）
   ══════════════════════════════════════ */
function SelectionTray({ products }: { products: CatalogProduct[] }) {
  const ids = useSelectionStore(s => s.selectedIds);
  if (!ids.size) return null;
  const thumbs = products.filter(p => ids.has(p.id)).slice(0, 4);
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
      display: 'flex', alignItems: 'center', gap: 14, paddingInline: 20, height: 48,
      background: T.txt, maxWidth: 'calc(100vw - 32px)' }}>
      <div className="tray-thumbs" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {thumbs.map(p => (
          <div key={p.id} style={{ width: 32, height: 32, background: T.imgBg, overflow: 'hidden', flexShrink: 0 }}>
            <img src={p.images[0]} alt={p.sku} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ))}
      </div>
      <span style={{ fontSize: 12, color: '#FFFFFF' }}>已选 {ids.size} 款</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>查看选款单 →</span>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：吸顶工具栏
   ══════════════════════════════════════ */
function StickyBar({ category, total, sort, selCount, onSort, categories }: {
  category: string; total: number; sort: string; selCount: number;
  onSort: (s: string) => void; categories: RealCategory[];
}) {
  const parentName = catNameById(categories, Number(category));
  const path = category ? parentName : '全部款式';
  return (
    <div style={{ position: 'fixed', top: HEADER_H, left: 0, right: 0, zIndex: 40,
      background: 'rgba(255,255,255,0.95)', borderBottom: `1px solid ${T.line}` }}>
      <div style={{ maxWidth: 1560, marginInline: 'auto', paddingInline: 'clamp(48px,5vw,80px)',
        height: 52, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 12, color: T.txt }}>{path}</span>
        <span style={{ fontSize: 11, color: T.sec }}>{total} 款</span>
        <div style={{ flex: 1 }} />
        <select value={sort} onChange={e => onSort(e.target.value)} style={{ background: 'transparent', border: 0, outline: 'none', fontSize: 12, color: T.sec, cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none' }}>
          <option value="recommended">推荐</option><option value="newest">最新</option><option value="sku">货号</option>
        </select>
        {selCount > 0 && <span style={{ fontSize: 11, color: T.sec }}>已选 {selCount}</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   主页面
   ══════════════════════════════════════ */
export default function Catalog() {
  const { params, update } = useURLParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickView, setQuickView] = useState<CatalogProduct | null>(null);
  const selCount = useSelectionStore(s => s.selectedIds.size);

/* ═══ API 产品数据（共享 Hook） ═══ */
  const { products: mergedProducts, loading: apiLoading, error: apiError, categories } = useProductData();

  const filtered = useFiltered(params, mergedProducts);
  const sorted = useSorted(filtered, params.sort);
  const tp = Math.ceil(sorted.length / PAGE_SIZE);

  useEffect(() => { if (params.page > tp && tp > 0) update('page', String(tp)); }, [tp, params.page, update]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setQuickView(null); setFilterOpen(false); } };
    if (quickView || filterOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickView, filterOpen]);

  const [stickyVisible, setStickyVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current; if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { rootMargin: `-${HEADER_H}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const clearAll = () => { update('material', []); update('craft', []); update('weight', []); update('size', []); };
  const toggleArray = (key: string, arr: string[], val: string) =>
    update(key, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  return (
    <main style={{ background: T.bg, minHeight: '100vh', paddingBottom: 160, overflowX: 'hidden' }}>
      <PrimaryNav active={params.category} onChange={c => update('category', c)} categories={categories} />
      {params.category && (
        <SecondaryNav parentId={params.category} active={params.subcategory} onChange={s => update('subcategory', s)} categories={categories} />
      )}
      <div ref={sentinelRef}>
        <Toolbar category={params.category} total={sorted.length}
          materials={params.materials} sort={params.sort} selCount={selCount}
          onToggleMaterial={m => toggleArray('material', params.materials, m)}
          onSort={s => update('sort', s)} categories={categories} />
      </div>
      {stickyVisible && (
        <StickyBar category={params.category} total={sorted.length}
          sort={params.sort} selCount={selCount} onSort={s => update('sort', s)} categories={categories} />
      )}
      <ActiveFilters materials={params.materials} crafts={params.crafts} weights={params.weights} sizes={params.sizes}
        onClearMat={m => update('material', params.materials.filter(x => x !== m))}
        onClearCraft={c => update('craft', params.crafts.filter(x => x !== c))}
        onClearWeight={w => update('weight', params.weights.filter(x => x !== w))}
        onClearSize={s => update('size', params.sizes.filter(x => x !== s))}
        onClearAll={clearAll} />
      {apiLoading ? (
        <div style={{ textAlign: 'center', paddingBlock: 80, maxWidth: 1560, marginInline: 'auto', paddingInline: 'clamp(48px,5vw,80px)' }}>
          <p style={{ fontSize: 14, color: T.light }}>正在加载珠宝作品…</p>
        </div>
      ) : apiError ? (
        <div style={{ textAlign: 'center', paddingBlock: 80, maxWidth: 1560, marginInline: 'auto', paddingInline: 'clamp(48px,5vw,80px)' }}>
          <p style={{ fontSize: 15, color: T.txt, marginBottom: 12 }}>产品加载失败，请稍后重试</p>
          <button onClick={() => window.location.reload()} style={{ background: 'none', border: `1px solid ${T.line}`, padding: '8px 20px', cursor: 'pointer', fontSize: 12, color: T.txt }}>重新加载</button>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', paddingBlock: 80, maxWidth: 1560, marginInline: 'auto', paddingInline: 'clamp(48px,5vw,80px)' }}>
          <p style={{ fontSize: 15, color: T.txt, marginBottom: 8 }}>暂无可展示的珠宝作品</p>
          <button onClick={clearAll} style={{ background: 'none', border: `1px solid ${T.line}`, padding: '8px 20px', cursor: 'pointer', fontSize: 12, color: T.txt }}>清除筛选</button>
        </div>
      ) : <ProductGrid products={sorted} page={params.page} onQuickView={setQuickView} />}
      <Pagination total={sorted.length} page={params.page} onPage={p => update('page', String(p))} />
      {quickView && <QuickView product={quickView} onClose={() => setQuickView(null)} />}
      {filterOpen && (
        <FilterDrawer category={params.category} materials={params.materials} crafts={params.crafts} weights={params.weights} sizes={params.sizes}
          onMaterials={m => update('material', m)} onCrafts={c => update('craft', c)}
          onWeights={w => update('weight', w)} onSizes={s => update('size', s)}
          onClear={() => { update('material', []); update('craft', []); update('weight', []); update('size', []); }}
          onClose={() => setFilterOpen(false)} total={sorted.length} />
      )}
      <SelectionTray />
    </main>
  );
}
