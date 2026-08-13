import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng, Map } from 'leaflet';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { latLng } from 'leaflet';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import type { Bounds, PoISummary } from '../api/types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MapView } from '../components/MapView';
import { PoiDrawer } from '../components/PoiDrawer';
import { AddPoiPanel } from '../components/AddPoiPanel';
import { SearchBar } from '../components/SearchBar';
import { UserLocationButton } from '../components/UserLocationButton';
import { Navbar } from '../components/Navbar';
import { FullScreenLoader, Spinner } from '../components/Spinner';
import { getPreviousPath } from '../navigation';

export function MapPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapRef = useRef<Map | null>(null);
  const [pois, setPois] = useState<PoISummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftPosition, setDraftPosition] = useState<LatLng | null>(null);
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [searchPosition, setSearchPosition] = useState<LatLng | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [shouldAutoLocate] = useState(() => {
    const prev = getPreviousPath();
    return prev === null || prev === '/login' || prev === '/register' || prev === '/profile';
  });

  useEffect(() => {
    const poiId = searchParams.get('poi');
    if (poiId) {
      setSelectedId(poiId);
      setPendingFocus(poiId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadBounds = useCallback(
    async (bounds: Bounds) => {
      try {
        const { pois } = await api.listPois(bounds);
        setPois(pois);
      } catch (e) {
        toast(t('map.loadError'), 'error');
      } finally {
        setInitialLoading(false);
      }
    },
    [toast, t],
  );

  useEffect(() => {
    loadBounds({ swLat: -90, swLng: -180, neLat: 90, neLng: 180 });
  }, [loadBounds]);

  const refresh = useCallback(() => {
    setSelectedId(null);
    setPois([]);
    loadBounds({ swLat: -90, swLng: -180, neLat: 90, neLng: 180 });
  }, [loadBounds]);

  const reload = useCallback(() => {
    loadBounds({ swLat: -90, swLng: -180, neLat: 90, neLng: 180 });
  }, [loadBounds]);

  const handlePick = useCallback(
    (latlng: LatLng) => {
      setDraftPosition(latlng);
      setSelectedId(null);
      setSearchPosition(null);
    },
    [],
  );

  const handleSearchSelect = useCallback((lat: number, lng: number) => {
    setSelectedId(null);
    setAdding(false);
    setDraftPosition(null);
    setSearchPosition(latLng(lat, lng));
    mapRef.current?.flyTo([lat, lng], 12, { duration: 0.8 });
  }, []);

  const handleLocate = useCallback((position: LatLng) => {
    setUserPosition(position);
  }, []);

  const handleMapReady = useCallback(
    (map: Map) => {
      mapRef.current = map;
      if (pendingFocus) {
        api
          .getPoi(pendingFocus)
          .then(({ poi }) => map.flyTo([poi.lat, poi.lng], 15, { duration: 0.6 }))
          .catch(() => {});
        setPendingFocus(null);
      } else if (shouldAutoLocate) {
        setLocating(true);
        map.locate({ setView: true, maxZoom: 16 });
        map.once('locationfound', (e) => {
          setLocating(false);
          setUserPosition(e.latlng);
        });
        map.once('locationerror', () => {
          setLocating(false);
          toast(t('locate.error'), 'error');
        });
      }
    },
    [pendingFocus, shouldAutoLocate, toast, t],
  );

  if (loading) return <FullScreenLoader />;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Navbar />
      <MapView
        pois={pois}
        selectedId={selectedId}
        adding={adding}
        draftPosition={adding ? draftPosition : null}
        userPosition={userPosition}
        searchPosition={searchPosition}
        onMapReady={handleMapReady}
        onBoundsChange={loadBounds}
        onSelect={(id) => {
          setSelectedId(id);
          setDraftPosition(null);
          setAdding(false);
          setSearchPosition(null);
        }}
        onPick={handlePick}
      />

      {!selectedId && <SearchBar onSelect={handleSearchSelect} />}

      {initialLoading && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
          <div className="rounded-xl bg-white/90 px-4 py-2 text-sm font-medium text-slate-500 shadow-soft backdrop-blur">
            {t('map.loading')}
          </div>
        </div>
      )}

      <PoiDrawer
        poiId={selectedId}
        onClose={() => setSelectedId(null)}
        onPoiChanged={reload}
      />

      <AddPoiPanel
        key={draftPosition ? `${draftPosition.lat}-${draftPosition.lng}` : 'none'}
        position={draftPosition as LatLng}
        onCancel={() => {
          setDraftPosition(null);
          setAdding(false);
        }}
        onCreated={() => {
          setDraftPosition(null);
          setAdding(false);
          refresh();
        }}
      />

      {!selectedId && (
        <UserLocationButton
          map={mapRef.current}
          onLocate={handleLocate}
          locating={locating}
          onLocatingChange={setLocating}
        />
      )}

      {locating && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-600 shadow-soft backdrop-blur dark:bg-slate-800/90 dark:text-slate-200">
            <Spinner className="h-4 w-4 border-slate-300 border-t-brand-600" />
            {t('locate.locating')}
          </div>
        </div>
      )}

      {user && !selectedId && (
        <button
          onClick={() => {
            setAdding((a) => !a);
            setDraftPosition(null);
            setSelectedId(null);
          }}
          aria-label={adding ? t('map.cancelAdd') : t('map.addPoi')}
          className="fixed bottom-6 right-4 z-[1500] grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-2xl text-white shadow-float transition-all hover:bg-brand-700 active:scale-95"
        >
          <motion.span
            animate={{ rotate: adding ? 45 : 0 }}
            transition={{ duration: 0.2 }}
            className="block"
          >
            <FontAwesomeIcon icon={faPlus} className="h-6 w-6" />
          </motion.span>
        </button>
      )}
    </div>
  );
}
