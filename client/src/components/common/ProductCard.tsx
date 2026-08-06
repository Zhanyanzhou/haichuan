import { Card, Tag, Tooltip } from 'antd';
import { EyeOutlined, ShoppingCartOutlined, FireOutlined, GiftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Product } from '@/types';
import SafeImage from '@/components/ui/SafeImage';

interface ProductCardProps {
  product: Product;
  showSales?: boolean;
  className?: string;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, showSales = true, className = '' }) => {
  const navigate = useNavigate();
  const mainImage = product.images?.[0]?.url || '';
  const displayPrice = product.price || product.priceMin || 0;

  return (
    <Card
      hoverable
      className={`group overflow-hidden border border-brand-line bg-white transition-shadow hover:shadow-lg ${className}`}
      cover={
        <div className="relative aspect-square overflow-hidden bg-gray-50">
          <SafeImage
            src={mainImage}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* 标签 */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {product.isHot && <Tag color="red" icon={<FireOutlined />}>热卖</Tag>}
            {product.isNew && <Tag color="blue" icon={<GiftOutlined />}>新品</Tag>}
            {product.isLimited && <Tag color="gold">限量</Tag>}
          </div>
          {/* 销量 */}
          {showSales && product.salesCount > 0 && (
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5">
              <ShoppingCartOutlined className="mr-1" />已售 {product.salesCount}
            </div>
          )}
        </div>
      }
      onClick={() => navigate(`/products/${product.id}`)}
      bodyStyle={{ padding: '12px 16px' }}
    >
      <h3 className="text-sm font-medium text-brand-text line-clamp-2 mb-2 min-h-[40px]">
        {product.name}
      </h3>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-brand-gold">¥{displayPrice.toLocaleString()}</span>
        <Tooltip title="查看详情">
          <EyeOutlined className="text-brand-muted hover:text-brand-gold cursor-pointer" />
        </Tooltip>
      </div>
      {product.materialType && (
        <div className="mt-1 text-xs text-brand-muted">
          {product.goldWeight ? `${product.goldWeight}g` : ''}
          {product.goldWeight && product.size ? ' · ' : ''}
          {product.size || ''}
        </div>
      )}
    </Card>
  );
};

export default ProductCard;
