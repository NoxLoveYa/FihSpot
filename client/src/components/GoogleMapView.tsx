import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { icon as faIcon } from '@fortawesome/fontawesome-svg-core';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faLandmark,
  faLeaf,
  faUtensils,
  faFutbol,
  faBagShopping,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons';
import { loadGoogleMaps, type LatLng } from '../lib/googleMaps';
import type { Bounds, PoISummary } from '../api/types';

const categoryColors: Record<string, string> = {
  culture: '#8b5cf6',
  nature: '#10b981',
  food: '#f59e0b',
  sport: '#ef4444',
  shop: '#06b6d4',
};

function categoryColor(category: string | null): string {
  if (category && categoryColors[category]) return categoryColors[category];
  return '#6366f1';
}

const categoryIcons: Record<string, IconDefinition> = {
  culture: faLandmark,
  nature: faLeaf,
  food: faUtensils,
  sport: faFutbol,
  shop: faBagShopping,
};

function categoryIcon(category: string | null): IconDefinition {
  if (category && categoryIcons[category]) return categoryIcons[category];
  return faLocationDot;
}

function categoryIconHtml(category: string | null): string {
  const rendered = faIcon(categoryIcon(category));
  return rendered ? rendered.html[0] : '';
}

function pinHtml(category: string | null): string {
  return `<div class="marker-pin" style="background:${categoryColor(category)}">${categoryIconHtml(category)}</div>`;
}

function makeContent(innerHtml: string, anchorClass?: string, interactive = false): HTMLElement {
  const outer = document.createElement('div');
  outer.className = `gm-marker-content${interactive ? ' gm-interactive' : ''}`;
  outer.innerHTML = anchorClass ? `<div class="${anchorClass}">${innerHtml}</div>` : innerHtml;
  return outer;
}

interface GoogleMapViewProps {
  pois: PoISummary[];
  selectedId: string | null;
  adding: boolean;
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
  draftPosition,
  userPosition,
  searchPosition,
  onMapReady,
  onBoundsChange,
  onSelect,
  onPick,
}: GoogleMapViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

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
    loadGoogleMaps()
      .then((google) => {
        if (disposed || !containerRef.current) return;
        const instance = new google.maps.Map(containerRef.current, {
          center: { lat: 48.8566, lng: 2.3522 },
          zoom: 13,
          mapTypeControl: true,
          mapTypeControlOptions: {
            position: google.maps.ControlPosition.TOP_RIGHT,
          },
          zoomControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          tilt: 0,
          gestureHandling: 'auto',
        });

        instance.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (addingRef.current && e.latLng) {
            onPickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        });

        const updateBounds = () => {
          const b = instance.getBounds();
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
        instance.addListener('idle', updateBounds);
        updateBounds();

        instance.addListener('maptypeid_changed', () => {
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
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const { AdvancedMarkerElement } = window.google.maps.marker;
    if (!AdvancedMarkerElement) return;

    const markers: google.maps.marker.AdvancedMarkerElement[] = [];

    const decorative = (opts: google.maps.marker.AdvancedMarkerElementOptions & { interactive: boolean }) =>
      new AdvancedMarkerElement(opts as google.maps.marker.AdvancedMarkerElementOptions);

    if (draftPosition) {
      markers.push(
        decorative({
          map,
          position: draftPosition,
          content: makeContent(pinHtml(null), 'gm-anchor-pin'),
          zIndex: 200,
          interactive: false,
        }),
      );
    }

    pois.forEach((poi) => {
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: poi.lat, lng: poi.lng },
        content: makeContent(pinHtml(poi.category), 'gm-anchor-pin', true),
        zIndex: 500,
        title: poi.name,
      });
      marker.addListener('click', () => onSelectRef.current(poi.id));
      markers.push(marker);
    });

    const selected = selectedId ? pois.find((p) => p.id === selectedId) : null;
    if (selected) {
      markers.push(
        decorative({
          map,
          position: { lat: selected.lat, lng: selected.lng },
          content: makeContent('<div class="marker-selected-ring"></div>'),
          zIndex: 600,
          interactive: false,
        }),
      );
    }

    if (userPosition) {
      markers.push(
        decorative({
          map,
          position: userPosition,
          content: makeContent('<div class="marker-user-dot"><div class="marker-user-pulse"></div></div>'),
          zIndex: 1000,
          interactive: false,
        }),
      );
    }

    if (searchPosition) {
      markers.push(
        decorative({
          map,
          position: searchPosition,
          content: makeContent('<div class="marker-search-dot"><div class="marker-search-pulse"></div></div>'),
          zIndex: 800,
          interactive: false,
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
