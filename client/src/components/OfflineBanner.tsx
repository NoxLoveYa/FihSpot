import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none fixed inset-x-0 top-16 z-[1800] flex justify-center px-4"
        >
          <div className="pointer-events-auto rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-soft backdrop-blur">
            Hors ligne — affichage des données en cache
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
