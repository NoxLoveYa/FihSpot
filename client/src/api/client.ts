import type {
  AdminModerationComment,
  AdminModerationPhoto,
  AdminPoi,
  AdminStatsResponse,
  AdminUser,
  Bounds,
  Comment,
  Photo,
  PoI,
  PoISummary,
  Role,
  Search,
  User,
  UserContent,
} from './types';
import i18n from '../i18n';

const API_URL = '/api';

const TOKEN_KEY = 'fihspot_token';
const USER_KEY = 'fihspot_user';
const POIS_KEY = 'fihspot_pois';

// Longest we wait for any API call. Prevents the app from hanging forever on a
// request that never settles (e.g. a request stalled in the service worker on
// iOS after a cold start), which would otherwise leave the app stuck on the
// loading screen.
const REQUEST_TIMEOUT_MS = 15000;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearCachedUser() {
  localStorage.removeItem(USER_KEY);
}

/**
 * Last-fetched full POI list (world bounds), stored so the map can render the
 * points instantly on the next launch while the list revalidates in the
 * background. Best-effort: a failure must never break loading.
 */
export function getCachedPois(): PoISummary[] | null {
  try {
    const raw = localStorage.getItem(POIS_KEY);
    return raw ? (JSON.parse(raw) as PoISummary[]) : null;
  } catch {
    return null;
  }
}

export function setCachedPois(pois: PoISummary[]) {
  try {
    localStorage.setItem(POIS_KEY, JSON.stringify(pois));
  } catch {
    // ignore quota/security errors
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
  } catch {
    throw new ApiError(0, i18n.t('errors.noConnection'), 'NO_CONNECTION');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    clearToken();
    clearCachedUser();
  }

  if (!res.ok) {
    let message = i18n.t('errors.http', { status: res.status });
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      if (body.code) code = body.code;
    } catch {
      // ignore
    }
    if (code) {
      message = i18n.t(`errors.${code}`, { defaultValue: message });
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; name: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  google: (idToken: string) =>
    request<{ token: string; user: User }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  me: () => request<{ user: User }>('/auth/me'),
  authConfig: () => request<{ googleClientId: string | null }>('/auth/config'),

  // Profile
  meContent: () => request<UserContent>('/me'),
  user: (id: string) => request<UserContent>(`/users/${id}`),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return request<{ user: User }>('/me/avatar', { method: 'POST', body: form });
  },

  // PoIs
  listPois: (bounds?: Bounds, opts?: { lastComment?: boolean }) => {
    const params: string[] = [];
    if (bounds) {
      params.push(`swLat=${bounds.swLat}&swLng=${bounds.swLng}&neLat=${bounds.neLat}&neLng=${bounds.neLng}`);
    }
    if (opts?.lastComment) params.push('lastComment=1');
    const qs = params.length ? `?${params.join('&')}` : '';
    return request<{ pois: PoISummary[] }>(`/pois${qs}`);
  },
  getPoi: (id: string) => request<{ poi: PoI }>(`/pois/${id}`),
  createPoi: (data: { name: string; description?: string; category?: string; lat: number; lng: number }) =>
    request<{ poi: PoISummary }>('/pois', { method: 'POST', body: JSON.stringify(data) }),
  updatePoi: (id: string, data: { name: string; description?: string; category?: string }) =>
    request<{ poi: PoISummary }>(`/pois/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePoi: (id: string) => request<void>(`/pois/${id}`, { method: 'DELETE' }),

  // Seen tracking
  markSeen: (poiId: string) => request<{ seen: boolean }>(`/pois/${poiId}/seen`, { method: 'POST' }),
  unmarkSeen: (poiId: string) => request<{ seen: boolean }>(`/pois/${poiId}/seen`, { method: 'DELETE' }),

  // Saved searches
  createSearch: (data: { name?: string; lat: number; lng: number; zoom: number }) =>
    request<{ search: Search }>('/searches', { method: 'POST', body: JSON.stringify(data) }),
  listSearches: () => request<{ searches: Search[] }>('/searches'),
  updateSearch: (id: string, data: { name: string }) =>
    request<{ search: Search }>(`/searches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSearch: (id: string) => request<void>(`/searches/${id}`, { method: 'DELETE' }),

  // Comments
  addComment: (poiId: string, content: string) =>
    request<{ comment: Comment }>(`/pois/${poiId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  deleteComment: (commentId: string) => request<void>(`/pois/comments/${commentId}`, { method: 'DELETE' }),

  // Photos
  uploadPhoto: (poiId: string, file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return request<{ photo: Photo }>(`/pois/${poiId}/photos`, { method: 'POST', body: form });
  },
  deletePhoto: (photoId: string) => request<void>(`/pois/photos/${photoId}`, { method: 'DELETE' }),

  // Admin
  adminStats: () => request<AdminStatsResponse>('/admin/stats'),
  listUsers: (params: { search?: string; sort?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.page) qs.set('page', String(params.page));
    const q = qs.toString();
    return request<{ users: AdminUser[]; total: number; page: number; pages: number }>(`/admin/users${q ? `?${q}` : ''}`);
  },
  updateUserAdmin: (
    id: string,
    data: { name?: string; email?: string; role?: Role; password?: string; searchEnabled?: boolean },
  ) => request<{ user: AdminUser }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUserAdmin: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  listPoisAdmin: (params: { search?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.page) qs.set('page', String(params.page));
    const q = qs.toString();
    return request<{ pois: AdminPoi[]; total: number; page: number; pages: number }>(`/admin/pois${q ? `?${q}` : ''}`);
  },
  updatePoiAdmin: (id: string, data: { name?: string; description?: string | null; category?: string | null; demo?: boolean }) =>
    request<{ poi: AdminPoi }>(`/admin/pois/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePoiAdmin: (id: string) => request<void>(`/admin/pois/${id}`, { method: 'DELETE' }),
  moderation: () =>
    request<{ comments: AdminModerationComment[]; photos: AdminModerationPhoto[] }>('/admin/moderation'),
  deleteCommentAdmin: (id: string) => request<void>(`/admin/comments/${id}`, { method: 'DELETE' }),
  deletePhotoAdmin: (id: string) => request<void>(`/admin/photos/${id}`, { method: 'DELETE' }),
};
