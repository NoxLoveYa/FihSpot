export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
}

export interface PoISummary {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  category: string | null;
  createdBy: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  _count: { comments: number; photos: number };
  createdAt: string;
  comments?: Comment[];
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}

export interface Photo {
  id: string;
  url: string;
  createdAt: string;
  user: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}

export interface PoI extends Omit<PoISummary, '_count' | 'createdBy'> {
  createdBy: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  comments: Comment[];
  photos: Photo[];
}

export interface Bounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface UserPoi {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  lat: number;
  lng: number;
  createdAt: string;
  _count: { comments: number; photos: number };
}

export interface UserComment {
  id: string;
  content: string;
  createdAt: string;
  poi: { id: string; name: string; lat: number; lng: number };
}

export interface UserPhoto {
  id: string;
  url: string;
  createdAt: string;
  poi: { id: string; name: string; lat: number; lng: number };
}

export interface UserContent {
  user: User;
  stats: { pois: number; comments: number; photos: number };
  pois: UserPoi[];
  comments: UserComment[];
  photos: UserPhoto[];
}

export interface AdminStats {
  users: number;
  pois: number;
  comments: number;
  photos: number;
  demoPois: number;
}

export interface AdminStatsResponse {
  stats: AdminStats;
  recentUsers: Array<Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'role' | 'createdAt'>>;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
  _count: { pois: number; comments: number; photos: number };
}

export interface AdminPoi {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  demo: boolean;
  createdAt: string;
  createdBy: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  _count: { comments: number; photos: number };
}

export interface AdminModerationComment extends Comment {
  poi: { id: string; name: string };
}

export interface AdminModerationPhoto extends Photo {
  poi: { id: string; name: string };
}
