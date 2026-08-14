import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark, faBullseye, faFish } from '@fortawesome/free-solid-svg-icons';
import type { LatLng } from '../lib/googleMaps';
import type { Bounds, PoISummary, Search } from '../api/types';
import { api, getCachedPois, setCachedPois } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSearchSession } from '../context/SearchSessionContext';
import { scanForWater, haversineKm } from '../lib/waterScan';
import type { ScanSensitivity } from '../lib/waterScan';
import { SCAN_SENSITIVITIES } from '../lib/waterScan';
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
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getPreviousPath } from '../navigation';

export function MapPage() {
  const { t } = useTranslation();
  const { loading, canSearch } = useAuth();
  const { toast } = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');
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
  const initialLoadRef = useRef(true);
  const pendingCenterRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const [shouldAutoLocate] = useState(() => {
    const prev = getPreviousPath();
    return prev === null || prev === '/login' || prev === '/register' || prev === '/profile' || prev === '/pois';
  });

  // Spot search state — lifted into a session context so it survives SPA
  // navigation (resets on a full page refresh).
  const {
    searchMode,
    setSearchMode,
    searchArea,
    setSearchArea,
    activeSearchId,
    setActiveSearchId,
    candidates,
    setCandidates,
    searchPois,
    setSearchPois,
    savedOpen,
    setSavedOpen,
    minimized,
    setMinimized,
    previewUrl,
    previewSize,
    setPreview,
    clearSearch,
  } = useSearchSession();

  const [searchLoading, setSearchLoading] = useState(false);
  const [savedSearches, setSavedSearches] = useState<Search[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Pond scan state (transient)
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanCached, setScanCached] = useState(0);
  const lastScanRef = useRef<string | null>(null);
  const [sensitivity, setSensitivity] = useState<ScanSensitivity>(() => {
    const saved = localStorage.getItem('fihspot_scan_sensitivity') as ScanSensitivity | null;
    return saved && SCAN_SENSITIVITIES.includes(saved) ? saved : 'default';
  });

  useEffect(() => {
    localStorage.setItem('fihspot_scan_sensitivity', sensitivity);
  }, [sensitivity]);

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
      // Only the very first mount load can render from the cached POI list;
      // refresh()/reload() explicitly want fresh data.
      const isInitial = initialLoadRef.current;
      initialLoadRef.current = false;
      // The full-world list is the one cached: it's what the map renders on a
      // fresh launch, so relaunches show the points instantly and the fresh
      // list replaces them in the background.
      const isWorld = bounds.swLat <= -90 && bounds.swLng <= -180 && bounds.neLat >= 90 && bounds.neLng >= 180;
      try {
        if (isInitial && isWorld) {
          const cached = getCachedPois();
          if (cached) {
            setPois(cached);
            setInitialLoading(false);
          }
        }
        const { pois } = await api.listPois(bounds);
        setPois(pois);
        if (isWorld) setCachedPois(pois);
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

  // The search zone is the current map viewport: results are loaded for the
  // visible bounds, so panning/zooming live-updates the zone being searched.
  const loadSearchBounds = useCallback(async () => {
    const b = mapRef.current?.getBounds();
    if (!b) return;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    setSearchLoading(true);
    try {
      const { pois } = await api.listPois(
        { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() },
        { lastComment: true },
      );
      setSearchPois(pois);
    } catch (e) {
      toast(t('search.loadError'), 'error');
      setSearchPois([]);
    } finally {
      setSearchLoading(false);
    }
  }, [toast, t]);

  // When a saved search is opened the map first moves to its saved spot; the
  // bounds callback below picks up the new viewport once it settles, so skip
  // loading here with the stale pre-move bounds.
  const skipNextSearchLoadRef = useRef(false);

  useEffect(() => {
    if (!searchArea) return;
    if (skipNextSearchLoadRef.current) {
      skipNextSearchLoadRef.current = false;
      return;
    }
    void loadSearchBounds();
  }, [searchArea, loadSearchBounds]);

  const handleBoundsChange = useCallback(
    (bounds: Bounds) => {
      if (searchArea) {
        void loadSearchBounds();
      } else {
        loadBounds(bounds);
      }
    },
    [searchArea, loadBounds, loadSearchBounds],
  );

  const handleClearSearch = useCallback(() => {
    clearSearch();
    lastScanRef.current = null;
  }, [clearSearch]);

  // If search access is revoked (or the user logs out), drop any active search
  // session so the feature can't stay open.
  useEffect(() => {
    if (!canSearch && (searchMode || searchArea)) {
      handleClearSearch();
    }
  }, [canSearch, searchMode, searchArea, handleClearSearch]);

  const handleCloseDrawer = useCallback(() => setSelectedId(null), []);

  const runScan = useCallback(
    async (area: { lat: number; lng: number }) => {
      setScanning(true);
      setScanProgress(null);
      setScanCached(0);
      try {
        const { candidates: found, previewUrl, width, height, cachedCount } = await scanForWater(area, sensitivity, {
          onProgress: (done, total) => setScanProgress({ done, total }),
        });
        const pois = searchPois.map((p) => ({ lat: p.lat, lng: p.lng }));
        const filtered = found.filter((c) => !pois.some((p) => haversineKm(p, c) < 0.08));
        setPreview(previewUrl, { width, height });
        setCandidates(filtered);
        setScanCached(cachedCount);
      } catch (e) {
        console.error('pond scan failed', e);
        setPreview(null, null);
        setCandidates([]);
        toast(t('scan.error'), 'error');
      } finally {
        setScanning(false);
        setScanProgress(null);
      }
    },
    [sensitivity, searchPois, setPreview, toast, t],
  );

  useEffect(() => {
    if (!searchArea) return;
    const key = `${searchArea.lat.toFixed(4)},${searchArea.lng.toFixed(4)},${sensitivity}`;
    if (lastScanRef.current === key) return;
    lastScanRef.current = key;
    runScan(searchArea);
  }, [searchArea, sensitivity, runScan]);

  const handlePick = useCallback(
    (latlng: LatLng) => {
      if (searchMode) {
        setSelectedId(null);
        setDraftPosition(null);
        setSearchPosition(null);
        setActiveSearchId(null);
        setSearchArea({ lat: latlng.lat, lng: latlng.lng });
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

  // Centers the map on a POI, keeping it visible next to the open panel
  // (left of the 420px side panel on desktop, above the bottom sheet on mobile).
  const panToPoi = useCallback(
    (lat: number, lng: number) => {
      const map = mapRef.current;
      if (!map) return;
      const rect = map.getDiv().getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const tx = isDesktop ? Math.max(10, (w - 420) / 2) : w / 2;
      const ty = isDesktop ? h / 2 : h * 0.16;
      map.setCenter({ lat, lng });
      map.panBy(w / 2 - tx, h / 2 - ty);
      if ((map.getZoom() ?? 0) < 14) map.setZoom(14);
    },
    [isDesktop],
  );

  // Read the latest POI lists via refs so `focusPoi` is stable. If it depended
  // on `pois`, the pan→idle→reload→new array cycle would re-run this forever,
  // constantly re-centering and re-creating every marker on the map.
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const searchPoisRef = useRef(searchPois);
  searchPoisRef.current = searchPois;

  const focusPoi = useCallback(
    (id: string) => {
      const poi = [...poisRef.current, ...searchPoisRef.current].find((p) => p.id === id);
      if (poi) {
        panToPoi(poi.lat, poi.lng);
      } else {
        api
          .getPoi(id)
          .then(({ poi: p }) => panToPoi(p.lat, p.lng))
          .catch(() => {});
      }
    },
    [panToPoi],
  );

  useEffect(() => {
    if (selectedId) focusPoi(selectedId);
  }, [selectedId, focusPoi]);

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (pendingFocus) {
        api
          .getPoi(pendingFocus)
          .then(({ poi }) => panToPoi(poi.lat, poi.lng))
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
    [pendingFocus, panToPoi, shouldAutoLocate, toast, t],
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

  const handleOpenSaved = useCallback((search: Search) => {
    setSavedOpen(false);
    setSearchMode(true);
    setSelectedId(null);
    setDraftPosition(null);
    setSearchPosition(null);
    setActiveSearchId(search.id);
    setCandidates([]);
    setSearchPois([]);
    lastScanRef.current = null;
    // The zone of a saved search is its saved viewport (center + zoom). Skip
    // the auto bounds-load on searchArea change; the map move below triggers
    // an idle event that loads the results for the restored viewport.
    skipNextSearchLoadRef.current = true;
    setSearchArea({ lat: search.lat, lng: search.lng });
    mapRef.current?.panTo({ lat: search.lat, lng: search.lng });
    mapRef.current?.setZoom(search.zoom);
  }, []);

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
        onBoundsChange={handleBoundsChange}
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

      {canSearch && searchMode && !searchArea && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-[1150] flex justify-center">
          <div className="glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-200">
            <FontAwesomeIcon icon={faBullseye} className="h-4 w-4 text-brand-500" />
            {t('search.tapMap')}
          </div>
        </div>
      )}

      <PoiDrawer
        poiId={selectedId}
        onClose={handleCloseDrawer}
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

      {canSearch && (
        <SearchPanel
          position={searchArea}
          pois={searchPois}
          loading={searchLoading}
          activeSearchId={activeSearchId}
          minimized={minimized}
          candidates={candidates}
          scanning={scanning}
          scanProgress={scanProgress}
          cachedCount={scanCached}
          previewUrl={previewUrl}
          previewSize={previewSize}
          sensitivity={sensitivity}
          zoom={mapRef.current?.getZoom() ?? 14}
          onSensitivityChange={setSensitivity}
          onScan={runScan}
          onAddCandidate={handleAddCandidate}
          onCenter={(latlng) => panToPoi(latlng.lat, latlng.lng)}
          onClose={handleClearSearch}
          onMinimize={() => setMinimized(true)}
          onSelect={(id) => setSelectedId(id)}
          onToggleSeen={handleToggleSeen}
          onSaved={(search) => {
            setActiveSearchId(search.id);
            loadSavedSearches();
          }}
          onDeleted={handleClearSearch}
          onRenamed={loadSavedSearches}
        />
      )}

      {canSearch && (
        <SavedSearchesPanel
          open={savedOpen}
          searches={savedSearches}
          loading={savedLoading}
          onClose={() => setSavedOpen(false)}
          onOpen={handleOpenSaved}
          onDelete={handleDeleteSaved}
        />
      )}

      {canSearch && searchArea && minimized && !selectedId && (
        <button
          onClick={() => setMinimized(false)}
          aria-label={t('search.restore')}
          title={t('search.restore')}
          className="glass-strong fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-[1350] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-float transition-all hover:brightness-105 active:scale-95 md:bottom-auto md:left-auto md:right-6 md:top-24 md:translate-x-0 dark:text-slate-100"
        >
          <FontAwesomeIcon icon={faFish} className="h-4 w-4 text-brand-500" />
          {t('search.title')}
          {candidates.length > 0 && (
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-200">
              {candidates.length}
            </span>
          )}
        </button>
      )}

      {!selectedId && (
        <>
          {canSearch && (
            <button
              onClick={() => setSavedOpen((v) => !v)}
              aria-label={t('saved.title')}
              title={t('saved.title')}
              className={`fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-[1500] grid h-12 w-12 place-items-center rounded-full text-lg transition-all hover:brightness-105 active:scale-95 ${
                savedOpen ? 'bg-brand-600 text-white shadow-float' : 'glass text-slate-600 dark:text-slate-200'
              }`}
            >
              <FontAwesomeIcon icon={faBookmark} />
            </button>
          )}
          {canSearch && (
            <button
              onClick={() => {
                if (searchMode) handleClearSearch();
                setSearchMode((v) => !v);
              }}
              aria-label={t('search.toggle')}
              title={t('search.toggle')}
              className={`fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-4 z-[1500] grid h-12 w-12 place-items-center rounded-full text-lg transition-all hover:brightness-105 active:scale-95 ${
                searchMode ? 'bg-brand-600 text-white shadow-float' : 'glass text-slate-600 dark:text-slate-200'
              }`}
            >
              <FontAwesomeIcon icon={faBullseye} />
            </button>
          )}
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
