import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setUnauthorizedHandler } from '../services/api';
import { authApi } from '../services/endpoints';
import type { Role, SessionUser } from '../types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (role: Role, identifier: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    authApi.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Session expired mid-use → back to the login screen.
    setUnauthorizedHandler(() => {
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  const login = useCallback(async (role: Role, identifier: string, password: string) => {
    const u = await authApi.login(role, identifier, password);
    qc.clear();
    setUser(u);
    return u;
  }, [qc]);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    qc.clear();
    setUser(null);
  }, [qc]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
