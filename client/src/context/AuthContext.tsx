import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../api/types';
import {
  api,
  ApiError,
  clearCachedUser,
  clearToken,
  getCachedUser,
  setCachedUser,
  setToken,
} from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Admin users, or users explicitly granted access, may use the spot search. */
  canSearch: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  const revalidate = useCallback(async () => {
    try {
      const { user: fresh } = await api.me();
      setUser(fresh);
      setCachedUser(fresh);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        clearCachedUser();
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!getCachedUser() && !localStorage.getItem('fihspot_token')) {
      setLoading(false);
      return;
    }
    revalidate().finally(() => setLoading(false));
  }, [revalidate]);

  useEffect(() => {
    const onOnline = () => {
      revalidate();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [revalidate]);

  const applyAuth = useCallback((token: string, user: User) => {
    setToken(token);
    setCachedUser(user);
    setUser(user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token, user } = await api.login({ email, password });
      applyAuth(token, user);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const { token, user } = await api.register({ name, email, password });
      applyAuth(token, user);
    },
    [applyAuth],
  );

  const googleLogin = useCallback(
    async (idToken: string) => {
      const { token, user } = await api.google(idToken);
      applyAuth(token, user);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    clearToken();
    clearCachedUser();
    setUser(null);
  }, []);

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
    setCachedUser(updated);
  }, []);

  const canSearch = user?.role === 'ADMIN' || user?.searchEnabled === true;

  const value = useMemo(
    () => ({ user, loading, canSearch, login, register, googleLogin, logout, updateUser }),
    [user, loading, canSearch, login, register, googleLogin, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
