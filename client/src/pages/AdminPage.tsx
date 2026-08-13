import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCamera,
  faComment,
  faDownload,
  faExpand,
  faFish,
  faMapPin,
  faPenToSquare,
  faShieldHalved,
  faTrash,
  faUserGroup,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { AdminModerationComment, AdminModerationPhoto, AdminPoi, AdminStatsResponse, AdminUser, Role } from '../api/types';
import { api, ApiError } from '../api/client';
import { useToast } from '../context/ToastContext';
import { staticMapUrl } from '../lib/googleMaps';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Spinner, Skeleton } from '../components/Spinner';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';
import { useAuth } from '../context/AuthContext';
import i18n from '../i18n';

type Tab = 'overview' | 'users' | 'pois' | 'moderation';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="glass-strong flex flex-col gap-1.5 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();
  if (role !== 'ADMIN') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
      <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
      {t('admin.users.adminBadge')}
    </span>
  );
}

function Avatar({ url, name, size = 'h-9 w-9' }: { url: string | null; name: string; size?: string }) {
  if (url) return <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/60`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Pagination({ page, pages, onChange, disabled }: { page: number; pages: number; onChange: (p: number) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button variant="secondary" disabled={page <= 1 || disabled} onClick={() => onChange(page - 1)} className="min-h-[38px] px-3 py-1.5 text-xs">
        {t('admin.prev')}
      </Button>
      <span className="text-xs font-medium text-slate-500">
        {page} / {pages}
      </span>
      <Button variant="secondary" disabled={page >= pages || disabled} onClick={() => onChange(page + 1)} className="min-h-[38px] px-3 py-1.5 text-xs">
        {t('admin.next')}
      </Button>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('admin.actions.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdminPoiCard({
  poi,
  onEdit,
  onToggleDemo,
  onDelete,
  busy,
}: {
  poi: AdminPoi;
  onEdit: () => void;
  onToggleDemo: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const mapUrl = staticMapUrl(poi.lat, poi.lng, '600x300');

  return (
    <div className="glass-strong group flex cursor-pointer flex-col overflow-hidden rounded-3xl text-left transition-all hover:-translate-y-1 hover:shadow-float">
      <div className="relative aspect-[2/1] w-full overflow-hidden">
        {mapUrl && !imgError ? (
          <img
            src={mapUrl}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2563eb22, #2563eb55)' }}
          >
            <FontAwesomeIcon icon={faFish} className="h-10 w-10 text-white/90" />
          </div>
        )}
        {poi.demo && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-brand-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-soft backdrop-blur">
            {t('admin.pois.demo')}
          </span>
        )}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleDemo();
            }}
            disabled={busy}
            title={poi.demo ? 'Un-demo' : 'Demo'}
            className="glass grid h-9 w-9 place-items-center rounded-full text-slate-700 transition-all hover:scale-105 hover:brightness-110 active:scale-95 dark:text-slate-200"
          >
            <FontAwesomeIcon icon={faShieldHalved} className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            disabled={busy}
            title={t('admin.pois.edit')}
            className="glass grid h-9 w-9 place-items-center rounded-full text-slate-700 transition-all hover:scale-105 hover:brightness-110 active:scale-95 dark:text-slate-200"
          >
            <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={busy}
            title={t('admin.pois.delete')}
            className="grid h-9 w-9 place-items-center rounded-full bg-rose-600/90 text-white shadow-soft transition-all hover:scale-105 hover:bg-rose-600 active:scale-95"
          >
            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-base font-bold text-slate-800 dark:text-slate-100">{poi.name}</h3>
        {poi.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{poi.description}</p>
        ) : (
          <p className="text-sm italic text-slate-400 dark:text-slate-500">{t('pois.noDescription')}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/user/${poi.createdBy.id}`);
            }}
            className="flex min-w-0 items-center gap-2"
          >
            {poi.createdBy.avatarUrl ? (
              <img src={poi.createdBy.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-900/60">
                {poi.createdBy.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-xs text-slate-400 hover:text-brand-600">{poi.createdBy.name}</span>
          </button>
          <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faComment} className="h-3 w-3" />
              {poi._count.comments}
            </span>
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faCamera} className="h-3 w-3" />
              {poi._count.photos}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-slate-300 dark:text-slate-500">{formatDate(poi.createdAt)}</span>
      </div>
    </div>
  );
}

interface EditUser {
  user: AdminUser;
  name: string;
  email: string;
  password: string;
}

interface EditPoi {
  poi: AdminPoi;
  name: string;
  description: string;
  category: string;
  demo: boolean;
}

