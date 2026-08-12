import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`}
    />
  );
}

export function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface dark:bg-surface-dark">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3"
      >
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
        <span className="text-sm font-medium text-slate-400">{t('loading.full')}</span>
      </motion.div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700 ${className}`} />;
}
