import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Photo, PoI } from '../api/types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Skeleton, Spinner } from './Spinner';
import { Button } from './Button';

interface PoiDrawerProps {
  poiId: string | null;
  onClose: () => void;
  onPoiChanged?: () => void;
}

const categoryLabels: Record<string, string> = {
  culture: 'Culture',
  nature: 'Nature',
  food: 'Restaurants',
  sport: 'Sport',
  shop: 'Boutiques',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PoiDrawer({ poiId, onClose, onPoiChanged }: PoiDrawerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [poi, setPoi] = useState<PoI | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!poiId) return;
    setLoading(true);
    try {
      const { poi } = await api.getPoi(poiId);
      setPoi(poi);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erreur de chargement', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [poiId, toast, onClose]);

  useEffect(() => {
    setPoi(null);
    if (poiId) load();
  }, [poiId, load]);

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!poi || !comment.trim()) return;
    setSendingComment(true);
    try {
      const { comment: created } = await api.addComment(poi.id, comment);
      setPoi((prev) => (prev ? { ...prev, comments: [...prev.comments, created] } : prev));
      setComment('');
      onPoiChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur', 'error');
    } finally {
      setSendingComment(false);
    }
  }

  async function deleteComment(id: string) {
    try {
      await api.deleteComment(id);
      setPoi((prev) => (prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== id) } : prev));
      onPoiChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur', 'error');
    }
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!poi || !e.target.files?.length) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const { photo } = await api.uploadPhoto(poi.id, file);
      setPoi((prev) => (prev ? { ...prev, photos: [...prev.photos, photo] } : prev));
      toast('Photo ajoutée', 'success');
      onPoiChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur d\'upload', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function deletePhoto(photo: Photo) {
    try {
      await api.deletePhoto(photo.id);
      setPoi((prev) => (prev ? { ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) } : prev));
      onPoiChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur', 'error');
    }
  }

  async function deletePoi() {
    if (!poi) return;
    if (!window.confirm(`Supprimer « ${poi.name} » ?`)) return;
    try {
      await api.deletePoi(poi.id);
      toast('Point supprimé', 'success');
      onPoiChanged?.();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur', 'error');
    }
  }

  const googleMapsUrl = poi ? `https://www.google.com/maps?q=${poi.lat},${poi.lng}` : '';

  return (
    <AnimatePresence>
      {poiId && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[1300] bg-black/40 backdrop-blur-[2px]"
          />
          <motion.aside
            key="panel"
            initial={isDesktop ? { x: '100%' } : { y: '100%' }}
            animate={isDesktop ? { x: 0 } : { y: 0 }}
            exit={isDesktop ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={`fixed z-[1400] flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft dark:bg-slate-800 md:bottom-0 md:left-auto md:top-0 md:h-full md:rounded-none md:rounded-l-3xl ${
              isDesktop ? 'right-0 w-[420px]' : 'inset-x-0 bottom-0 h-[85dvh]'
            }`}
          >
            {loading || !poi ? (
              <div className="flex flex-col gap-4 p-5">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
                  <div className="min-w-0">
                    {poi.category && (
                      <span className="mb-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                        {categoryLabels[poi.category] ?? poi.category}
                      </span>
                    )}
                    <h2 className="truncate text-lg font-bold text-slate-800 dark:text-slate-100">{poi.name}</h2>
                    <p className="text-xs text-slate-400">
                      Ajouté par {poi.createdBy.name} · {formatDate(poi.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Fermer"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-4 safe-bottom">
                  {poi.description && <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{poi.description}</p>}

                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
                    </svg>
                    Ouvrir dans Google Maps
                  </a>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Photos ({poi.photos.length})
                      </h3>
                      {user && (
                        <button
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-60 dark:bg-brand-900/50 dark:text-brand-200"
                        >
                          {uploading ? <Spinner className="h-3.5 w-3.5" /> : '+ Ajouter'}
                        </button>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadPhoto} />
                    </div>
                    {poi.photos.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 dark:bg-slate-700/40">
                        Aucune photo pour l'instant
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {poi.photos.map((photo) => (
                          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                            <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            {user?.id === photo.user.id && (
                              <button
                                onClick={() => deletePhoto(photo)}
                                aria-label="Supprimer la photo"
                                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-xs text-white transition-opacity group-hover:opacity-100 md:opacity-0"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Commentaires ({poi.comments.length})
                    </h3>
                    <ul className="space-y-3">
                      {poi.comments.map((c) => (
                        <li key={c.id} className="flex items-start gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/60">
                            {c.user.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="flex-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 dark:bg-slate-700/50">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.user.name}</span>
                              {user?.id === c.user.id && (
                                <button
                                  onClick={() => deleteComment(c.id)}
                                  className="text-xs text-slate-400 transition-colors hover:text-rose-500"
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">{c.content}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {poi.comments.length === 0 && (
                      <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 dark:bg-slate-700/40">
                        Soyez le premier à commenter
                      </p>
                    )}
                  </section>
                </div>

                <form onSubmit={submitComment} className="flex gap-2 border-t border-slate-100 p-3 safe-bottom dark:border-slate-700">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ajouter un commentaire…"
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <Button type="submit" disabled={!comment.trim() || sendingComment}>
                    {sendingComment ? <Spinner /> : 'Envoyer'}
                  </Button>
                </form>

                {user?.id === poi.createdBy.id && (
                  <div className="border-t border-slate-100 p-3 dark:border-slate-700">
                    <Button variant="danger" onClick={deletePoi} className="w-full">
                      Supprimer ce point
                    </Button>
                  </div>
                )}
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
