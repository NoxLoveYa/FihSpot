import { useEffect, useRef, useState } from 'react';
import { icon as faIcon } from '@fortawesome/fontawesome-svg-core';
import { faFish } from '@fortawesome/free-solid-svg-icons';
import { loadGoogleMaps, MAP_ID, type LatLng } from '../lib/googleMaps';
import { useTheme } from '../context/ThemeContext';
import type { MapType } from './MapTypeToggle';
import type { Bounds, PoISummary } from '../api/types';

const PIN_COLOR = '#2563eb';

function pinHtml(seen = false): string {
  const fish = faIcon(faFish);
  const pin = `<div class="marker-pin${seen ? ' marker-pin-seen' : ''}" style="background:${PIN_COLOR}">${
    fish ? fish.html[0] : ''
  }</div>`;
  return seen ? `${pin}<div class="marker-seen-badge"></div>` : pin;
}

function makeContent(innerHtml: string, interactive = false): HTMLElement {
  const el = document.createElement('div');
  el.className = interactive ? 'gm-marker-content gm-interactive' : 'gm-marker-content';
  el.innerHTML = innerHtml;
  return el;
}

export type PickKind = 'scan' | 'poi';

interface GoogleMapViewProps {
  pois: PoISummary[];
  selectedId: string | null;
  mapType: MapType;
  draftPosition: LatLng | null;
  userPosition: LatLng | null;
  searchPosition: LatLng | null;
  searchArea: { lat: number; lng: number } | null;
  candidates: LatLng[];
  onMapReady: (map: google.maps.Map) => void;
  onBoundsChange: (bounds: Bounds) => void;
  onSelect: (id: string) => void;
  onPick: (latlng: LatLng, kind: PickKind) => void;
}

