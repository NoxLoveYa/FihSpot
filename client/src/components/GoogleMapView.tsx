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

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makePinIcon(category: string | null): google.maps.Icon {
  const rendered = faIcon(categoryIcon(category));
  const w = rendered.icon[0];
  const h = rendered.icon[1];
  const path = (rendered.icon[4] as string) ?? '';
  const color = categoryColor(category);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path d="M12 0C6.48 0 2 4.48 2 10c0 6 10 14 10 14s10-8 10-14C22 4.48 17.52 0 12 0z" fill="${color}" stroke="#ffffff" stroke-width="1.6"/>
  <svg x="6.5" y="3" width="11" height="11" viewBox="0 0 ${w} ${h}">
    <path d="${path}" fill="#ffffff"/>
  </svg>
</svg>`;
  return {
    url: svgDataUri(svg),
    size: new google.maps.Size(36, 36),
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 36),
  };
}

function makeSelectedRingIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="12" fill="rgba(99,102,241,0.15)" stroke="#6366f1" stroke-width="3">
    <animate attributeName="r" values="9;23" dur="1.6s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite"/>
  </circle>
  <circle cx="24" cy="24" r="12" fill="rgba(99,102,241,0.15)" stroke="#6366f1" stroke-width="3"/>
</svg>`;
  return {
    url: svgDataUri(svg),
    size: new google.maps.Size(48, 48),
    scaledSize: new google.maps.Size(48, 48),
    anchor: new google.maps.Point(24, 24),
  };
}

function makeUserLocationIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="11" fill="rgba(59,130,246,0.55)">
    <animate attributeName="r" values="8;15" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.9;0" dur="2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="16" cy="16" r="7" fill="#3b82f6" stroke="#ffffff" stroke-width="2.5"/>
</svg>`;
  return {
    url: svgDataUri(svg),
    size: new google.maps.Size(32, 32),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };
}

function makeSearchIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="11" fill="rgba(13,148,136,0.5)">
    <animate attributeName="r" values="8;15" dur="1.8s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite"/>
  </circle>
  <circle cx="16" cy="16" r="8" fill="#0d9488" stroke="#ffffff" stroke-width="3"/>
</svg>`;
  return {
    url: svgDataUri(svg),
    size: new google.maps.Size(32, 32),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };
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

    const markers: google.maps.Marker[] = [];

    if (draftPosition) {
      markers.push(
        new google.maps.Marker({
          map,
          position: draftPosition,
          icon: makePinIcon(null),
          zIndex: 200,
        }),
      );
    }

    pois.forEach((poi) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: poi.lat, lng: poi.lng },
        icon: makePinIcon(poi.category),
        zIndex: 500,
        title: poi.name,
      });
      marker.addListener('click', () => onSelectRef.current(poi.id));
      markers.push(marker);
    });

    const selected = selectedId ? pois.find((p) => p.id === selectedId) : null;
    if (selected) {
      markers.push(
        new google.maps.Marker({
          map,
          position: { lat: selected.lat, lng: selected.lng },
          icon: makeSelectedRingIcon(),
          zIndex: 600,
        }),
      );
    }

    if (userPosition) {
      markers.push(
        new google.maps.Marker({
          map,
          position: userPosition,
          icon: makeUserLocationIcon(),
          zIndex: 1000,
        }),
      );
    }

    if (searchPosition) {
      markers.push(
        new google.maps.Marker({
          map,
          position: searchPosition,
          icon: makeSearchIcon(),
          zIndex: 800,
        }),
      );
    }

    return () => {
      markers.forEach((m) => {
        m.setMap(null);
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
