import { useCallback, useRef, useState } from 'react';
import type { LatLng, Map } from 'leaflet';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Spinner';

interface UserLocationButtonProps {
  map: Map | null;
  onLocate: (position: LatLng) => void;
}

export function UserLocationButton({ map, onLocate }: UserLocationButtonProps) {
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const { toast } = useToast();

  const handleClick = useCallback(() => {
    if (!map || locatingRef.current) return;
    locatingRef.current = true;
    setLocating(true);

    map.locate({ setView: true, maxZoom: 16 });
    map.once('locationfound', (e) => {
      locatingRef.current = false;
      setLocating(false);
      onLocate(e.latlng);
    });
    map.once('locationerror', () => {
      locatingRef.current = false;
      setLocating(false);
      toast('Localisation indisponible', 'error');
    });
  }, [map, onLocate, toast]);

  return (
    <button
      onClick={handleClick}
      aria-label="Me localiser"
      title="Me localiser"
      className="fixed bottom-24 right-4 z-[1500] grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-lg shadow-float backdrop-blur-md transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      {locating ? <Spinner className="h-5 w-5 border-slate-300 border-t-slate-600" /> : '🎯'}
    </button>
  );
}
