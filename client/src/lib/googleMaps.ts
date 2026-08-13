import { Loader } from '@googlemaps/js-api-loader';

export type LatLng = { lat: number; lng: number };

let loader: Loader | null = null;
let loadingPromise: Promise<typeof google> | null = null;

const env = import.meta.env as Record<string, string | undefined> | undefined;
const API_KEY = env?.VITE_GOOGLE_MAPS_API_KEY;
export const MAP_ID = env?.VITE_GOOGLE_MAPS_MAP_ID;

export function loadGoogleMaps(): Promise<typeof google> {
  if (!API_KEY) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is missing'));
  }
  if (!loader) {
    loader = new Loader({
      apiKey: API_KEY,
      version: 'weekly',
      libraries: ['marker'],
    });
  }
  if (!loadingPromise) {
    loadingPromise = loader.load();
  }
  return loadingPromise;
}

export function staticMapUrl(lat: number, lng: number, size = '600x300'): string | null {
  if (!API_KEY) return null;
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '15',
    size,
    scale: '2',
    markers: `color:0x4f46e5|${lat},${lng}`,
    key: API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Static map of an area whose water fill is recolored to the dark-theme water
 * color (#93dbee), so ponds show up as exactly that color for detection.
 */
export function staticMapForScan(center: LatLng, zoom: number, size: number): string | null {
  if (!API_KEY) return null;
  const params = new URLSearchParams({
    center: `${center.lat},${center.lng}`,
    zoom: String(zoom),
    size: `${size}x${size}`,
    scale: '1',
    style: 'feature:water|element:geometry.fill|color:0x93dbee',
    key: API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
