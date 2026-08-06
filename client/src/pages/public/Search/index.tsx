import { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import {
  primaryCategories, secondaryCategories,
  MATERIALS, CRAFTS, SCENES,
  type CatalogProduct,
} from '@/data/catalogData';
import { useProductData } from '@/hooks/useProductData';

const T = { bg: '#FFFFFF', txt: '#29241F', sec: 'rgba(41,36,31,0.58)', light: 'rgba(41,36,31,0.38)', line: '#E8E7E3', imgBg: '#FAF9F7' };
const PX = 'clamp(32px,5vw,80px)';
const MW = 1320;
const HOT = ['戒指', '吊坠', '平安扣', '古法金', '婚嫁', '日常佩戴'];

/* ═══════ 类型 ═══════ */
interface Filters {
  category: string; series: string; material: string; craft: string; scene: string;
}

/* ═══════ 搜索+筛选 ═══════ */
function useResults(query: string, filters: Filters, products: CatalogProduct[]) {
  return useMemo(() => {
    let list = [...products];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.sku.toLowerCase().includes(q) ||
        (p.name && p.name.includes(q)) ||
        p.material.includes(q) || p.craft.includes(q) || p.scene.includes(q) || p.series.includes(q) ||
        primaryCategories.find(c => c.id === p.primaryCategoryId)?.name.includes(q) ||
        secondaryCategories.find(c => c.id === p.secondaryCategoryId)?.name.includes(q)
      );
    }
    if (filters.category) list = list.filter(p => p.primaryCategoryId === filters.category);
    if (filters.series) list = list.filter(p => p.series === filters.series);
    if (filters.material) list = list.filter(p => p.material === filters.material);
    if (filters.craft) list = list.filter(p => p.craft === filters.craft);
    if (filters.scene) list = list.filter(p => p.scene === filters.scene);
    return list;
  }, [query, filters]);
}

function filterCount(f: Filters) { return [f.category, f.series, f.material, f.craft, f.scene].filter(Boolean).length; }

/* ═══════ 系列选项（从真实数据提取） ═══════ */
function useSeriesOptions(products: CatalogProduct[]) {
  return useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (p.series) set.add(p.series); });
    return Array.from(set);
  }, []);
}

/* ═══════ 搜索建议 ═══════ */
function getSuggestions(q: string, products: CatalogProduct[]): { type: string; text: string }[] {
  if (!q.trim()) return [];
  const results: { type: string; text: string }[] = [];
  const seen = new Set<string>();
  const add = (type: string, text: string) => { if (!seen.has(text)) { seen.add(text); results.push({ type, text }); } };
  primaryCategories.filter(c => c.name.includes(q)).forEach(c => add('品类', c.name));
  secondaryCategories.filter(c => c.name.includes(q)).slice(0, 3).forEach(c => add('分类', c.name));
  const seriesSet = new Set(products.filter(p => p.series && p.series.includes(q)).map(p => p.series));
  seriesSet.forEach(s => add('系列', s));
  products.filter(p => p.sku.toLowerCase().includes(q.toLowerCase())).slice(0, 2).forEach(p => add('货号', p.sku));
  MATERIALS.filter(m => m.includes(q)).forEach(m => add('材质', m));
  CRAFTS.filter(c => c.includes(q)).forEach(c => add('工艺', c));
  return results.slice(0, 8);
}

/* ═══════ 筛选面板 ═══════ */
function FilterDrawer({ filters, seriesOptions, onFilter, onClear, onClose, count }: {
  filters: Filters; seriesOptions: string[];
  onFilter: (key: keyof Filters, v: string) => void; onClear: () => void; onClose: () => void; count: number;
}) {
  const toggle = (key: keyof Filters, v: string) => onFilter(key, filters[key] === v ? '' : v);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.12)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'clamp(360px,28vw,420px)',
        zIndex: 91, background: T.bg, overflowY: 'auto', padding: '32px 28px',
        display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 400, color: T.txt, margin: 0 }}>筛选作品</h3>
          <button onClick={onClose} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 20, color: T.sec, minWidth: 44, minHeight: 44 }}>✕</button>
        </div>
        <div style={{ flex: 1 }}>
          <FGroup title="品类" options={primaryCategories.map(c => c.name)} selected={filters.category ? primaryCategories.find(c => c.id === filters.category)?.name || '' : ''}
            onToggle={v => onFilter('category', primaryCategories.find(c => c.name === v)?.id || '')} />
          <FGroup title="系列" options={seriesOptions} selected={filters.series}
            onToggle={v => toggle('series', v)} />
          <FGroup title="材质" options={MATERIALS} selected={filters.material}
            onToggle={v => toggle('material', v)} />
          <FGroup title="工艺" options={CRAFTS} selected={filters.craft}
            onToggle={v => toggle('craft', v)} />
          <FGroup title="适用场景" options={SCENES} selected={filters.scene}
            onToggle={v => toggle('scene', v)} />
        </div>
        <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: `1px solid ${T.line}` }}>
          <button onClick={onClear} style={{ flex: 1, height: 40, border: `1px solid ${T.line}`, background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.sec }}>重置</button>
          <button onClick={onClose} style={{ flex: 1, height: 40, border: 0, background: T.txt, cursor: 'pointer', fontSize: 12, color: '#FFFFFF' }}>查看 {count} 件作品</button>
        </div>
      </div>
    </>
  );
}

