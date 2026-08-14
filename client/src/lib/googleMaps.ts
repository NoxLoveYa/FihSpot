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
 * Scan tile served by OUR server (`/api/scan/tile`), which proxies the Google
 * Maps Static API and caches the tiles on the server side. Nothing is stored
 * in the client's Cache Storage anymore, so repeat scans of a zone hit the
 * server cache and the origin's iOS storage quota stays low. The water fill is
 * recolored to the dark-theme water color (#68bfd9) so ponds show up as
 * exactly that color for detection.
 */
export function scanTileUrl(lat: number, lng: number, zoom: number, size: number): string {
  const params = new URLSearchParams({
    lat: lat.toFixed(6),
    lng: lng.toFixed(6),
    zoom: String(zoom),
    size: String(size),
    scale: '2',
  });
  return `/api/scan/tile?${params.toString()}`;
}
