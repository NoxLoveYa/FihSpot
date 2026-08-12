import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-float',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...rest }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60 ${variants[variant]} ${className}`}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}