function FGroup({ title, options, selected, onToggle }: {
  title: string; options: string[]; selected: string; onToggle: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, letterSpacing: '0.08em', color: T.light, marginBottom: 12 }}>{title}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {options.map(o => (
          <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: selected === o ? T.txt : T.sec, paddingBlock: 2 }}>
            <input type="checkbox" checked={selected === o} onChange={() => onToggle(o)}
              style={{ width: 13, height: 13, accentColor: T.txt, cursor: 'pointer' }} />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ═══════ 筛选标签 ═══════ */
function FilterTags({ filters, onClearAll }: { filters: Filters; onClearAll: () => void }) {
  const tags: { key: keyof Filters; label: string }[] = [];
  if (filters.category) tags.push({ key: 'category', label: primaryCategories.find(c => c.id === filters.category)?.name || '' });
  if (filters.series) tags.push({ key: 'series', label: filters.series });
  if (filters.material) tags.push({ key: 'material', label: filters.material });
  if (filters.craft) tags.push({ key: 'craft', label: filters.craft });
  if (filters.scene) tags.push({ key: 'scene', label: filters.scene });
  if (!tags.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
      <span style={{ fontSize: 11, color: T.light }}>当前筛选：</span>
      {tags.map(t => (
        <span key={t.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingInline: 8, height: 26, border: `1px solid ${T.line}`, fontSize: 11, color: T.txt }}>
          {t.label}<span style={{ color: T.light, marginInline: 2 }}>×</span>
        </span>
      ))}
      <button onClick={onClearAll} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 11, color: T.sec, textDecoration: 'underline' }}>清除全部</button>
    </div>
  );
}