export function GoogleMapView({
  pois,
  selectedId,
  mapType,
  draftPosition,
  userPosition,
  searchPosition,
  searchArea,
  candidates,
  onMapReady,
  onBoundsChange,
  onSelect,
  onPick,
}: GoogleMapViewProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const viewRef = useRef<{ center: LatLng; zoom: number } | null>(null);
  const mapTypeRef = useRef(mapType);
  // Mobile tap debounce: distinguishes a single tap (scan marker) from a
  // double-tap (POI placement) by deferring the action briefly.
  const pendingTapRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef(0);
  const lastTapXYRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    mapTypeRef.current = mapType;
  }, [mapType]);

  const onMapReadyRef = useRef(onMapReady);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);
  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let disposed = false;
    let instance: google.maps.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const settleTimeouts: number[] = [];
    let watchdogTimer: number | undefined;
    const watchdogDeadline = performance.now() + 10_000;

    const forceResize = () => {
      if (instance) google.maps.event.trigger(instance, 'resize');
    };
    let preventContextMenu: ((ev: Event) => void) | undefined;

    // The visual viewport shrinks/grows with the browser chrome (URL bar,
    // keyboard, launch transition) without resizing the window. Re-measure the
    // canvas whenever it changes so the map always fills its container.
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', forceResize);
    visualViewport?.addEventListener('scroll', forceResize);

    loadGoogleMaps()
      .then((google) => {
        if (disposed || !containerRef.current) return;
        const center = viewRef.current?.center ?? { lat: 48.8566, lng: 2.3522 };
        const zoom = viewRef.current?.zoom ?? 13;
        const containerWidth = containerRef.current.clientWidth || window.innerWidth;
        const minZoom = Math.max(1, Math.ceil(Math.log2(containerWidth / 256)));
        // Coarse pointers (touch) get tap/double-tap gestures; fine pointers
        // (mouse) get left-click = POI and right-click = scan.
        const isCoarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
        instance = new google.maps.Map(containerRef.current, {
          center,
          zoom,
          minZoom,
          restriction: {
            latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
            strictBounds: true,
          },
          mapId: MAP_ID,
          colorScheme: theme === 'dark' ? 'DARK' : 'LIGHT',
          mapTypeControl: false,
          zoomControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // On touch, a double-tap means "place a POI" — don't zoom the map.
          disableDoubleClickZoom: isCoarse,
          mapTypeId:
            mapTypeRef.current === 'satellite'
              ? google.maps.MapTypeId.SATELLITE
              : google.maps.MapTypeId.ROADMAP,
          tilt: 0,
          gestureHandling: 'auto',
        });

        instance.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const latlng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          if (!isCoarse) {
            onPickRef.current(latlng, 'poi');
            return;
          }
          // Mobile: defer a single tap (scan marker) so a second tap within
          // ~350 ms / ~44 px becomes a double-tap (POI placement).
          const dom = e.domEvent as MouseEvent | undefined;
          const now = Date.now();
          const x = dom?.clientX ?? 0;
          const y = dom?.clientY ?? 0;
          if (pendingTapRef.current !== null && now - lastTapTimeRef.current <= 350) {
            const timer = pendingTapRef.current;
            pendingTapRef.current = null;
            window.clearTimeout(timer);
            const dx = x - lastTapXYRef.current.x;
            const dy = y - lastTapXYRef.current.y;
            if (Math.hypot(dx, dy) <= 44) {
              onPickRef.current(latlng, 'poi');
              return;
            }
          }
          if (pendingTapRef.current !== null) window.clearTimeout(pendingTapRef.current);
          lastTapTimeRef.current = now;
          lastTapXYRef.current = { x, y };
          pendingTapRef.current = window.setTimeout(() => {
            pendingTapRef.current = null;
            onPickRef.current(latlng, 'scan');
          }, 280);
        });

        // On touch Google Maps fires `dblclick` (instead of a second `click`)
        // for the second tap of a double-tap. Cancel any pending single-tap
        // scan and place a POI instead.
        instance.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          if (pendingTapRef.current !== null) {
            window.clearTimeout(pendingTapRef.current);
            pendingTapRef.current = null;
          }
          lastTapTimeRef.current = 0;
          onPickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() }, 'poi');
        });

        instance.addListener('rightclick', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onPickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() }, 'scan');
        });

        preventContextMenu = (ev: Event) => ev.preventDefault();
        containerRef.current.addEventListener('contextmenu', preventContextMenu);

        const updateView = () => {
          const c = instance?.getCenter();
          const z = instance?.getZoom();
          if (c && z != null) {
            viewRef.current = { center: { lat: c.lat(), lng: c.lng() }, zoom: z };
          }
          const b = instance?.getBounds();
          if (!b) return;
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          onBoundsChangeRef.current({
            swLat: sw.lat(),
            swLng: sw.lng(),
            neLat: ne.lat(),
            neLng: ne.lng(),
          });
        };
        instance.addListener('idle', updateView);
        updateView();

        instance.addListener('maptypeid_changed', () => {
          if (!instance) return;
          const id = instance.getMapTypeId();
          if (id === google.maps.MapTypeId.SATELLITE || id === google.maps.MapTypeId.HYBRID) {
            instance.setTilt(45);
          } else {
            instance.setTilt(0);
          }
        });

        onMapReadyRef.current(instance);
        setMap(instance);

        // The map measures its canvas once at init; on a relaunch of the
        // installed web app that can happen during the iOS launch transition,
        // leaving the canvas smaller than the container. `resize` re-reads the
        // container and re-fits the canvas, so re-measure on real lifecycle
        // signals: container size changes, window/viewport changes, and the
        // page-transition animation completing (layout settled).
        resizeObserver = new ResizeObserver(forceResize);
        resizeObserver.observe(containerRef.current);
        window.addEventListener('resize', forceResize);
        window.addEventListener('orientationchange', forceResize);
        window.addEventListener('pageshow', forceResize);
        document.addEventListener('visibilitychange', forceResize);
        window.addEventListener('fihspot:page-animated', forceResize);
        // The iOS launch transition (and a stale dvh right after launch) can
        // leave the canvas smaller than the container with no event firing
        // afterwards. Re-measure a few times shortly after creation to cover
        // the viewport settling, regardless of what events fire.
        settleTimeouts.push(window.setTimeout(forceResize, 250));
        settleTimeouts.push(window.setTimeout(forceResize, 800));
        settleTimeouts.push(window.setTimeout(forceResize, 1600));

        // Belt-and-braces: keep re-measuring until the canvas actually fills
        // its container (so the map resizes itself into place even if no
        // layout event fires after the iOS launch transition), for up to 10s.
        const watchCanvas = () => {
          if (disposed || !instance || !containerRef.current) return;
          const canvas = containerRef.current.querySelector<HTMLElement>('.gm-style');
          if (canvas) {
            const cRect = containerRef.current.getBoundingClientRect();
            const mRect = canvas.getBoundingClientRect();
            if (Math.abs(cRect.height - mRect.height) > 1 || Math.abs(cRect.width - mRect.width) > 1) {
              google.maps.event.trigger(instance, 'resize');
            }
          }
          if (performance.now() < watchdogDeadline) {
            watchdogTimer = window.setTimeout(watchCanvas, 250);
          }
        };
        watchdogTimer = window.setTimeout(watchCanvas, 300);
      })
      .catch((err) => {
        console.error('Failed to load Google Maps:', err);
      });

    return () => {
      disposed = true;
      settleTimeouts.forEach((t) => window.clearTimeout(t));
      if (watchdogTimer !== undefined) window.clearTimeout(watchdogTimer);
      if (pendingTapRef.current !== null) {
        window.clearTimeout(pendingTapRef.current);
        pendingTapRef.current = null;
      }
      if (preventContextMenu && containerRef.current) {
        containerRef.current.removeEventListener('contextmenu', preventContextMenu);
      }
      resizeObserver?.disconnect();
      visualViewport?.removeEventListener('resize', forceResize);
      visualViewport?.removeEventListener('scroll', forceResize);
      window.removeEventListener('resize', forceResize);
      window.removeEventListener('orientationchange', forceResize);
      window.removeEventListener('pageshow', forceResize);
      document.removeEventListener('visibilitychange', forceResize);
      window.removeEventListener('fihspot:page-animated', forceResize);
      instance = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [theme]);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(
      mapType === 'satellite' ? window.google.maps.MapTypeId.SATELLITE : window.google.maps.MapTypeId.ROADMAP,
    );
  }, [map, mapType]);

  useEffect(() => {
    if (!map) return;
    const { AdvancedMarkerElement } = window.google.maps.marker;
    if (!AdvancedMarkerElement) return;

    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const centered = { anchorLeft: '-50%', anchorTop: '-50%' };

    if (draftPosition) {
      markers.push(
        new AdvancedMarkerElement({
          map,
          position: draftPosition,
          content: makeContent(pinHtml()),
          zIndex: 200,
        }),
      );
    }

    pois.forEach((poi) => {
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: poi.lat, lng: poi.lng },
        content: makeContent(pinHtml(poi.seen), true),
        zIndex: poi.seen ? 450 : 500,
        title: poi.name,
        gmpClickable: true,
      });
      marker.addListener('gmp-click', () => onSelectRef.current(poi.id));
      markers.push(marker);
    });

    const selected = selectedId ? pois.find((p) => p.id === selectedId) : null;
    if (selected) {
      markers.push(
        new AdvancedMarkerElement({
          map,
          position: { lat: selected.lat, lng: selected.lng },
          content: makeContent('<div class="marker-selected-ring"></div>'),
          zIndex: 600,
          ...centered,
        }),
      );
    }

    if (userPosition) {
      markers.push(
        new AdvancedMarkerElement({
          map,
          position: userPosition,
          content: makeContent('<div class="marker-user-dot"><div class="marker-user-pulse"></div></div>'),
          zIndex: 1000,
          ...centered,
        }),
      );
    }

    if (searchPosition) {
      markers.push(
        new AdvancedMarkerElement({
          map,
          position: searchPosition,
          content: makeContent('<div class="marker-search-dot"><div class="marker-search-pulse"></div></div>'),
          zIndex: 800,
          ...centered,
        }),
      );
    }

    if (searchArea) {
      markers.push(
        new AdvancedMarkerElement({
          map,
          position: { lat: searchArea.lat, lng: searchArea.lng },
          content: makeContent('<div class="marker-search-anchor"></div>'),
          zIndex: 900,
          ...centered,
        }),
      );
    }

    candidates.forEach((candidate) => {
      markers.push(
        new AdvancedMarkerElement({
          map,
          position: candidate,
          content: makeContent('<div class="marker-candidate"><div class="marker-candidate-pulse"></div></div>'),
          zIndex: 850,
          ...centered,
        }),
      );
    });

    return () => {
      markers.forEach((m) => {
        m.map = null;
      });
    };
  }, [map, pois, selectedId, draftPosition, userPosition, searchPosition, searchArea, candidates]);

  return (
    <div className="relative h-full w-full">
      {/* touch-action: none hands every touch gesture to Google Maps (one-finger
          pan, pinch zoom) and keeps the page from scrolling/rubber-banding
          while dragging on the map. */}
      <div ref={containerRef} className="h-full w-full" style={{ touchAction: 'none' }} />
    </div>
  );
}
