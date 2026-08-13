import { Loader } from '@googlemaps/js-api-loader';

export type LatLng = { lat: number; lng: number };

let loader: Loader | null = null;
let loadingPromise: Promise<typeof google> | null = null;

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;

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
