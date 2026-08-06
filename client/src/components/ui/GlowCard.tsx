import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface LuxuryCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'gold';
  onClick?: () => void;
  hover?: boolean;
}

export default function GlowCard({
  children, className = '', variant = 'default', onClick, hover = true,
}: LuxuryCardProps) {
  return (
    <motion.div
      className={`${variant === 'gold' ? 'luxury-card-gold' : 'luxury-card'} ${className}`}
      whileHover={hover ? { y: -3, transition: { duration: 0.4 } } : undefined}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
