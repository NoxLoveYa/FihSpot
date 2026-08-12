import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../api/types';
import { api, clearToken, setToken } from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('fihspot_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const applyAuth = useCallback((token: string, user: User) => {
    setToken(token);
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
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, googleLogin, logout }),
    [user, loading, login, register, googleLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
