import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'btn-glossy border-brand-500/40 text-brand-700 hover:brightness-105 dark:border-brand-400/40 dark:text-brand-200',
  secondary: 'btn-glossy text-slate-700 hover:brightness-105 dark:text-slate-100',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
  danger: 'btn-glossy border-rose-500/40 text-rose-600 hover:brightness-105 dark:border-rose-400/40 dark:text-rose-400',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...rest }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-60 ${variants[variant]} ${className}`}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}
