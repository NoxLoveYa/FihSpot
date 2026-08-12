import type { InputHTMLAttributes } from 'react';
import { motion } from 'framer-motion';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', ...rest }: Props) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <motion.div animate={error ? { x: [0, -8, 8, -4, 4, 0] } : {}} transition={{ duration: 0.35 }}>
        <input
          className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 ${
            error ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700'
          } ${className}`}
          {...rest}
        />
      </motion.div>
      {error && <span className="mt-1 block text-xs font-medium text-rose-500">{error}</span>}
    </label>
  );
}
