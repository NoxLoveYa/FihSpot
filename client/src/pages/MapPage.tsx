import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LatLng } from '../lib/googleMaps';
import type { Bounds, PoISummary } from '../api/types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { GoogleMapView } from '../components/GoogleMapView';
import type { MapType } from '../components/MapTypeToggle';
import { PoiDrawer } from '../components/PoiDrawer';
import { AddPoiPanel } from '../components/AddPoiPanel';
import { SearchBar } from '../components/SearchBar';
import { UserLocationButton } from '../components/UserLocationButton';
import { Navbar } from '../components/Navbar';
import { FullScreenLoader, Spinner } from '../components/Spinner';
import { getPreviousPath } from '../navigation';

export function MapPage() {
  const { t } = useTranslation();
  const { loading } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [pois, setPois] = useState<PoISummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPosition, setDraftPosition] = useState<LatLng | null>(null);
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [searchPosition, setSearchPosition] = useState<LatLng | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [mapType, setMapType] = useState<MapType>('roadmap');
  const autoLocatedRef = useRef(false);
  const pendingCenterRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const [shouldAutoLocate] = useState(() => {
    const prev = getPreviousPath();
    return prev === null || prev === '/login' || prev === '/register' || prev === '/profile' || prev === '/pois';
  });

  useEffect(() => {
    const poiId = searchParams.get('poi');
    if (poiId) {
      setSelectedId(poiId);
      setPendingFocus(poiId);
      setSearchParams({}, { replace: true });
      return;
    }
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    if (latParam && lngParam) {
      const lat = Number(latParam);
      const lng = Number(lngParam);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        pendingCenterRef.current = {
          lat,
          lng,
          zoom: Number(searchParams.get('zoom')) || 15,
        };
        setSearchParams({}, { replace: true });
      }
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
    setDraftPosition(null);
    setSearchPosition({ lat, lng });
    mapRef.current?.panTo({ lat, lng });
    mapRef.current?.setZoom(12);
  }, []);

  const handleLocate = useCallback((position: LatLng) => {
    setUserPosition(position);
  }, []);

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (pendingFocus) {
        api
          .getPoi(pendingFocus)
          .then(({ poi }) => {
            map.panTo({ lat: poi.lat, lng: poi.lng });
            map.setZoom(15);
          })
          .catch(() => {});
        setPendingFocus(null);
      } else if (pendingCenterRef.current) {
        const center = pendingCenterRef.current;
        pendingCenterRef.current = null;
        map.panTo({ lat: center.lat, lng: center.lng });
        map.setZoom(center.zoom);
      } else if (shouldAutoLocate && !autoLocatedRef.current) {
        autoLocatedRef.current = true;
        setLocating(true);
        if (!navigator.geolocation) {
          setLocating(false);
          toast(t('locate.error'), 'error');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLocating(false);
            setUserPosition(position);
            map.panTo(position);
            map.setZoom(16);
          },
          () => {
            setLocating(false);
            toast(t('locate.error'), 'error');
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
      }
    },
    [pendingFocus, shouldAutoLocate, toast, t],
  );

  if (loading) return <FullScreenLoader />;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Navbar mapType={mapType} onMapTypeChange={setMapType} />
      <GoogleMapView
        pois={pois}
        selectedId={selectedId}
        mapType={mapType}
        draftPosition={draftPosition}
        userPosition={userPosition}
        searchPosition={searchPosition}
        onMapReady={handleMapReady}
        onBoundsChange={loadBounds}
        onSelect={(id) => {
          setSelectedId(id);
          setDraftPosition(null);
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
        }}
        onCreated={() => {
          setDraftPosition(null);
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
    </div>
  );
}
