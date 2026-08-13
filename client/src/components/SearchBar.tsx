import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import { ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Spinner';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}

interface SearchBarProps {
  onSelect: (lat: number, lng: number) => void;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export function SearchBar({ onSelect }: SearchBarProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&accept-language=${i18n.language}&q=${encodeURIComponent(query.trim())}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new ApiError(res.status, t('search.error'));
        const data = (await res.json()) as NominatimResult[];
        setResults(data);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setResults([]);
        toast(t('errors.noConnection'), 'error');
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, toast, t, i18n]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const select = useCallback(
    (r: NominatimResult) => {
      setQuery('');
      setResults([]);
      setOpen(false);
      onSelect(Number(r.lat), Number(r.lon));
    },
    [onSelect],
  );

  return (
    <div ref={containerRef} className="pointer-events-auto relative w-full max-w-md">
      <div className="glass flex items-center gap-2 rounded-2xl px-3.5">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t('search.placeholder')}
          className="h-11 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        {loading ? (
          <Spinner className="h-4 w-4 border-slate-300 border-t-slate-600" />
        ) : (
          query && (
            <button
              onClick={() => {
                setQuery('');
                setOpen(false);
              }}
              aria-label={t('search.clear')}
              className="grid h-6 w-6 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl"
          >
            {results.map((r, i) => (
              <li key={`${r.lat}-${r.lon}-${i}`}>
                <button
                  onClick={() => select(r)}
                  className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                >
                  <FontAwesomeIcon icon={faLocationDot} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
