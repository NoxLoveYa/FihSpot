import { useCallback, useRef, useState } from 'react';
import type { LatLng } from '../lib/googleMaps';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationCrosshairs, faTowerBroadcast } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Spinner';

const LONG_PRESS_MS = 400;

interface UserLocationButtonProps {
  map: google.maps.Map | null;
  onLocate: (position: LatLng) => void;
  userPosition: LatLng | null;
  locating: boolean;
  onLocatingChange: (locating: boolean) => void;
  highAccuracy: boolean;
  onToggleAccuracy: () => void;
}

export function UserLocationButton({
  map,
  onLocate,
  userPosition,
  locating,
  onLocatingChange,
  highAccuracy,
  onToggleAccuracy,
}: UserLocationButtonProps) {
  const { t } = useTranslation();
  const locatingRef = useRef(false);
  const { toast } = useToast();
  // The accuracy toggle is hidden by default: hold the locate button to reveal
  // it, tap it to switch accuracy (it hides), or hold the locate button again.
  const [showAccuracy, setShowAccuracy] = useState(false);
  const pressTimerRef = useRef<number | null>(null);
  const longPressRef = useRef(false);

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const runLocate = useCallback(() => {
    // The position is already tracked in real time: just center on it.
    if (userPosition) {
      map?.panTo(userPosition);
      map?.setZoom(16);
      return;
    }
    // No tracked fix yet — fall back to a one-time geolocation request.
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
      { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 0 },
    );
  }, [map, userPosition, onLocate, highAccuracy, toast, t, onLocatingChange]);

  const handlePointerDown = useCallback(() => {
    longPressRef.current = false;
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      longPressRef.current = true;
      setShowAccuracy((v) => !v);
    }, LONG_PRESS_MS);
  }, [clearPressTimer]);

  const handleRelease = useCallback(() => {
    clearPressTimer();
  }, [clearPressTimer]);

  const handleLocateClick = useCallback(() => {
    // The previous press was a long-press (reveal/hide the accuracy toggle),
    // so don't also trigger the locate action.
    if (longPressRef.current) {
      longPressRef.current = false;
      return;
    }
    setShowAccuracy(false);
    runLocate();
  }, [runLocate]);

  const handleToggleAccuracy = useCallback(() => {
    onToggleAccuracy();
    setShowAccuracy(false);
  }, [onToggleAccuracy]);

  return (
    <>
      {showAccuracy && (
        <button
          onClick={handleToggleAccuracy}
          aria-label={t(highAccuracy ? 'locate.accuracyHigh' : 'locate.accuracyBalanced')}
          title={t(highAccuracy ? 'locate.accuracyHigh' : 'locate.accuracyBalanced')}
          aria-pressed={highAccuracy}
          className={`glass fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-[1500] flex h-10 select-none items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all hover:brightness-105 active:scale-95 ${
            highAccuracy ? 'text-brand-700 dark:text-brand-200' : 'text-slate-500 dark:text-slate-300'
          }`}
        >
          <FontAwesomeIcon
            icon={highAccuracy ? faLocationCrosshairs : faTowerBroadcast}
            className={highAccuracy ? 'h-3.5 w-3.5 text-brand-500' : 'h-3.5 w-3.5 text-slate-400'}
          />
          {highAccuracy ? t('locate.accuracyHigh') : t('locate.accuracyBalanced')}
        </button>
      )}

      <button
        onClick={handleLocateClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onPointerLeave={handleRelease}
        aria-label={t('locate.me')}
        title={t('locate.me')}
        className="glass fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[1500] grid h-12 w-12 select-none place-items-center rounded-full text-lg transition-all hover:brightness-105 active:scale-95"
      >
        {locating ? <Spinner className="h-5 w-5 border-slate-300 border-t-slate-600" /> : <FontAwesomeIcon icon={faLocationCrosshairs} />}
      </button>
    </>
  );
}
