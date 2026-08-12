export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
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
  user: Pick<User, 'id' | 'name'>;
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
