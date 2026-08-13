import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookmark,
  faLocationDot,
  faPlay,
  faTrashCan,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Search } from '../api/types';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Skeleton } from './Spinner';
import i18n from '../i18n';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface SavedSearchesPanelProps {
  open: boolean;
  searches: Search[];
  loading: boolean;
  onClose: () => void;
  onOpen: (search: Search) => void;
  onDelete: (id: string) => void;
}

export function SavedSearchesPanel({
  open,
  searches,
  loading,
  onClose,
  onOpen,
  onDelete,
}: SavedSearchesPanelProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1350] bg-black/40"
          />
          <motion.aside
            initial={isDesktop ? { x: '100%' } : { y: '100%' }}
            animate={isDesktop ? { x: 0 } : { y: 0 }}
            exit={isDesktop ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={`glass-strong fixed z-[1400] flex flex-col overflow-hidden rounded-t-3xl md:bottom-0 md:left-auto md:top-0 md:h-full md:rounded-none md:rounded-l-3xl ${
              isDesktop ? 'right-0 w-[420px]' : 'inset-x-0 bottom-0 h-[70dvh]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <FontAwesomeIcon icon={faBookmark} className="h-4 w-4 text-brand-500" />
                {t('saved.title')}
              </h2>
              <button
                onClick={onClose}
                aria-label={t('search.close')}
                className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:brightness-105 dark:text-slate-300"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 safe-bottom">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="glass-strong rounded-2xl p-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="mt-2 h-3 w-2/3" />
                  </div>
                ))
              ) : searches.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <FontAwesomeIcon icon={faBookmark} className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('saved.empty')}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{t('saved.emptyHint')}</p>
                </div>
              ) : (
                searches.map((search) => (
                  <div key={search.id} className="glass-strong flex items-start justify-between gap-3 rounded-2xl p-4">
                    <button onClick={() => onOpen(search)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{search.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                        <FontAwesomeIcon icon={faLocationDot} className="h-3 w-3" />
                        {search.lat.toFixed(4)}, {search.lng.toFixed(4)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDate(search.updatedAt)}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => onOpen(search)}
                        aria-label={t('saved.open')}
                        title={t('saved.open')}
                        className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700"
                      >
                        <FontAwesomeIcon icon={faPlay} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(search.id)}
                        aria-label={t('saved.delete')}
                        title={t('saved.delete')}
                        className="glass grid h-9 w-9 place-items-center rounded-full text-rose-500 transition-colors hover:brightness-105"
                      >
                        <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
