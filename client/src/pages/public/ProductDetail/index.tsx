import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Tabs, Spin, message } from 'antd';
import { HeartOutlined, ShoppingCartOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { getMaterialLabel } from '@/utils/material';
import { productApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import type { Product, ProductSKU } from '@/types';

function getCartItems(): any[] {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}

function addToCart(item: { productId: number; skuId: number; name: string; material: string; goldWeight: number; price: number; qty: number }) {
  const cart = getCartItems();
  const existing = cart.find((c: any) => c.skuId === item.skuId);
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }
  localStorage.setItem('cart', JSON.stringify(cart));
  message.success('已加入购物车');
}

export default function ProductDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [selectedSku, setSelectedSku] = useState<ProductSKU | null>(null);
  const [mainImage, setMainImage] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await productApi.getById(Number(id));
        const data = unwrapResponse<Product>(res);
        setProduct(data);
        if (data?.skus?.length) setSelectedSku(data.skus[0]);
      } catch {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spin size="large" /></div>;
  if (!product) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-brand-muted text-lg">该珠宝作品当前暂不可浏览</p>
      <Link to="/products" className="text-brand-gold hover:underline text-sm">返回珠宝作品列表</Link>
    </div>
  );

  const displayPrice = selectedSku?.price || product.price || 0;

  return (
    <div>
      <div className="max-w-7xl mx-auto px-6 md:px-20 py-10 md:py-16">
        {/* Breadcrumb */}
        <div className="text-xs tracking-[.2em] text-brand-gold mb-8 font-sans">
          <Link to="/" className="hover:text-brand-goldD transition-colors">首页</Link>
          <span className="mx-2 text-brand-muted">/</span>
          <Link to="/products" className="hover:text-brand-goldD transition-colors">臻品</Link>
          <span className="mx-2 text-brand-muted">/</span>
          <span className="text-brand-muted">{product.name}</span>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-20">
          {/* Left: Images */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
            <div className="aspect-[4/5] bg-brand-bg flex items-center justify-center sticky top-24 border border-brand-line">
              {product.images?.[mainImage]?.url ? (
                <img src={product.images[mainImage].url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-7xl text-brand-gold/20">◆</span>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              {product.images?.map((img, i) => (
                <div key={img.id} onClick={() => setMainImage(i)}
                  className={`w-16 h-16 bg-brand-bg flex items-center justify-center cursor-pointer border transition-colors overflow-hidden ${i === mainImage ? 'border-brand-gold' : 'border-transparent hover:border-brand-gold'}`}>
                  {img.url ? <img src={img.url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-brand-muted">图{i + 1}</span>}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: Info */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}>
            <h1 className="text-3xl md:text-4xl font-display font-semibold mb-2">{product.name}</h1>
            <p className="text-xs text-brand-muted mb-6 font-sans">{product.code}</p>

            <p className="body text-brand-muted mb-8 leading-relaxed">{product.description}</p>

            {/* Gold price reference */}
            <div className="border-y border-brand-line py-4 mb-8">
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-muted">金价参考</span>
                <span className="font-sans font-medium">¥485.60 <span className="text-xs text-brand-gold">/克</span></span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-brand-muted">金重</span>
                <span>{selectedSku?.goldWeight || product.goldWeight}g</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-brand-muted">工费</span>
                <span>¥{product.craftFee}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-brand-line font-medium">
                <span>售价</span>
                <span className="price text-2xl">¥{displayPrice.toLocaleString()}</span>
              </div>
            </div>

            {/* SKU selection */}
            {product.skus && product.skus.length > 0 && (
              <div className="mb-8">
                <p className="text-xs tracking-[.15em] uppercase text-brand-gold mb-3 font-sans">规格</p>
                <div className="flex gap-2 flex-wrap">
                  {product.skus.map(sku => (
                    <button key={sku.id} onClick={() => setSelectedSku(sku)}
                      className={`px-5 py-2.5 text-sm border transition-colors font-sans ${selectedSku?.id === sku.id ? 'border-brand-gold text-brand-gold' : 'border-brand-line hover:border-brand-gold'}`}>
                      {getMaterialLabel(sku.material)} · {sku.goldWeight}g · ¥{sku.price.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity + Actions */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center border border-brand-line">
                <button className="px-4 py-2.5 text-brand-muted hover:text-brand-text transition-colors font-sans" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span className="px-4 py-2.5 text-sm font-sans">{qty}</span>
                <button className="px-4 py-2.5 text-brand-muted hover:text-brand-text transition-colors font-sans" onClick={() => setQty(qty + 1)}>+</button>
              </div>
              <button className="btn btn-primary flex-1" onClick={() => addToCart({
                productId: product.id,
                skuId: selectedSku?.id || 0,
                name: product.name,
                material: selectedSku?.material ? getMaterialLabel(selectedSku.material) : getMaterialLabel(product.materialType),
                goldWeight: selectedSku?.goldWeight || product.goldWeight || 0,
                price: displayPrice,
                qty,
              })}>
                <ShoppingCartOutlined /> 加入购物车
              </button>
              <button className="p-3 border border-brand-line hover:border-brand-gold transition-colors">
                <HeartOutlined className="text-brand-muted hover:text-brand-gold transition-colors" />
              </button>
            </div>

            {/* Tabs */}
            <Tabs items={[
              { key: 'params', label: <span className="font-sans text-xs tracking-[.1em]">产品参数</span>, children: (
                  <div className="grid grid-cols-2 gap-4">
                    {[{ l: '材质', v: getMaterialLabel(product.materialType) }, { l: '金重', v: `${product.goldWeight || '-'}g` }, { l: '工费', v: `¥${product.craftFee || 0}` }, { l: '总重', v: `${product.weight || '-'}g` }, { l: '尺寸', v: product.size || '-' }].map(i => (
                      <div key={i.l}><p className="text-[10px] text-brand-muted uppercase">{i.l}</p><p className="text-sm mt-1">{i.v}</p></div>
                    ))}
                    {product.craftTechnique?.map(c => <div key={c}><p className="text-[10px] text-brand-muted uppercase">工艺</p><p className="text-sm mt-1">{c}</p></div>)}
                  </div>
                ),
              },
              { key: 'cert', label: <span className="font-sans text-xs tracking-[.1em]">证书</span>, children: product.certificates?.length ? product.certificates.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-4 bg-brand-bg"><SafetyCertificateOutlined className="text-brand-gold text-lg" /><span className="text-sm">{c.certType === 'NATIONAL' ? '国检证书' : c.certType === 'GIA' ? 'GIA证书' : '证书'} — {c.certNumber}</span></div>
                )) : <p className="text-brand-muted text-sm">暂无证书信息</p>,
              },
            ]} />
          </motion.div>
        </div>

        {/* Related */}
        <div className="mt-24 md:mt-32">
          <h2 className="h3 mb-8 text-center">相似推荐</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Link key={i} to="/products" className="block group">
                <div className="aspect-square bg-brand-bg mb-3 flex items-center justify-center"><span className="text-2xl text-brand-gold/20">◆</span></div>
                <p className="text-sm font-display group-hover:text-brand-gold transition-colors">相似臻品</p>
                <p className="text-xs text-brand-muted mt-1">查看详情</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
