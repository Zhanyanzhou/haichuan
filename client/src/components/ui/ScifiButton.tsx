import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface LuxuryButtonProps {
  children: ReactNode;
  variant?: 'gold' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  htmlType?: 'button' | 'submit';
  loading?: boolean;
}

export default function ScifiButton({
  children, variant = 'gold', size = 'md', className = '',
  onClick, disabled, htmlType = 'button', loading,
}: LuxuryButtonProps) {
  const sizeMap = { sm: 'px-5 py-2 text-xs', md: 'px-7 py-2.5 text-sm', lg: 'px-9 py-3.5 text-sm' };
  const base = variant === 'gold' ? 'btn-gold' : 'btn-outline';

  return (
    <motion.button
      type={htmlType}
      className={`${base} ${sizeMap[size]} ${className} ${disabled || loading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
      onClick={onClick} disabled={disabled || loading}
      whileHover={!disabled && !loading ? { scale: 1.02 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.98 } : undefined}
    >
      {loading && (
        <img className="-ml-1 mr-2" src="/favicon.svg?v=20261027c" alt="" width="16" height="16" />
      )}
      {children}
    </motion.button>
  );
}
