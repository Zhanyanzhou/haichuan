import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { productApi } from '@/services/api';
import { productPlaceholder } from '@/utils/placeholder';
import { unwrapList } from '@/utils/unwrap';
import type { Product } from '@/types';

interface ProductsBlockProps {
  title?: string;
  subtitle?: string;
  linkUrl?: string;
  linkText?: string;
  settings?: { limit?: number; productIds?: number[] };
}

/**
 * 品牌首页精选作品 — 竖版海报，无价格，无标签
 */
export default function ProductsBlock({ title, subtitle, linkUrl, linkText, settings }: ProductsBlockProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const limit = settings?.limit || 3;

  useEffect(() => {
    (async () => {
      try {
        const res = await productApi.getList({ pageSize: limit });
        const list = unwrapList(res);
        setProducts(list.slice(0, limit));
      } catch {
        setProducts([]);
      }
    })();
  }, [limit]);

  if (products.length === 0) return null;

  return (
    <section className="py-24 md:py-32 px-6 md:px-20" style={{ background: '#F5F2ED' }}>
      <div className="max-w-6xl mx-auto">
        {title && (
          <h2 className="text-3xl md:text-4xl text-center mb-3 tracking-wide"
            style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C' }}>
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-center text-sm tracking-[.2em] uppercase mb-16" style={{ color: '#8A7F72' }}>
            {subtitle}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
          {products.map((product) => (
            <Link key={product.id} to={`/products/${product.id}`} className="group block">
              {/* 竖版海报 4:5 */}
              <div className="relative aspect-[4/5] overflow-hidden mb-6"
                style={{ background: '#EAE5DB' }}>
                <img
                  src={product.images?.[0]?.url || productPlaceholder(product.id, product.name)}
                  alt={product.name}
                  onError={e => { const t = e.currentTarget; if (!t.src.endsWith('/placeholder.svg')) t.src = '/images/products/placeholder.svg'; }}
                  className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-[1.02]"
                />
              </div>
              {/* 作品名 + 极短说明，无价格 */}
              <div className="text-center">
                <h3 className="text-base tracking-[.06em] transition-colors duration-300 group-hover:text-[#B8944E]"
                  style={{ color: '#2C2C2C' }}>
                  {product.name}
                </h3>
                {product.description && (
                  <p className="text-xs mt-2 tracking-wider line-clamp-1" style={{ color: '#8A7F72' }}>
                    {product.description.length > 20 ? product.description.slice(0, 20) + '…' : product.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>

        {linkUrl && linkText && (
          <div className="text-center mt-16">
            <Link to={linkUrl}
              className="inline-flex px-10 py-3 text-sm tracking-[.15em] border transition-all duration-300 hover:border-[#B8944E] hover:text-[#B8944E]"
              style={{ borderColor: '#C5C0B8', color: '#8A7F72' }}>
              {linkText}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}