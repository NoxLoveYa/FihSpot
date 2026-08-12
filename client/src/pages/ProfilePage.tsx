import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { UserContent } from '../api/types';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner, Skeleton } from '../components/Spinner';
import { ThemeToggle } from '../components/ThemeToggle';

type Tab = 'pois' | 'comments' | 'photos';

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

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [content, setContent] = useState<UserContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pois');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .meContent()
      .then((data) => setContent(data))
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Erreur de chargement', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { user: updated } = await api.uploadAvatar(file);
      updateUser(updated);
      toast('Photo de profil mise à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur d\'upload', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const goToPoi = useCallback(
    (poiId: string) => {
      navigate(`/?poi=${poiId}`);
    },
    [navigate],
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pois', label: 'Points', count: content?.stats.pois ?? 0 },
    { key: 'comments', label: 'Commentaires', count: content?.stats.comments ?? 0 },
    { key: 'photos', label: 'Photos', count: content?.stats.photos ?? 0 },
  ];

  return (
    <div className="min-h-full overflow-y-auto bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/80">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
            <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour
        </button>
        <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Mon profil</h1>
        <ThemeToggle className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200" />
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="mb-6 flex flex-col items-center gap-4 rounded-3xl bg-white p-6 shadow-soft dark:bg-slate-800">
          <div className="relative">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-brand-100 ring-4 ring-white dark:ring-slate-800">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-brand-600">
                  {user?.name.charAt(0).toUpperCase()}
                </span>
              )}
              {uploading && (
                <div className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
                  <Spinner className="h-6 w-6" />
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Changer la photo de profil"
              title="Changer la photo de profil"
              className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-sm text-slate-600 shadow-soft transition-transform hover:scale-105 active:scale-95 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              📷
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
          </div>

          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{user?.name}</h2>
            <p className="text-sm text-slate-400">{user?.email}</p>
            {content && (
              <p className="mt-1 text-xs text-slate-400">
                Membre depuis le {formatDate(content.user.createdAt)}
              </p>
            )}
          </div>

          <div className="grid w-full max-w-xs grid-cols-3 gap-2 text-center">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-xl px-2 py-2 transition-colors ${
                  tab === t.key ? 'bg-brand-50 dark:bg-brand-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <span className="block text-lg font-extrabold text-slate-800 dark:text-slate-100">{t.count}</span>
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex gap-1 rounded-2xl bg-white p-1 shadow-soft dark:bg-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !content ? (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-800">
            Impossible de charger le profil.
          </p>
        ) : (
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {tab === 'pois' &&
              (content.pois.length === 0 ? (
                <EmptyState message="Vous n'avez pas encore créé de point." />
              ) : (
                <ul className="space-y-2.5">
                  {content.pois.map((poi) => (
                    <li key={poi.id}>
                      <button
                        onClick={() => goToPoi(poi.id)}
                        className="w-full rounded-2xl bg-white p-4 text-left shadow-soft transition-shadow hover:shadow-float dark:bg-slate-800"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                            {poi.name}
                          </span>
                          {poi.category && (
                            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                              {categoryLabels[poi.category] ?? poi.category}
                            </span>
                          )}
                        </div>
                        {poi.description && (
                          <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
                            {poi.description}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-slate-400">
                          💬 {poi._count.comments} · 📷 {poi._count.photos} · {formatDate(poi.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === 'comments' &&
              (content.comments.length === 0 ? (
                <EmptyState message="Vous n'avez pas encore laissé de commentaire." />
              ) : (
                <ul className="space-y-2.5">
                  {content.comments.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => goToPoi(c.poi.id)}
                        className="w-full rounded-2xl bg-white p-4 text-left shadow-soft transition-shadow hover:shadow-float dark:bg-slate-800"
                      >
                        <p className="text-sm text-slate-700 dark:text-slate-200">{c.content}</p>
                        <p className="mt-2 text-xs text-slate-400">
                          Sur <span className="font-semibold text-brand-600 dark:text-brand-300">{c.poi.name}</span> ·{' '}
                          {formatDate(c.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === 'photos' &&
              (content.photos.length === 0 ? (
                <EmptyState message="Vous n'avez pas encore publié de photo." />
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {content.photos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goToPoi(p.poi.id)}
                      className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-soft"
                    >
                      <img
                        src={p.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-6 text-left text-xs font-medium text-white">
                        {p.poi.name}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-800">
      {message}
    </p>
  );
}
