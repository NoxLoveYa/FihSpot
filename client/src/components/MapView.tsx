import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, Map as LeafletMap } from 'leaflet';
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

function makeIcon(category: string | null): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-pin" style="background:${categoryColor(category)}">${categoryIconHtml(category)}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
    popupAnchor: [0, -32],
  });
}

const selectedRingIcon = L.divIcon({
  className: 'custom-marker-ring',
  html: '<div class="marker-selected-ring"></div>',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

const userLocationIcon = L.divIcon({
  className: 'custom-marker-user',
  html: '<div class="marker-user-dot"><div class="marker-user-pulse"></div></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const searchMarkerIcon = L.divIcon({
  className: 'custom-marker-search',
  html: '<div class="marker-search-dot"><div class="marker-search-pulse"></div></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface BoundsChangeProps {
  onBoundsChange: (bounds: Bounds) => void;
}

function BoundsListener({ onBoundsChange }: BoundsChangeProps) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBoundsChange({
        swLat: b.getSouthWest().lat,
        swLng: b.getSouthWest().lng,
        neLat: b.getNorthEast().lat,
        neLng: b.getNorthEast().lng,
      });
    },
    zoomend: () => {
      const b = map.getBounds();
      onBoundsChange({
        swLat: b.getSouthWest().lat,
        swLng: b.getSouthWest().lng,
        neLat: b.getNorthEast().lat,
        neLng: b.getNorthEast().lng,
      });
    },
  });
  return null;
}

interface ClickListenerProps {
  enabled: boolean;
  onPick: (latlng: LatLng) => void;
}

function PickListener({ enabled, onPick }: ClickListenerProps) {
  useMapEvents({
    click: (e) => {
      if (enabled) onPick(e.latlng);
    },
  });
  return null;
}

interface MapReadyProps {
  onMapReady: (map: LeafletMap) => void;
}

function MapReadyListener({ onMapReady }: MapReadyProps) {
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  return null;
}

interface MapViewProps {
  pois: PoISummary[];
  selectedId: string | null;
  adding: boolean;
  draftPosition: LatLng | null;
  userPosition: LatLng | null;
  searchPosition: LatLng | null;
  onMapReady: (map: LeafletMap) => void;
  onBoundsChange: (bounds: Bounds) => void;
  onSelect: (id: string) => void;
  onPick: (latlng: LatLng) => void;
}

export function MapView({
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
}: MapViewProps) {
  const { t } = useTranslation();
  const center: [number, number] = [48.8566, 2.3522];
  const draftIcon = useMemo(() => makeIcon(null), []);

  const iconCache = useRef(new Map<string, L.DivIcon>());
  const getIcon = useCallback((category: string | null): L.DivIcon => {
    const key = category ?? 'default';
    let icon = iconCache.current.get(key);
    if (!icon) {
      icon = makeIcon(category);
      iconCache.current.set(key, icon);
    }
    return icon;
  }, []);

  const selectedPoi = selectedId ? pois.find((p) => p.id === selectedId) : null;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full"
        zoomControl={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsListener onBoundsChange={onBoundsChange} />
        <PickListener enabled={adding} onPick={onPick} />
        <MapReadyListener onMapReady={onMapReady} />

        {pois.map((poi) => (
          <Marker
            key={poi.id}
            position={[poi.lat, poi.lng]}
            icon={getIcon(poi.category)}
            eventHandlers={{
              click: () => onSelect(poi.id),
            }}
          />
        ))}

        {selectedPoi && (
          <Marker position={[selectedPoi.lat, selectedPoi.lng]} icon={selectedRingIcon} interactive={false} />
        )}

        {userPosition && <Marker position={userPosition} icon={userLocationIcon} interactive={false} zIndexOffset={1000} />}

        {searchPosition && <Marker position={searchPosition} icon={searchMarkerIcon} interactive={false} zIndexOffset={500} />}

        {draftPosition && <Marker position={draftPosition} icon={draftIcon} />}
      </MapContainer>

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
