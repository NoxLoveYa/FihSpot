import { useCallback, useRef } from 'react';
import type { LatLng } from '../lib/googleMaps';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationCrosshairs } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Spinner';

interface UserLocationButtonProps {
  map: google.maps.Map | null;
  onLocate: (position: LatLng) => void;
  locating: boolean;
  onLocatingChange: (locating: boolean) => void;
}

export function UserLocationButton({ map, onLocate, locating, onLocatingChange }: UserLocationButtonProps) {
  const { t } = useTranslation();
  const locatingRef = useRef(false);
  const { toast } = useToast();

  const handleClick = useCallback(() => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    onLocatingChange(true);

    if (!navigator.geolocation) {
      locatingRef.current = false;
      onLocatingChange(false);
      toast(t('locate.error'), 'error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        locatingRef.current = false;
        onLocatingChange(false);
        map?.panTo(position);
        map?.setZoom(16);
        onLocate(position);
      },
      () => {
        locatingRef.current = false;
        onLocatingChange(false);
        toast(t('locate.error'), 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [map, onLocate, toast, t, onLocatingChange]);

  return (
    <button
      onClick={handleClick}
      aria-label={t('locate.me')}
      title={t('locate.me')}
      className="glass fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[1500] grid h-12 w-12 place-items-center rounded-full text-lg transition-all hover:brightness-105 active:scale-95"
    >
      {locating ? <Spinner className="h-5 w-5 border-slate-300 border-t-slate-600" /> : <FontAwesomeIcon icon={faLocationCrosshairs} />}
    </button>
  );
}
