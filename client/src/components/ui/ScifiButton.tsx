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
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
