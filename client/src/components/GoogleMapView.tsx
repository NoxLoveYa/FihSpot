import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { icon as faIcon } from '@fortawesome/fontawesome-svg-core';
import { faFish } from '@fortawesome/free-solid-svg-icons';
import { loadGoogleMaps, MAP_ID, type LatLng } from '../lib/googleMaps';
import { useTheme } from '../context/ThemeContext';
import type { MapType } from './MapTypeToggle';
import type { Bounds, PoISummary } from '../api/types';

const PIN_COLOR = '#2563eb';

function pinHtml(): string {
  const fish = faIcon(faFish);
  return `<div class="marker-pin" style="background:${PIN_COLOR}">${fish ? fish.html[0] : ''}</div>`;
}

function makeContent(innerHtml: string, interactive = false): HTMLElement {
  const el = document.createElement('div');
  el.className = interactive ? 'gm-marker-content gm-interactive' : 'gm-marker-content';
  el.innerHTML = innerHtml;
  return el;
}

interface GoogleMapViewProps {
  pois: PoISummary[];
  selectedId: string | null;
  adding: boolean;
  mapType: MapType;
  draftPosition: LatLng | null;
  userPosition: LatLng | null;
  searchPosition: LatLng | null;
  onMapReady: (map: google.maps.Map) => void;
  onBoundsChange: (bounds: Bounds) => void;
  onSelect: (id: string) => void;
  onPick: (latlng: LatLng) => void;
}

export function GoogleMapView({
  pois,
  selectedId,
  adding,
  mapType,
  draftPosition,
  userPosition,
  searchPosition,
  onMapReady,
  onBoundsChange,
  onSelect,
  onPick,
}: GoogleMapViewProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const viewRef = useRef<{ center: LatLng; zoom: number } | null>(null);
  const mapTypeRef = useRef(mapType);

  useEffect(() => {
    mapTypeRef.current = mapType;
  }, [mapType]);

  const onMapReadyRef = useRef(onMapReady);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);
  const addingRef = useRef(adding);

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
    addingRef.current = adding;
  }, [adding]);

  useEffect(() => {
    let disposed = false;
    let instance: google.maps.Map | null = null;
    loadGoogleMaps()
      .then((google) => {
        if (disposed || !containerRef.current) return;
        const center = viewRef.current?.center ?? { lat: 48.8566, lng: 2.3522 };
        const zoom = viewRef.current?.zoom ?? 13;
        const containerWidth = containerRef.current.clientWidth || window.innerWidth;
        const minZoom = Math.max(1, Math.ceil(Math.log2(containerWidth / 256)));
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
          mapTypeId:
            mapTypeRef.current === 'satellite'
              ? google.maps.MapTypeId.SATELLITE
              : google.maps.MapTypeId.ROADMAP,
          tilt: 0,
          gestureHandling: 'auto',
        });

        instance.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (addingRef.current && e.latLng) {
            onPickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        });

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
      })
      .catch((err) => {
        console.error('Failed to load Google Maps:', err);
      });

    return () => {
      disposed = true;
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
        content: makeContent(pinHtml(), true),
        zIndex: 500,
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

    return () => {
      markers.forEach((m) => {
        m.map = null;
      });
    };
  }, [map, pois, selectedId, draftPosition, userPosition, searchPosition]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {adding && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center">
          <div className="pointer-events-auto rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-float">
            {t('map.clickToPlace')}
          </div>
        </div>
      )}
    </div>
  );
}
