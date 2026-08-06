import { useState } from 'react';
import { Image } from 'antd';
import { productPlaceholder } from '@/utils/placeholder';

interface ProductImageProps {
  src?: string;
  alt?: string;
  productId?: number;
  productName?: string;
  className?: string;
  width?: number;
  height?: number;
  preview?: boolean;
  style?: React.CSSProperties;
}

export default function SafeImage({
  src, alt = '', productId = 0, productName = '',
  className = '', width, height, preview = true, style,
}: ProductImageProps) {
  const [error, setError] = useState(false);
  const fallback = productPlaceholder(productId, productName || alt);

  if (!src || error) {
    return (
      <img src={fallback} alt={alt} className={className}
        style={{ width, height, objectFit: 'cover', ...style }} />
    );
  }

  return preview ? (
    <Image src={src} alt={alt} className={className}
      style={{ width, height, objectFit: 'cover', ...style }}
      fallback={fallback}
      preview={{ mask: '点击放大' }}
      onError={() => setError(true)} />
  ) : (
    <img src={src} alt={alt} className={className}
      style={{ width, height, objectFit: 'cover', ...style }}
      onError={() => setError(true)} />
  );
}