/* ═══════ 产品卡片 ═══════ */
function ProductCard({ product }: { product: CatalogProduct }) {
  const fallbackRef = useRef(false);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Link to={`/catalog?category=${product.primaryCategoryId}&query=${product.sku}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div style={{ aspectRatio: '4/5', background: T.imgBg, overflow: 'hidden', marginBottom: 14 }}>
          <img src={product.images[0]} alt={`${product.name} ${product.sku}`} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain',
              transition: 'transform 600ms cubic-bezier(0.22,1,0.36,1)' }}
            onMouseEnter={e => { (e.target as HTMLImageElement).style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { (e.target as HTMLImageElement).style.transform = 'scale(1)'; }}
            onError={e => {
              if (fallbackRef.current) return;
              fallbackRef.current = true;
              (e.target as HTMLImageElement).src = '/images/products/placeholder.svg';
            }} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 400, color: T.txt, margin: '0 0 4px' }}>{product.name || product.sku}</p>
        <p style={{ fontSize: 12, color: T.sec, margin: '0 0 2px' }}>{product.series}</p>
        <p style={{ fontSize: 11, color: T.light, margin: 0 }}>{product.sku}</p>
      </Link>
    </motion.div>
  );
}

/* ═══════ 主页面 ═══════ */
export default function Search() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ category: '', series: '', material: '', craft: '', scene: '' });
  const [sort, setSort] = useState('recommended');
  const [focused, setFocused] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { history, addToHistory, removeOne, clearAll: clearHistory } = useSearchHistory();

  /* ═══ 统一产品数据（共享 Hook） ═══ */
  const { products: allProducts, loading: apiLoading, error: apiError } = useProductData();

  const seriesOptions = useSeriesOptions(allProducts);
  const results = useResults(query, filters, allProducts);
  const suggestions = useMemo(() => getSuggestions(query, allProducts), [query, allProducts]);
  const hasQuery = query.trim().length > 0;
  const hasFilters = filterCount(filters) > 0;
  const showHistory = focused && !hasQuery && history.length > 0;
  const showSuggestions = focused && hasQuery && suggestions.length > 0;
  const isShowingResults = hasQuery || hasFilters;

  const sorted = useMemo(() => {
    const s = [...results];
    if (sort === 'newest') s.reverse();
    else if (sort === 'sku') s.sort((a, b) => a.sku.localeCompare(b.sku));
    return s;
  }, [results, sort]);

  const doSearch = useCallback((q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setQuery(clean);
    addToHistory(clean);
    inputRef.current?.blur();
  }, [addToHistory]);

  const clearFilters = useCallback(() => setFilters({ category: '', series: '', material: '', craft: '', scene: '' }), []);
  const clearAll = useCallback(() => { setQuery(''); clearFilters(); }, [clearFilters]);
  const selectSuggestion = useCallback((s: string) => { setQuery(s); addToHistory(s); setFocused(false); inputRef.current?.blur(); }, [addToHistory]);

  const featured = useMemo(() => allProducts.slice(0, 6), [allProducts]);

  /* ═══ 加载/错误状态 ═══ */
  if (apiLoading) {
    return (
      <div style={{ background: T.bg, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: T.light }}>正在加载珠宝作品…</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div style={{ background: T.bg, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 15, color: T.txt }}>产品加载失败，请稍后重试</p>
        <button onClick={() => window.location.reload()} style={{ background: 'none', border: `1px solid ${T.line}`, padding: '8px 20px', cursor: 'pointer', fontSize: 12, color: T.txt }}>重新加载</button>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      {/* ═══════ 标题 + 搜索 ═══════ */}
      <section style={{ paddingBlock: 'clamp(36px,5vh,60px)' }}>
        <div style={{ maxWidth: MW, marginInline: 'auto', paddingInline: PX }}>
          {/* 搜索框 */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.sec, pointerEvents: 'none' }}
              width={15} height={15} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.3}>
              <circle cx={7.5} cy={7.5} r={5.5}/><line x1={11.5} y1={11.5} x2={17} y2={17}/>
            </svg>
            <input ref={inputRef} type="text" value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(query); }}
              placeholder="搜索作品名称、货号、品类或系列"
              style={{ width: '100%', height: 44, paddingLeft: 38, paddingRight: query ? 70 : 16,
                border: `1px solid ${focused ? 'rgba(41,36,31,0.40)' : T.line}`, borderRadius: 0,
                background: T.bg, fontSize: 15, color: T.txt, outline: 'none', transition: 'border-color 200ms' }}
            />
            {query && (
              <button onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                style={{ position: 'absolute', right: 42, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 0, cursor: 'pointer', color: T.sec, fontSize: 16, lineHeight: 1 }}>×</button>
            )}
            <button onClick={() => doSearch(query)}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40,
                background: 'none', border: 0, borderLeft: `1px solid ${T.line}`, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.sec }}>
              <svg width={14} height={14} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.2}>
                <circle cx={7.5} cy={7.5} r={5.5}/><line x1={11.5} y1={11.5} x2={17} y2={17}/>
              </svg>
            </button>

            {/* 搜索建议 — 浮层 */}
            <AnimatePresence>
              {showSuggestions && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                  style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 30,
                    background: T.bg, border: `1px solid ${T.line}`, borderTop: 'none',
                    maxHeight: 360, overflowY: 'auto' }}>
                  {suggestions.map((s, i) => (
                    <button key={`${s.type}-${s.text}-${i}`} onMouseDown={() => selectSuggestion(s.text)}
                      style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
                        textAlign: 'left', padding: '11px 16px 11px 40px',
                        background: 'none', border: 0, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F9F9F7'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                      <span style={{ fontSize: 10, color: T.light, minWidth: 36, letterSpacing: '0.04em' }}>{s.type}</span>
                      <span style={{ fontSize: 13, color: T.sec }}>{s.text}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 历史搜索 */}
          <AnimatePresence>
            {showHistory && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: T.light, letterSpacing: '0.06em' }}>最近搜索</span>
                  <button onClick={clearHistory} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 11, color: T.sec }}>清除记录</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                  {history.slice(0, 5).map(h => (
                    <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <button onMouseDown={() => selectSuggestion(h)}
                        style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 13, color: T.sec, padding: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.color = T.txt; }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.sec; }}>{h}</button>
                      <button onMouseDown={() => removeOne(h)}
                        style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12, color: T.light, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ═══════ 结果区 ═══════ */}
      {isShowingResults ? (
        <section style={{ paddingBottom: 120 }}>
          <div style={{ maxWidth: MW, marginInline: 'auto', paddingInline: PX }}>
            {/* 搜索说明 */}
            {hasQuery && (
              <p style={{ fontSize: 13, color: T.sec, marginBottom: 8 }}>
                「{query}」的搜索结果
              </p>
            )}

            {/* 工具栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
              borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}`, paddingBlock: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 13, color: T.sec }}>共找到 <span style={{ color: T.txt, fontWeight: 500 }}>{sorted.length}</span> 件作品</span>
                <button onClick={() => setFilterOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, paddingInline: 12,
                    background: 'none', border: `1px solid ${T.line}`, cursor: 'pointer', fontSize: 13, color: T.sec }}>
                  筛选{hasFilters ? ` (${filterCount(filters)})` : ''}
                </button>
              </div>
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ background: 'transparent', border: 0, fontSize: 12, color: T.sec, cursor: 'pointer',
                  outline: 'none', WebkitAppearance: 'none', appearance: 'none' }}>
                <option value="recommended">品牌推荐</option>
                <option value="newest">最新作品</option>
                <option value="sku">货号排序</option>
              </select>
            </div>

            {/* 筛选标签 */}
            <FilterTags filters={filters} onClearAll={clearFilters} />

            {/* 结果/空状态 */}
            {sorted.length === 0 ? (
              <div style={{ textAlign: 'center', paddingBlock: 72 }}>
                <p style={{ fontSize: 20, color: T.light, marginBottom: 8 }}>暂未找到符合条件的珠宝作品</p>
                <p style={{ fontSize: 14, color: T.sec, marginBottom: 28 }}>请检查关键词或减少筛选条件</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <button onClick={clearAll} style={{ background: 'none', border: `1px solid ${T.line}`, padding: '10px 24px', cursor: 'pointer', fontSize: 12, color: T.txt }}>清除筛选</button>
                  <Link to="/contact" style={{ background: 'none', border: `1px solid ${T.line}`, padding: '10px 24px', fontSize: 12, color: T.txt, textDecoration: 'none' }}>咨询客服</Link>
                </div>
                <div style={{ marginTop: 48, textAlign: 'left' }}>
                  <p style={{ fontSize: 11, color: T.light, letterSpacing: '0.08em', marginBottom: 20 }}>推荐作品</p>
                  <div className="srch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', columnGap: 28, rowGap: 56 }}>
                    {featured.map(p => <ProductCard key={p.id} product={p} />)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="srch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)',
                columnGap: 'clamp(22px,2.5vw,32px)', rowGap: 'clamp(44px,5.5vh,64px)', marginTop: hasFilters ? 16 : 0 }}>
                {sorted.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* ═══════ 初始状态 ═══════ */
        <section style={{ borderTop: `1px solid ${T.line}`, paddingBlock: 'clamp(36px,5vh,60px)' }}>
          <div style={{ maxWidth: MW, marginInline: 'auto', paddingInline: PX }}>
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 11, color: T.light, letterSpacing: '0.08em', marginBottom: 14 }}>热门搜索</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
                {HOT.map(tag => (
                  <button key={tag} onClick={() => doSearch(tag)}
                    style={{ background: 'none', border: `1px solid ${T.line}`, padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: T.sec }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.txt; e.currentTarget.style.color = T.txt; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.sec; }}>{tag}</button>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, color: T.light, letterSpacing: '0.08em', marginBottom: 20 }}>推荐作品</p>
            <div className="srch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', columnGap: 'clamp(22px,2.5vw,32px)', rowGap: 'clamp(44px,5.5vh,64px)' }}>
              {featured.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* ═══════ 筛选抽屉 ═══════ */}
      {filterOpen && (
        <FilterDrawer filters={filters} seriesOptions={seriesOptions}
          onFilter={(k, v) => setFilters(prev => ({ ...prev, [k]: v }))}
          onClear={clearFilters} onClose={() => setFilterOpen(false)} count={sorted.length} />
      )}

      <style>{`
        @media (min-width: 960px) { .srch-grid { grid-template-columns: repeat(3,1fr) !important; } }
      `}</style>
    </div>
  );
}