export function AdminPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('overview');

  // Overview
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState('newest');
  const [usersLoading, setUsersLoading] = useState(true);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<EditUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

  // POIs
  const [pois, setPois] = useState<AdminPoi[]>([]);
  const [poiPage, setPoiPage] = useState(1);
  const [poiPages, setPoiPages] = useState(1);
  const [poiTotal, setPoiTotal] = useState(0);
  const [poiSearch, setPoiSearch] = useState('');
  const [poisLoading, setPoisLoading] = useState(true);
  const [busyPoi, setBusyPoi] = useState<string | null>(null);
  const [editingPoi, setEditingPoi] = useState<EditPoi | null>(null);
  const [deletingPoi, setDeletingPoi] = useState<AdminPoi | null>(null);

  // Moderation
  const [modComments, setModComments] = useState<AdminModerationComment[]>([]);
  const [modPhotos, setModPhotos] = useState<AdminModerationPhoto[]>([]);
  const [modLoading, setModLoading] = useState(true);
  const [busyComment, setBusyComment] = useState<string | null>(null);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<AdminModerationPhoto | null>(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await api.adminStats());
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setStatsLoading(false);
    }
  }, [toast, t]);

  const loadUsers = useCallback(
    async (page: number, search: string, sort: string) => {
      setUsersLoading(true);
      try {
        const res = await api.listUsers({ page, search, sort });
        setUsers(res.users);
        setUserPages(res.pages);
        setUserTotal(res.total);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
      } finally {
        setUsersLoading(false);
      }
    },
    [toast, t],
  );

  const loadPois = useCallback(
    async (page: number, search: string) => {
      setPoisLoading(true);
      try {
        const res = await api.listPoisAdmin({ page, search });
        setPois(res.pois);
        setPoiPages(res.pages);
        setPoiTotal(res.total);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
      } finally {
        setPoisLoading(false);
      }
    },
    [toast, t],
  );

  const loadModeration = useCallback(async () => {
    setModLoading(true);
    try {
      const res = await api.moderation();
      setModComments(res.comments);
      setModPhotos(res.photos);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setModLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab === 'users') loadUsers(userPage, userSearch, userSort);
  }, [tab, userPage, userSearch, userSort, loadUsers]);

  useEffect(() => {
    if (tab === 'pois') loadPois(poiPage, poiSearch);
  }, [tab, poiPage, poiSearch, loadPois]);

  useEffect(() => {
    if (tab === 'moderation') loadModeration();
  }, [tab, loadModeration]);

  const handleUserSearch = (value: string) => {
    setUserSearch(value);
    setUserPage(1);
  };

  const handlePoiSearch = (value: string) => {
    setPoiSearch(value);
    setPoiPage(1);
  };

  async function toggleUserRole(target: AdminUser) {
    const next: Role = target.role === 'ADMIN' ? 'USER' : 'ADMIN';
    setBusyUser(target.id);
    try {
      await api.updateUserAdmin(target.id, { role: next });
      toast(t('admin.users.saved'), 'success');
      loadUsers(userPage, userSearch, userSort);
      loadStats();
      if (target.id === user?.id) {
        window.location.reload();
        return;
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyUser(null);
    }
  }

  async function confirmDeleteUser() {
    if (!deletingUser) return;
    setBusyUser(deletingUser.id);
    try {
      await api.deleteUserAdmin(deletingUser.id);
      toast(t('admin.users.deleted'), 'success');
      setDeletingUser(null);
      loadUsers(userPage, userSearch, userSort);
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyUser(null);
    }
  }

  async function saveUser() {
    if (!editingUser) return;
    setBusyUser(editingUser.user.id);
    try {
      await api.updateUserAdmin(editingUser.user.id, {
        name: editingUser.name,
        email: editingUser.email,
        password: editingUser.password || undefined,
      });
      toast(t('admin.users.saved'), 'success');
      setEditingUser(null);
      loadUsers(userPage, userSearch, userSort);
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyUser(null);
    }
  }

  async function confirmDeletePoi() {
    if (!deletingPoi) return;
    setBusyPoi(deletingPoi.id);
    try {
      await api.deletePoiAdmin(deletingPoi.id);
      toast(t('admin.pois.deleted'), 'success');
      setDeletingPoi(null);
      loadPois(poiPage, poiSearch);
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyPoi(null);
    }
  }

  async function togglePoiDemo(poi: AdminPoi) {
    setBusyPoi(poi.id);
    try {
      await api.updatePoiAdmin(poi.id, { demo: !poi.demo });
      toast(t('admin.pois.saved'), 'success');
      loadPois(poiPage, poiSearch);
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyPoi(null);
    }
  }

  async function savePoi() {
    if (!editingPoi) return;
    setBusyPoi(editingPoi.poi.id);
    try {
      await api.updatePoiAdmin(editingPoi.poi.id, {
        name: editingPoi.name,
        description: editingPoi.description || null,
        category: editingPoi.category || null,
        demo: editingPoi.demo,
      });
      toast(t('admin.pois.saved'), 'success');
      setEditingPoi(null);
      loadPois(poiPage, poiSearch);
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyPoi(null);
    }
  }

  async function deleteComment(c: AdminModerationComment) {
    setBusyComment(c.id);
    try {
      await api.deleteCommentAdmin(c.id);
      toast(t('admin.mod.commentDeleted'), 'success');
      setModComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyComment(null);
    }
  }

  async function deletePhoto(p: AdminModerationPhoto) {
    setBusyPhoto(p.id);
    try {
      await api.deletePhotoAdmin(p.id);
      toast(t('admin.mod.photoDeleted'), 'success');
      setModPhotos((prev) => prev.filter((x) => x.id !== p.id));
      loadStats();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('admin.loadError'), 'error');
    } finally {
      setBusyPhoto(null);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('admin.tab.overview') },
    { key: 'users', label: t('admin.tab.users') },
    { key: 'pois', label: t('admin.tab.pois') },
    { key: 'moderation', label: t('admin.tab.moderation') },
  ];

  return (
    <div className="min-h-full overflow-y-auto bg-slate-50 dark:bg-slate-900">
      <header className="glass sticky top-0 z-40 flex items-center justify-between px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          {t('admin.back')}
        </button>
        <h1 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
          <FontAwesomeIcon icon={faShieldHalved} className="h-4 w-4 text-amber-500" />
          {t('admin.title')}
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-slate-600 dark:text-slate-200" />
          <LanguageToggle className="text-slate-600 dark:text-slate-200" />
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="glass mb-6 flex gap-1 rounded-2xl p-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                tab === tb.key ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/50'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div>
            {statsLoading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              stats && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <StatCard label={t('admin.stats.users')} value={stats.stats.users} icon={<FontAwesomeIcon icon={faUserGroup} />} />
                    <StatCard label={t('admin.stats.pois')} value={stats.stats.pois} icon={<FontAwesomeIcon icon={faMapPin} />} />
                    <StatCard label={t('admin.stats.comments')} value={stats.stats.comments} icon={<FontAwesomeIcon icon={faComment} />} />
                    <StatCard label={t('admin.stats.photos')} value={stats.stats.photos} icon={<FontAwesomeIcon icon={faCamera} />} />
                    <StatCard label={t('admin.stats.demoPois')} value={stats.stats.demoPois} icon={<FontAwesomeIcon icon={faShieldHalved} />} />
                  </div>

                  <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('admin.stats.recentUsers')}
                  </h2>
                  <div className="glass-strong divide-y divide-slate-200/60 overflow-hidden rounded-2xl dark:divide-slate-700">
                    {stats.recentUsers.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                        <Avatar url={u.avatarUrl} name={u.name} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {u.name}
                            <RoleBadge role={u.role} />
                          </p>
                          <p className="truncate text-xs text-slate-400">{u.email}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{formatDate(u.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        )}

        {tab === 'users' && (
          <div>
            <div className="glass mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-2xl px-3.5">
                <FontAwesomeIcon icon={faUserGroup} className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={userSearch}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  placeholder={t('admin.users.search')}
                  className="h-11 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </div>
              <div className="px-3 pb-2 sm:pb-0">
                <select
                  value={userSort}
                  onChange={(e) => {
                    setUserSort(e.target.value);
                    setUserPage(1);
                  }}
                  className="rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold outline-none dark:bg-slate-800"
                  aria-label={t('admin.users.role')}
                >
                  <option value="newest">{t('pois.sort.newest')}</option>
                  <option value="name">{t('fields.name')}</option>
                  <option value="role">{t('admin.users.role')}</option>
                </select>
              </div>
            </div>

            {usersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="glass rounded-2xl px-4 py-8 text-center text-sm text-slate-400">{t('admin.users.noResults')}</p>
            ) : (
              <>
                <div className="glass-strong divide-y divide-slate-200/60 overflow-hidden rounded-2xl dark:divide-slate-700">
                  {users.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Avatar url={u.avatarUrl} name={u.name} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {u.name}
                          <RoleBadge role={u.role} />
                        </p>
                        <p className="truncate text-xs text-slate-400">{u.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                        <span>{u._count.pois} {t('profile.points')}</span>
                        <span>{u._count.comments} {t('profile.comments')}</span>
                        <span>{u._count.photos} {t('profile.photos')}</span>
                      </div>
                      <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{formatDate(u.createdAt)}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setEditingUser({ user: u, name: u.name, email: u.email, password: '' })
                          }
                          disabled={busyUser === u.id}
                          className="min-h-[36px] px-3 py-1.5 text-xs"
                        >
                          {t('admin.users.edit')}
                        </Button>
                        {u.id !== user?.id && (
                          <Button
                            variant={u.role === 'ADMIN' ? 'secondary' : 'primary'}
                            onClick={() => toggleUserRole(u)}
                            disabled={busyUser === u.id}
                            className="min-h-[36px] px-3 py-1.5 text-xs"
                          >
                            {u.role === 'ADMIN' ? t('admin.users.demote') : t('admin.users.promote')}
                          </Button>
                        )}
                        {u.id !== user?.id && (
                          <Button
                            variant="danger"
                            onClick={() => setDeletingUser(u)}
                            disabled={busyUser === u.id}
                            className="min-h-[36px] px-3 py-1.5 text-xs"
                          >
                            {t('admin.users.delete')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-slate-400">{t('admin.users.total', { count: userTotal })}</p>
                <Pagination page={userPage} pages={userPages} onChange={setUserPage} />
              </>
            )}
          </div>
        )}

        {tab === 'pois' && (
          <div>
            <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-3.5">
              <FontAwesomeIcon icon={faMapPin} className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={poiSearch}
                onChange={(e) => handlePoiSearch(e.target.value)}
                placeholder={t('admin.pois.search')}
                className="h-11 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
            </div>

            {poisLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="glass-strong overflow-hidden rounded-3xl">
                    <Skeleton className="h-36 w-full rounded-none" />
                    <div className="flex flex-col gap-2 p-4">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pois.length === 0 ? (
              <p className="glass rounded-2xl px-4 py-8 text-center text-sm text-slate-400">{t('admin.pois.noResults')}</p>
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {pois.map((p) => (
                    <AdminPoiCard
                      key={p.id}
                      poi={p}
                      busy={busyPoi === p.id}
                      onEdit={() => setEditingPoi({ poi: p, name: p.name, description: p.description ?? '', category: p.category ?? '', demo: p.demo })}
                      onToggleDemo={() => togglePoiDemo(p)}
                      onDelete={() => setDeletingPoi(p)}
                    />
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-slate-400">{t('admin.pois.total', { count: poiTotal })}</p>
                <Pagination page={poiPage} pages={poiPages} onChange={setPoiPage} />
              </>
            )}
          </div>
        )}

        {tab === 'moderation' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <FontAwesomeIcon icon={faComment} className="h-3.5 w-3.5" />
                {t('admin.mod.comments')}
              </h2>
              {modLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                  ))}
                </div>
              ) : modComments.length === 0 ? (
                <p className="glass rounded-2xl px-4 py-8 text-center text-sm text-slate-400">{t('admin.mod.noComments')}</p>
              ) : (
                <div className="space-y-3">
                  {modComments.map((c) => (
                    <div key={c.id} className="glass-strong rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <Avatar url={c.user.avatarUrl} name={c.user.name} size="h-9 w-9" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.user.name}</span>
                            <span className="text-xs text-slate-400">{formatDate(c.createdAt)}</span>
                          </div>
                          <p className="mt-1.5 rounded-xl rounded-tl-sm bg-slate-100/80 px-3 py-2 text-sm leading-relaxed text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                            {c.content}
                          </p>
                          <button
                            onClick={() => navigate(`/?poi=${c.poi.id}`)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
                          >
                            <FontAwesomeIcon icon={faMapPin} className="h-3 w-3" />
                            <span className="line-clamp-1">{c.poi.name}</span>
                          </button>
                        </div>
                        <button
                          onClick={() => deleteComment(c)}
                          disabled={busyComment === c.id}
                          title={t('admin.mod.deleteComment')}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                        >
                          {busyComment === c.id ? <Spinner className="h-3.5 w-3.5" /> : <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <FontAwesomeIcon icon={faCamera} className="h-3.5 w-3.5" />
                {t('admin.mod.photos')}
              </h2>
              {modLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
                  ))}
                </div>
              ) : modPhotos.length === 0 ? (
                <p className="glass rounded-2xl px-4 py-8 text-center text-sm text-slate-400">{t('admin.mod.noPhotos')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {modPhotos.map((p) => (
                    <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl">
                      <button onClick={() => setViewingPhoto(p)} aria-label={t('poi.viewPhoto')} title={t('poi.viewPhoto')} className="block h-full w-full">
                        <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                      </button>
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">
                        {p.poi.name}
                      </span>
                      <div className="absolute right-1 top-1 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <button
                          onClick={() => setViewingPhoto(p)}
                          aria-label={t('poi.viewPhoto')}
                          title={t('poi.viewPhoto')}
                          className="grid h-6 w-6 place-items-center rounded-full bg-black/50 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                        >
                          <FontAwesomeIcon icon={faExpand} className="h-2.5 w-2.5" />
                        </button>
                        <a
                          href={p.url}
                          download
                          aria-label={t('poi.downloadPhoto')}
                          title={t('poi.downloadPhoto')}
                          className="grid h-6 w-6 place-items-center rounded-full bg-black/50 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                        >
                          <FontAwesomeIcon icon={faDownload} className="h-2.5 w-2.5" />
                        </a>
                        <button
                          onClick={() => deletePhoto(p)}
                          disabled={busyPhoto === p.id}
                          title={t('admin.mod.deletePhoto')}
                          className="grid h-6 w-6 place-items-center rounded-full bg-black/50 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-rose-600"
                        >
                          {busyPhoto === p.id ? <Spinner className="h-2.5 w-2.5" /> : <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {deletingUser && (
        <ConfirmModal
          title={t('admin.users.delete')}
          message={t('admin.users.confirmDelete', { name: deletingUser.name })}
          confirmLabel={t('admin.users.delete')}
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeletingUser(null)}
        />
      )}

      {deletingPoi && (
        <ConfirmModal
          title={t('admin.pois.delete')}
          message={t('admin.pois.confirmDelete', { name: deletingPoi.name })}
          confirmLabel={t('admin.pois.delete')}
          onConfirm={confirmDeletePoi}
          onCancel={() => setDeletingPoi(null)}
        />
      )}

      {editingUser && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingUser(null)} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveUser();
            }}
            className="glass-strong relative w-full max-w-sm rounded-3xl p-6"
          >
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{editingUser.user.name}</h3>
            <div className="mt-4 flex flex-col gap-3">
              <Input label={t('fields.name')} value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} required />
              <Input label={t('fields.email')} type="email" value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} required />
              <Input label={t('admin.password')} type="password" value={editingUser.password} onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditingUser(null)}>
                {t('admin.actions.cancel')}
              </Button>
              <Button type="submit" disabled={busyUser === editingUser.user.id}>
                {busyUser === editingUser.user.id ? <Spinner /> : t('admin.actions.save')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {editingPoi && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingPoi(null)} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePoi();
            }}
            className="glass-strong relative w-full max-w-md rounded-3xl p-6"
          >
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{editingPoi.poi.name}</h3>
            <div className="mt-4 flex flex-col gap-3">
              <Input label={t('fields.name')} value={editingPoi.name} onChange={(e) => setEditingPoi({ ...editingPoi, name: e.target.value })} required />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('addPoi.description')}</span>
                <textarea
                  value={editingPoi.description}
                  onChange={(e) => setEditingPoi({ ...editingPoi, description: e.target.value })}
                  rows={3}
                  className="glass w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </label>
              <Input
                label="Category"
                value={editingPoi.category}
                onChange={(e) => setEditingPoi({ ...editingPoi, category: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={editingPoi.demo}
                  onChange={(e) => setEditingPoi({ ...editingPoi, demo: e.target.checked })}
                  className="h-4 w-4 rounded accent-brand-600"
                />
                {t('admin.pois.demo')}
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setEditingPoi(null)}>
                {t('admin.actions.cancel')}
              </Button>
              <Button type="submit" disabled={busyPoi === editingPoi.poi.id}>
                {busyPoi === editingPoi.poi.id ? <Spinner /> : t('admin.actions.save')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setViewingPhoto(null)}
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
            className="absolute bottom-4 right-4 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <FontAwesomeIcon icon={faDownload} className="h-5 w-5" />
          </a>
          <figure className="max-w-full" onClick={(e) => e.stopPropagation()}>
            <img src={viewingPhoto.url} alt="" className="max-h-[70dvh] w-auto rounded-2xl object-contain shadow-float" />
            <figcaption className="mt-3 flex items-center gap-3">
              <Avatar url={viewingPhoto.user.avatarUrl} name={viewingPhoto.user.name} size="h-9 w-9" />
              <div>
                <p className="text-sm font-semibold text-white">{viewingPhoto.user.name}</p>
                <p className="text-xs text-white/60">
                  {viewingPhoto.poi.name} · {formatDate(viewingPhoto.createdAt)}
                </p>
              </div>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
