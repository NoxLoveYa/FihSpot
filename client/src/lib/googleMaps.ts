import { Loader } from '@googlemaps/js-api-loader';

export type LatLng = { lat: number; lng: number };

let loader: Loader | null = null;
let loadingPromise: Promise<typeof google> | null = null;

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

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
