import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faCirclePlus,
  faComment,
  faDroplet,
  faEye,
  faEyeSlash,
  faFish,
  faLocationDot,
  faMinus,
  faWater,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { PoISummary } from '../api/types';
import type { LatLng } from '../lib/googleMaps';
import type { DetectedWater, ScanSensitivity } from '../lib/waterScan';
import { SCAN_SENSITIVITIES, SCAN_WATER_COLOR, haversineKm } from '../lib/waterScan';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Skeleton, Spinner } from './Spinner';

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

interface SearchPanelProps {
  position: { lat: number; lng: number } | null;
  pois: PoISummary[];
  loading: boolean;
  minimized: boolean;
  candidates: DetectedWater[];
  scanning: boolean;
  cachedCount?: number;
  previewUrl: string | null;
  previewSize: { width: number; height: number } | null;
  sensitivity: ScanSensitivity;
  onSensitivityChange: (sensitivity: ScanSensitivity) => void;
  onAddCandidate: (latlng: LatLng) => void;
  onCenter: (latlng: LatLng) => void;
  onClose: () => void;
  onMinimize: () => void;
  onSelect: (id: string) => void;
  onToggleSeen: (poiId: string, seen: boolean) => void;
}

export function SearchPanel({
  position,
  pois,
  loading,
  minimized,
  candidates,
  scanning,
  cachedCount,
  previewUrl,
  previewSize,
  sensitivity,
  onSensitivityChange,
  onAddCandidate,
  onCenter,
  onClose,
  onMinimize,
  onSelect,
  onToggleSeen,
}: SearchPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [minCardHeight, setMinCardHeight] = useState(0);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done'>('idle');

  useEffect(() => {
    if (scanning) {
      setScanState('scanning');
    } else if (scanState === 'scanning') {
      setScanState('done');
    }
  }, [scanning, scanState]);

  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul || loading) return;
    const measure = () => {
      const items = Array.from(ul.children) as HTMLElement[];
      if (!items.length) return;
      const tallest = Math.max(...items.map((el) => el.offsetHeight));
      if (tallest > 0 && tallest !== minCardHeight) setMinCardHeight(tallest);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [pois, loading, minCardHeight]);

  async function toggleSeen(poi: PoISummary) {
    setTogglingId(poi.id);
    try {
      const target = !poi.seen;
      if (target) await api.markSeen(poi.id);
      else await api.unmarkSeen(poi.id);
      onToggleSeen(poi.id, target);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('search.genericError'), 'error');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <AnimatePresence>
      {position && !minimized && (
        <motion.aside
          initial={isDesktop ? { x: '100%' } : { y: '100%' }}
          animate={isDesktop ? { x: 0 } : { y: 0 }}
          exit={isDesktop ? { x: '100%' } : { y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className={`glass-strong fixed z-[1350] flex flex-col overflow-hidden rounded-t-3xl md:bottom-0 md:left-auto md:top-0 md:h-full md:rounded-none md:rounded-l-3xl ${
            isDesktop ? 'right-0 w-[420px]' : 'inset-x-0 bottom-0 h-[62dvh]'
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <FontAwesomeIcon icon={faFish} className="h-4 w-4 text-brand-500" />
                {t('search.title')}
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                <FontAwesomeIcon icon={faLocationDot} className="h-3 w-3" />
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onMinimize}
                aria-label={t('search.minimize')}
                title={t('search.minimize')}
                className="glass grid h-9 w-9 place-items-center rounded-full text-slate-500 transition-colors hover:brightness-105 dark:text-slate-300"
              >
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <button
                onClick={onClose}
                aria-label={t('search.close')}
                className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:brightness-105 dark:text-slate-300"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 safe-bottom">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('scan.size')}
              </p>
              <div className="flex flex-wrap gap-2">
                {SCAN_SENSITIVITIES.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSensitivityChange(s)}
                    className={`min-h-[36px] rounded-full px-4 text-sm font-semibold transition-colors ${
                      sensitivity === s
                        ? 'bg-brand-600 text-white shadow-float'
                        : 'glass text-slate-600 hover:brightness-105 dark:text-slate-200'
                    }`}
                  >
                    {t(`scan.size.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            {(scanning || previewUrl) && (
              <div className="space-y-2">
                <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                      {previewSize &&
                        candidates.map((c, i) => (
                          <span
                            key={`${c.px}-${c.py}-${i}`}
                            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-500 shadow-md"
                            style={{
                              left: `${(c.px / previewSize.width) * 100}%`,
                              top: `${(c.py / previewSize.height) * 100}%`,
                            }}
                          />
                        ))}
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-slate-800">
                      <Spinner className="h-5 w-5 border-slate-300 border-t-teal-600" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="truncate">{t('scan.preview')}</span>
                  <span
                    className="flex shrink-0 items-center gap-1.5"
                    title={`rgb(${SCAN_WATER_COLOR.r}, ${SCAN_WATER_COLOR.g}, ${SCAN_WATER_COLOR.b})`}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                      style={{ background: SCAN_WATER_COLOR.hex }}
                    />
                    {SCAN_WATER_COLOR.hex}
                  </span>
                </div>
                {cachedCount && cachedCount > 0 && !scanning && (
                  <p className="text-[11px] text-slate-400">
                    <FontAwesomeIcon icon={faDroplet} className="mr-1 h-3 w-3 text-emerald-500" />
                    {t('scan.cached', { count: cachedCount })}
                  </p>
                )}
              </div>
            )}

            {scanState === 'done' && candidates.length === 0 && !scanning && (
              <p className="glass flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-center text-xs text-slate-400">
                <FontAwesomeIcon icon={faWater} className="h-3.5 w-3.5" />
                {t('scan.noPonds')}
              </p>
            )}

            {candidates.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <FontAwesomeIcon icon={faDroplet} className="h-3 w-3 text-teal-500" />
                  {t('scan.candidates', { count: candidates.length })}
                </p>
                <ul className="flex flex-col gap-2">
                  {candidates.map((c) => (
                    <li
                      key={`${c.lat.toFixed(6)}-${c.lng.toFixed(6)}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onCenter(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCenter(c);
                        }
                      }}
                      title={t('scan.center')}
                      className="glass-strong flex cursor-pointer items-center gap-3 rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-300">
                        <FontAwesomeIcon icon={faWater} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('scan.spot')}</p>
                        <p className="text-[11px] text-slate-400">
                          {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                          {position && ` · ${formatDistance(haversineKm({ lat: position.lat, lng: position.lng }, c))}`}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddCandidate(c);
                        }}
                        aria-label={t('scan.add')}
                        title={t('scan.add')}
                        className="icon-btn grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-700 transition-all hover:scale-105 hover:brightness-110 active:scale-95 dark:text-brand-200"
                      >
                        <FontAwesomeIcon icon={faCirclePlus} className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('search.results', { count: pois.length })}
              </p>
              {loading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="glass-strong overflow-hidden rounded-2xl p-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="mt-2 h-3 w-full" />
                      <Skeleton className="mt-2 h-3 w-4/5" />
                    </div>
                  ))}
                </div>
              ) : pois.length === 0 ? (
                <p className="glass rounded-2xl px-4 py-6 text-center text-sm text-slate-400">
                  {t('search.noResults')}
                </p>
              ) : (
                <ul ref={listRef} className="flex flex-col gap-3">
                  {pois.map((poi) => (
                    <li
                      key={poi.id}
                      style={minCardHeight ? { minHeight: minCardHeight } : undefined}
                      className={`group glass-strong relative overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-soft ${
                        poi.seen ? 'opacity-80' : ''
                      }`}
                    >
                      <button onClick={() => onSelect(poi.id)} className="block h-full w-full p-3 text-left">
                        <div className="flex h-full items-start gap-3">
                          <span
                            className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                              poi.seen ? 'bg-slate-200 text-slate-400 dark:bg-slate-700' : 'bg-brand-500/15 text-brand-600 dark:text-brand-300'
                            }`}
                          >
                            <FontAwesomeIcon icon={faFish} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                                {poi.name}
                              </h3>
                              <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-200">
                                {poi.distanceKm !== undefined ? formatDistance(poi.distanceKm) : ''}
                              </span>
                            </div>
                            {poi.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                {poi.description}
                              </p>
                            )}
                            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                              <span className="flex items-center gap-1">
                                <FontAwesomeIcon icon={faComment} className="h-3 w-3" />
                                {poi._count.comments}
                              </span>
                              <span className="flex items-center gap-1">
                                <FontAwesomeIcon icon={faCamera} className="h-3 w-3" />
                                {poi._count.photos}
                              </span>
                              {poi.seen && <span className="font-semibold text-emerald-500">{t('search.seen')}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => toggleSeen(poi)}
                        disabled={togglingId === poi.id}
                        aria-label={poi.seen ? t('search.unmarkSeen') : t('search.markSeen')}
                        title={poi.seen ? t('search.unmarkSeen') : t('search.markSeen')}
                        className={`absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full text-sm transition-colors ${
                          poi.seen
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                            : 'bg-slate-200/70 text-slate-400 hover:text-brand-600 dark:bg-slate-700 dark:hover:text-brand-300'
                        }`}
                      >
                        {togglingId === poi.id ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : poi.seen ? (
                          <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
                        ) : (
                          <FontAwesomeIcon icon={faEyeSlash} className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
