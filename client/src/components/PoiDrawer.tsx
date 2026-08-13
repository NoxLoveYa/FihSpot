import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faExpand, faFish, faMapLocationDot, faMapPin, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Photo, PoI } from '../api/types';
import { api, ApiError } from '../api/client';
import { staticMapUrl } from '../lib/googleMaps';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Skeleton, Spinner } from './Spinner';
import { Button } from './Button';
import i18n from '../i18n';

interface PoiDrawerProps {
  poiId: string | null;
  onClose: () => void;
  onPoiChanged?: () => void;
  onViewOnMap?: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PoiDrawer({ poiId, onClose, onPoiChanged, onViewOnMap }: PoiDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [poi, setPoi] = useState<PoI | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [comment, setComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const [mapImgError, setMapImgError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!poiId) return;
    setLoading(true);
    try {
      const { poi } = await api.getPoi(poiId);
      setPoi(poi);
      setVersion((v) => v + 1);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('poi.genericError'), 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [poiId, toast, onClose, t]);

  useEffect(() => {
    setPoi(null);
    setMapImgError(false);
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
      toast(err instanceof ApiError ? err.message : t('poi.genericError'), 'error');
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
      toast(err instanceof ApiError ? err.message : t('poi.genericError'), 'error');
    }
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!poi || !e.target.files?.length) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const { photo } = await api.uploadPhoto(poi.id, file);
      setPoi((prev) => (prev ? { ...prev, photos: [...prev.photos, photo] } : prev));
      toast(t('poi.photoAdded'), 'success');
      onPoiChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('poi.uploadError'), 'error');
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
      toast(err instanceof ApiError ? err.message : t('poi.genericError'), 'error');
    }
  }

  async function deletePoi() {
    if (!poi) return;
    if (!window.confirm(t('poi.deletePoiConfirm', { name: poi.name }))) return;
    try {
      await api.deletePoi(poi.id);
      toast(t('poi.deleted'), 'success');
      onPoiChanged?.();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('poi.genericError'), 'error');
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
            className={`glass-strong fixed z-[1400] flex flex-col overflow-hidden rounded-t-3xl md:bottom-0 md:left-auto md:top-0 md:h-full md:rounded-none md:rounded-l-3xl ${
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
              <motion.div
                key={version}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex h-full flex-col"
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-slate-800 dark:text-slate-100">{poi.name}</h2>
                    <p className="text-xs text-slate-400">
                      {t('poi.addedByPrefix')}{' '}
                      <button
                        onClick={() => navigate(`/user/${poi.createdBy.id}`)}
                        className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {poi.createdBy.name}
                      </button>
                      {' · '}
                      {formatDate(poi.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label={t('poi.close')}
                    className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:brightness-105 dark:text-slate-300"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-4 safe-bottom">
                  {(() => {
                    const mapUrl = staticMapUrl(poi.lat, poi.lng, '640x320');
                    return (
                      <a
                        href={`https://www.google.com/maps?q=${poi.lat},${poi.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative block aspect-[2/1] w-full overflow-hidden rounded-2xl"
                      >
                        {mapUrl && !mapImgError ? (
                          <img
                            src={mapUrl}
                            alt=""
                            loading="lazy"
                            onError={() => setMapImgError(true)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center"
                            style={{ background: `linear-gradient(135deg, #2563eb22, #2563eb55)` }}
                          >
                            <FontAwesomeIcon icon={faFish} className="h-10 w-10 text-white/90" />
                          </div>
                        )}
                        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                          <FontAwesomeIcon icon={faMapPin} className="mr-1 h-3 w-3" />
                          {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
                        </span>
                      </a>
                    );
                  })()}

                  {poi.description && <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{poi.description}</p>}

                  <div className="flex flex-col gap-2">
                    {onViewOnMap && (
                      <button
                        onClick={onViewOnMap}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                      >
                        <FontAwesomeIcon icon={faMapPin} className="h-4 w-4" />
                        {t('poi.viewOnMap')}
                      </button>
                    )}
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
                    >
                      <FontAwesomeIcon icon={faMapLocationDot} className="h-4 w-4" />
                      {t('poi.openInMaps')}
                    </a>
                  </div>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('poi.photos', { count: poi.photos.length })}
                      </h3>
                      {user && (
                        <button
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-1 rounded-lg bg-brand-500/15 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-500/25 disabled:opacity-60 dark:text-brand-200"
                        >
                          {uploading ? <Spinner className="h-3.5 w-3.5" /> : t('poi.addPhoto')}
                        </button>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadPhoto} />
                    </div>
                    {poi.photos.length === 0 ? (
                      <p className="glass rounded-xl px-3 py-4 text-center text-sm text-slate-400">
                        {t('poi.noPhotos')}
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {poi.photos.map((photo) => (
                          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                            <button
                              onClick={() => setViewingPhoto(photo)}
                              aria-label={t('poi.viewPhoto')}
                              className="block h-full w-full"
                            >
                              <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            </button>
                            <button
                              onClick={() => setViewingPhoto(photo)}
                              aria-label={t('poi.viewPhoto')}
                              title={t('poi.viewPhoto')}
                              className="absolute bottom-1.5 right-1.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-xs text-white backdrop-blur-sm transition-opacity group-hover:opacity-100 md:opacity-0"
                            >
                              <FontAwesomeIcon icon={faExpand} className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={photo.url}
                              download
                              aria-label={t('poi.downloadPhoto')}
                              title={t('poi.downloadPhoto')}
                              className="absolute bottom-1.5 left-1.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-xs text-white backdrop-blur-sm transition-opacity group-hover:opacity-100 md:opacity-0"
                            >
                              <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
                            </a>
                            {user?.id === photo.user.id && (
                              <button
                                onClick={() => deletePhoto(photo)}
                                aria-label={t('poi.deletePhoto')}
                                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-xs text-white transition-opacity group-hover:opacity-100 md:opacity-0"
                              >
                                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t('poi.comments', { count: poi.comments.length })}
                    </h3>
                    <ul className="space-y-3">
                      {poi.comments.map((c) => (
                        <li key={c.id} className="flex items-start gap-3">
                          <button
                            onClick={() => navigate(`/user/${c.user.id}`)}
                            aria-label={t('poi.viewUser', { name: c.user.name })}
                            className="shrink-0"
                          >
                            {c.user.avatarUrl ? (
                              <img src={c.user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/60">
                                {c.user.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </button>
                          <div className="glass flex-1 rounded-2xl rounded-tl-sm px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={() => navigate(`/user/${c.user.id}`)}
                                className="text-xs font-semibold text-slate-700 hover:text-brand-600 dark:text-slate-200"
                              >
                                {c.user.name}
                              </button>
                              {user?.id === c.user.id && (
                                <button
                                  onClick={() => deleteComment(c.id)}
                                  className="text-xs text-slate-400 transition-colors hover:text-rose-500"
                                >
                                  {t('poi.deleteComment')}
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">{c.content}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {poi.comments.length === 0 && (
                      <p className="glass rounded-xl px-3 py-4 text-center text-sm text-slate-400">
                        {t('poi.beFirst')}
                      </p>
                    )}
                  </section>
                </div>

                <form onSubmit={submitComment} className="flex gap-2 border-t border-slate-100 p-3 safe-bottom dark:border-slate-700">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t('poi.commentPlaceholder')}
                    className="glass h-11 flex-1 rounded-xl px-3.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <Button type="submit" disabled={!comment.trim() || sendingComment}>
                    {sendingComment ? <Spinner /> : t('poi.send')}
                  </Button>
                </form>

                {user?.id === poi.createdBy.id && (
                  <div className="border-t border-slate-100 p-3 dark:border-slate-700">
                    <Button variant="danger" onClick={deletePoi} className="w-full">
                      {t('poi.deletePoi')}
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </motion.aside>

          <AnimatePresence>
            {viewingPhoto && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setViewingPhoto(null)}
                className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/85 p-4"
              >
                <button
                  onClick={() => setViewingPhoto(null)}
                  aria-label={t('poi.close')}
                  className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
                <a
                  href={viewingPhoto.url}
                  download
                  aria-label={t('poi.downloadPhoto')}
                  title={t('poi.downloadPhoto')}
                  className="absolute bottom-4 right-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 sm:bottom-auto sm:right-16 sm:top-4"
                >
                  <FontAwesomeIcon icon={faDownload} className="h-5 w-5" />
                </a>
                <motion.figure
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-full"
                >
                  <img
                    src={viewingPhoto.url}
                    alt=""
                    className="max-h-[70dvh] w-auto rounded-2xl object-contain shadow-float"
                  />
                  <figcaption className="mt-3 flex items-center gap-3">
                    {viewingPhoto.user.avatarUrl ? (
                      <img
                        src={viewingPhoto.user.avatarUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover ring-2 ring-white/20"
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                        {viewingPhoto.user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">{viewingPhoto.user.name}</p>
                      <p className="text-xs text-white/60">{formatDate(viewingPhoto.createdAt)}</p>
                    </div>
                  </figcaption>
                </motion.figure>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
