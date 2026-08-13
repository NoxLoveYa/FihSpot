import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import './i18n';
import '@fortawesome/fontawesome-svg-core/styles.css';

// iOS Safari ignores `user-scalable=no` (accessibility), so block the double-tap
// page zoom that fights the map's own tap gestures.
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (e.touches.length === 0 && now - lastTouchEnd <= 350) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false },
);

registerSW({ immediate: true });

// When a newer service worker takes control (skipWaiting/clientsClaim), reload
// so the page runs against the current build's HTML+assets. Without this, a
// cold start on mobile can briefly run an old index.html that references
// assets the updated worker already removed from its cache — leaving the app
// stuck on the loading screen.
let refreshing = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
