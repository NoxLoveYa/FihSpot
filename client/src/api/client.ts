import type { Bounds, Comment, Photo, PoI, PoISummary, User } from './types';

const API_URL = '/api';

const TOKEN_KEY = 'fihspot_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
  }

  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
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

  // PoIs
  listPois: (bounds?: Bounds) => {
    const qs = bounds
      ? `?swLat=${bounds.swLat}&swLng=${bounds.swLng}&neLat=${bounds.neLat}&neLng=${bounds.neLng}`
      : '';
    return request<{ pois: PoISummary[] }>(`/pois${qs}`);
  },
  getPoi: (id: string) => request<{ poi: PoI }>(`/pois/${id}`),
  createPoi: (data: { name: string; description?: string; category?: string; lat: number; lng: number }) =>
    request<{ poi: PoISummary }>('/pois', { method: 'POST', body: JSON.stringify(data) }),
  updatePoi: (id: string, data: { name: string; description?: string; category?: string }) =>
    request<{ poi: PoISummary }>(`/pois/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePoi: (id: string) => request<void>(`/pois/${id}`, { method: 'DELETE' }),

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
};
