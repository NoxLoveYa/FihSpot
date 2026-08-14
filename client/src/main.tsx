import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import '@fortawesome/fontawesome-svg-core/styles.css';

// iOS Safari kills the service worker when Safari closes and wakes it on the
// next navigation, which delays every launch (and can break the standalone
// home-screen app). The app is served with long-lived HTTP caching instead, so
// no service worker is registered. Unregister any previous registration left
// on devices that installed the old PWA build.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      })
      .catch(() => {});
  });
}

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
