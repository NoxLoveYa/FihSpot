import { useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from 'leaflet';
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

function categoryIcon(category: string | null): string {
  switch (category) {
    case 'culture':
      return '🏛';
    case 'nature':
      return '🌿';
    case 'food':
      return '🍽';
    case 'sport':
      return '⚽';
    case 'shop':
      return '🛍';
    default:
      return '📍';
  }
}

function makeIcon(category: string | null, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-pin ${selected ? 'selected' : ''}" style="background:${categoryColor(category)}"><span>${categoryIcon(category)}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
    popupAnchor: [0, -32],
  });
}

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

interface RecenterProps {
  onLocate?: (pos: LatLng) => void;
}

function RecenterButton({ onLocate }: RecenterProps) {
  const map = useMap();
  const locating = useRef(false);

  const handle = useCallback(() => {
    if (locating.current) return;
    locating.current = true;
    map.locate({ setView: true, maxZoom: 16 });
    map.once('locationfound', (e) => {
      locating.current = false;
      onLocate?.(e.latlng);
    });
    map.once('locationerror', () => {
      locating.current = false;
    });
  }, [map, onLocate]);

  return (
    <button
      onClick={handle}
      aria-label="Me localiser"
      className="absolute bottom-8 right-3 z-[1000] grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-lg shadow-soft transition-transform active:scale-95 dark:border-slate-700 dark:bg-slate-800"
    >
      🎯
    </button>
  );
}

interface MapViewProps {
  pois: PoISummary[];
  selectedId: string | null;
  adding: boolean;
  draftPosition: LatLng | null;
  onBoundsChange: (bounds: Bounds) => void;
  onSelect: (id: string) => void;
  onPick: (latlng: LatLng) => void;
}

export function MapView({
  pois,
  selectedId,
  adding,
  draftPosition,
  onBoundsChange,
  onSelect,
  onPick,
}: MapViewProps) {
  const center: [number, number] = [48.8566, 2.3522];
  const draftIcon = useMemo(() => makeIcon(null, false), []);
  const icons = useMemo(
    () =>
      Object.fromEntries(
        pois.map((poi) => [poi.id, makeIcon(poi.category, poi.id === selectedId)]),
      ),
    [pois, selectedId],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={13} className="h-full w-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsListener onBoundsChange={onBoundsChange} />
        <PickListener enabled={adding} onPick={onPick} />

        {pois.map((poi) => (
          <Marker
            key={poi.id}
            position={[poi.lat, poi.lng]}
            icon={icons[poi.id]}
            eventHandlers={{
              click: () => onSelect(poi.id),
            }}
          />
        ))}

        {draftPosition && <Marker position={draftPosition} icon={draftIcon} />}

        <RecenterButton />
      </MapContainer>

      {adding && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center">
          <div className="pointer-events-auto rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-float">
            Cliquez sur la carte pour placer le point
          </div>
        </div>
      )}
    </div>
  );
}
