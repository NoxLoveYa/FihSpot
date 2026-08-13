import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark, faBullseye } from '@fortawesome/free-solid-svg-icons';
import type { LatLng } from '../lib/googleMaps';
import type { Bounds, PoISummary, Search } from '../api/types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { scanForWater, haversineKm } from '../lib/waterScan';
import { GoogleMapView } from '../components/GoogleMapView';
import type { MapType } from '../components/MapTypeToggle';
import { PoiDrawer } from '../components/PoiDrawer';
import { AddPoiPanel } from '../components/AddPoiPanel';
import { SearchBar } from '../components/SearchBar';
import { UserLocationButton } from '../components/UserLocationButton';
import { SearchPanel } from '../components/SearchPanel';
import { SavedSearchesPanel } from '../components/SavedSearchesPanel';
import { Navbar } from '../components/Navbar';
import { FullScreenLoader, Spinner } from '../components/Spinner';
import { getPreviousPath } from '../navigation';

function zoomForRadius(radiusKm: number): number {
  return Math.max(8, Math.min(16, Math.round(14 - Math.log2(radiusKm))));
}

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

  // Spot search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchArea, setSearchArea] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const [searchPois, setSearchPois] = useState<PoISummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<Search[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Pond scan state
  const [candidates, setCandidates] = useState<LatLng[]>([]);
  const [scanning, setScanning] = useState(false);
  const lastScanRef = useRef<string | null>(null);

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

  const runSearch = useCallback(
    async (area: { lat: number; lng: number; radiusKm: number }) => {
      setSearchLoading(true);
      try {
        const { pois } = await api.listPois(undefined, { near: area, lastComment: true });
        setSearchPois(pois);
      } catch (e) {
        toast(t('search.loadError'), 'error');
        setSearchPois([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [toast, t],
  );

  useEffect(() => {
    if (searchArea) {
      runSearch(searchArea);
    }
  }, [searchArea, runSearch]);

  const clearSearch = useCallback(() => {
    setSearchArea(null);
    setSearchPois([]);
    setActiveSearchId(null);
    setCandidates([]);
    lastScanRef.current = null;
  }, []);

  const runScan = useCallback(
    async (area: { lat: number; lng: number; radiusKm: number }) => {
      if (!mapRef.current) return;
      setScanning(true);
      try {
        const found = await scanForWater(area);
        const pois = searchPois.map((p) => ({ lat: p.lat, lng: p.lng }));
        const filtered = found.filter((c) => !pois.some((p) => haversineKm(p, c) < 0.08));
        setCandidates(filtered);
      } catch (e) {
        console.error('pond scan failed', e);
        toast(t('scan.error'), 'error');
        setCandidates([]);
      } finally {
        setScanning(false);
      }
    },
    [searchPois, toast, t],
  );

  useEffect(() => {
    if (!searchArea) return;
    const key = `${searchArea.lat.toFixed(4)},${searchArea.lng.toFixed(4)},${searchArea.radiusKm}`;
    if (lastScanRef.current === key) return;
    lastScanRef.current = key;
    runScan(searchArea);
  }, [searchArea, runScan]);

  const handlePick = useCallback(
    (latlng: LatLng) => {
      if (searchMode) {
        setSelectedId(null);
        setDraftPosition(null);
        setSearchPosition(null);
        setActiveSearchId(null);
        setSearchArea({ lat: latlng.lat, lng: latlng.lng, radiusKm: 5 });
        return;
      }
      setDraftPosition(latlng);
      setSelectedId(null);
      setSearchPosition(null);
    },
    [searchMode],
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

  const loadSavedSearches = useCallback(async () => {
    setSavedLoading(true);
    try {
      const { searches } = await api.listSearches();
      setSavedSearches(searches);
    } catch (e) {
      toast(t('saved.loadError'), 'error');
    } finally {
      setSavedLoading(false);
    }
  }, [toast, t]);

  const handleOpenSaved = useCallback(
    async (search: Search) => {
      setSavedOpen(false);
      setSearchMode(true);
      setSelectedId(null);
      setDraftPosition(null);
      setSearchPosition(null);
      setActiveSearchId(search.id);
      setCandidates([]);
      lastScanRef.current = null;
      setSearchArea({ lat: search.lat, lng: search.lng, radiusKm: search.radiusKm });
      mapRef.current?.panTo({ lat: search.lat, lng: search.lng });
      mapRef.current?.setZoom(zoomForRadius(search.radiusKm));
      setSearchLoading(true);
      try {
        const detail = await api.getSearch(search.id);
        setSearchPois(detail.pois);
      } catch (e) {
        toast(t('search.loadError'), 'error');
        setSearchPois([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [toast, t],
  );

  const handleDeleteSaved = useCallback(
    async (id: string) => {
      try {
        await api.deleteSearch(id);
        setSavedSearches((prev) => prev.filter((s) => s.id !== id));
        if (activeSearchId === id) setActiveSearchId(null);
        toast(t('search.deleted'), 'success');
      } catch (e) {
        toast(t('saved.loadError'), 'error');
      }
    },
    [activeSearchId, toast, t],
  );

  const handleToggleSeen = useCallback((poiId: string, seen: boolean) => {
    setSearchPois((prev) => prev.map((p) => (p.id === poiId ? { ...p, seen } : p)));
    setPois((prev) => prev.map((p) => (p.id === poiId ? { ...p, seen } : p)));
  }, []);

  const handleRadiusChange = useCallback((radiusKm: number) => {
    setSearchArea((prev) => (prev ? { ...prev, radiusKm } : prev));
  }, []);

  const handleAddCandidate = useCallback((latlng: LatLng) => {
    setCandidates((prev) => prev.filter((c) => haversineKm(c, latlng) > 0.005));
    setSelectedId(null);
    setSearchPosition(null);
    setDraftPosition({ lat: latlng.lat, lng: latlng.lng });
  }, []);

  if (loading) return <FullScreenLoader />;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Navbar
        mapType={mapType}
        onMapTypeChange={setMapType}
        search={!selectedId ? <SearchBar onSelect={handleSearchSelect} /> : undefined}
      />
      <GoogleMapView
        pois={searchArea ? searchPois : pois}
        selectedId={selectedId}
        mapType={mapType}
        draftPosition={draftPosition}
        userPosition={userPosition}
        searchPosition={searchPosition}
        searchArea={searchArea}
        candidates={candidates}
        onMapReady={handleMapReady}
        onBoundsChange={loadBounds}
        onSelect={(id) => {
          setSelectedId(id);
          setDraftPosition(null);
          setSearchPosition(null);
        }}
        onPick={handlePick}
      />

      {initialLoading && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
          <div className="glass rounded-xl px-4 py-2 text-sm font-medium text-slate-500">
            {t('map.loading')}
          </div>
        </div>
      )}

      {searchMode && !searchArea && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[1150] flex justify-center">
          <div className="glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-200">
            <FontAwesomeIcon icon={faBullseye} className="h-4 w-4 text-brand-500" />
            {t('search.tapMap')}
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

      <SearchPanel
        position={searchArea}
        pois={searchPois}
        loading={searchLoading}
        activeSearchId={activeSearchId}
        candidates={candidates}
        scanning={scanning}
        onScan={runScan}
        onAddCandidate={handleAddCandidate}
        onRadiusChange={handleRadiusChange}
        onClose={clearSearch}
        onSelect={(id) => setSelectedId(id)}
        onToggleSeen={handleToggleSeen}
        onSaved={(search) => {
          setActiveSearchId(search.id);
          loadSavedSearches();
        }}
        onDeleted={clearSearch}
        onRenamed={loadSavedSearches}
      />

      <SavedSearchesPanel
        open={savedOpen}
        searches={savedSearches}
        loading={savedLoading}
        onClose={() => setSavedOpen(false)}
        onOpen={handleOpenSaved}
        onDelete={handleDeleteSaved}
      />

      {!selectedId && (
        <>
          <button
            onClick={() => setSavedOpen((v) => !v)}
            aria-label={t('saved.title')}
            title={t('saved.title')}
            className={`fixed bottom-24 left-4 z-[1500] grid h-12 w-12 place-items-center rounded-full text-lg transition-all hover:brightness-105 active:scale-95 ${
              savedOpen ? 'bg-brand-600 text-white shadow-float' : 'glass text-slate-600 dark:text-slate-200'
            }`}
          >
            <FontAwesomeIcon icon={faBookmark} />
          </button>
          <button
            onClick={() => {
              if (searchMode) clearSearch();
              setSearchMode((v) => !v);
            }}
            aria-label={t('search.toggle')}
            title={t('search.toggle')}
            className={`fixed bottom-40 left-4 z-[1500] grid h-12 w-12 place-items-center rounded-full text-lg transition-all hover:brightness-105 active:scale-95 ${
              searchMode ? 'bg-brand-600 text-white shadow-float' : 'glass text-slate-600 dark:text-slate-200'
            }`}
          >
            <FontAwesomeIcon icon={faBullseye} />
          </button>
          <UserLocationButton
            map={mapRef.current}
            onLocate={handleLocate}
            locating={locating}
            onLocatingChange={setLocating}
          />
        </>
      )}

      {locating && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center">
          <div className="glass flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-200">
            <Spinner className="h-4 w-4 border-slate-300 border-t-brand-600" />
            {t('locate.locating')}
          </div>
        </div>
      )}
    </div>
  );
}
