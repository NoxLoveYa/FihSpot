import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCamera,
  faComment,
  faExpand,
  faFish,
  faLocationDot,
  faMagnifyingGlass,
  faMapPin,
} from '@fortawesome/free-solid-svg-icons';
import type { PoISummary } from '../api/types';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { staticMapUrl } from '../lib/googleMaps';
import { PoiDrawer } from '../components/PoiDrawer';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';
import { Skeleton } from '../components/Spinner';
import i18n from '../i18n';

const FISH_COLOR = '#2563eb';

type Sort = 'newest' | 'commented';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

function PoisCard({ poi, onClick, onViewOnMap }: { poi: PoISummary; onClick: () => void; onViewOnMap: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastComment = poi.comments?.[0];
  const [imgError, setImgError] = useState(false);
  const mapUrl = staticMapUrl(poi.lat, poi.lng, '600x300');

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-3xl bg-white text-left shadow-soft transition-all hover:-translate-y-1 hover:shadow-float dark:bg-slate-800"
    >
      <div className="relative aspect-[2/1] w-full overflow-hidden">
        {mapUrl && !imgError ? (
          <img
            src={mapUrl}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${FISH_COLOR}22, ${FISH_COLOR}55)` }}
          >
            <FontAwesomeIcon icon={faFish} className="h-10 w-10 text-white/90" />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewOnMap();
          }}
          aria-label={t('poi.viewOnMap')}
          title={t('poi.viewOnMap')}
          className="absolute bottom-2 right-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow-soft backdrop-blur-md transition-all hover:scale-105 hover:bg-white active:scale-95 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <FontAwesomeIcon icon={faExpand} className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-base font-bold text-slate-800 dark:text-slate-100">{poi.name}</h3>
        {poi.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{poi.description}</p>
        ) : (
          <p className="text-sm italic text-slate-400 dark:text-slate-500">{t('pois.noDescription')}</p>
        )}

        {lastComment && (
          <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-700/40">
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/user/${lastComment.user.id}`);
                }}
                className="inline font-semibold hover:text-brand-600"
              >
                {lastComment.user.name}
              </button>
              {' : '}
              {lastComment.content}
            </p>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/user/${poi.createdBy.id}`);
            }}
            className="flex min-w-0 items-center gap-2"
          >
            {poi.createdBy.avatarUrl ? (
              <img src={poi.createdBy.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-900/60">
                {poi.createdBy.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-xs text-slate-400 hover:text-brand-600">{poi.createdBy.name}</span>
          </button>
          <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faComment} className="h-3 w-3" />
              {poi._count.comments}
            </span>
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faCamera} className="h-3 w-3" />
              {poi._count.photos}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-slate-300 dark:text-slate-500">{formatDate(poi.createdAt)}</span>
      </div>
    </div>
  );
}

export function PoisPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pois, setPois] = useState<PoISummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { pois } = await api.listPois(undefined, { lastComment: true });
      setPois(pois);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('pois.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q.length === 0 ? pois : pois.filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sort === 'commented') return b._count.comments - a._count.comments;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [pois, query, sort]);

  return (
    <div className="min-h-full overflow-y-auto bg-slate-50 dark:bg-slate-900">
      <div className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
            {t('pois.back')}
          </button>
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">{t('pois.title')}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200" />
            <LanguageToggle className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200" />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3.5 shadow-soft dark:border-slate-700 dark:bg-slate-900/60">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('pois.searchPlaceholder')}
              className="h-11 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end">
            <label className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-soft dark:bg-slate-800 dark:text-slate-300">
              <FontAwesomeIcon icon={faMapPin} className="h-3 w-3 text-brand-500" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="bg-transparent text-xs font-semibold outline-none dark:bg-slate-800"
                aria-label={t('pois.sort')}
              >
                <option value="newest">{t('pois.sort.newest')}</option>
                <option value="commented">{t('pois.sort.commented')}</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-3xl bg-white shadow-soft dark:bg-slate-800">
                <Skeleton className="h-36 w-full rounded-none" />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FontAwesomeIcon icon={faLocationDot} className="h-12 w-12 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('pois.noResults')}</p>
          </div>
        ) : (
          <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence>
              {filtered.map((poi) => (
                <motion.div
                  key={poi.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                >
                  <PoisCard
                    poi={poi}
                    onClick={() => setSelectedId(poi.id)}
                    onViewOnMap={() => navigate(`/?poi=${poi.id}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <PoiDrawer
        poiId={selectedId}
        onClose={() => setSelectedId(null)}
        onPoiChanged={load}
        onViewOnMap={() => {
          if (selectedId) {
            const id = selectedId;
            setSelectedId(null);
            navigate(`/?poi=${id}`);
          }
        }}
      />
    </div>
  );
}
