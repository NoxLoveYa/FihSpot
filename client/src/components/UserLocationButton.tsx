import { useCallback, useRef } from 'react';
import type { LatLng, Map } from 'leaflet';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationCrosshairs } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Spinner';

interface UserLocationButtonProps {
  map: Map | null;
  onLocate: (position: LatLng) => void;
  locating: boolean;
  onLocatingChange: (locating: boolean) => void;
}

export function UserLocationButton({ map, onLocate, locating, onLocatingChange }: UserLocationButtonProps) {
  const { t } = useTranslation();
  const locatingRef = useRef(false);
  const { toast } = useToast();

  const handleClick = useCallback(() => {
    if (!map || locatingRef.current) return;
    locatingRef.current = true;
    onLocatingChange(true);

    map.locate({ setView: true, maxZoom: 16 });
    map.once('locationfound', (e) => {
      locatingRef.current = false;
      onLocatingChange(false);
      onLocate(e.latlng);
    });
    map.once('locationerror', () => {
      locatingRef.current = false;
      onLocatingChange(false);
      toast(t('locate.error'), 'error');
    });
  }, [map, onLocate, toast, t, onLocatingChange]);

  return (
    <button
      onClick={handleClick}
      aria-label={t('locate.me')}
      title={t('locate.me')}
      className="fixed bottom-24 right-4 z-[1500] grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-lg shadow-float backdrop-blur-md transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      {locating ? <Spinner className="h-5 w-5 border-slate-300 border-t-slate-600" /> : <FontAwesomeIcon icon={faLocationCrosshairs} />}
    </button>
  );
}
