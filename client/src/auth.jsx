import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

/**
 * Session context.
 *
 * The browser never stores a token: the session lives in an httpOnly cookie set by
 * the server, and this context only mirrors the profile the server reports for the
 * current cookie. Authorization is always re-checked server-side on every request.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      const next = data?.user || null;
      setUser(next);
      return next;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setUser(data.user || null);
    return data.user || null;
  }, []);

  const adminLogin = useCallback(async (email, password) => {
    const data = await api.admin.login(email, password);
    setUser(data.user || null);
    return data.user || null;
  }, []);

  const register = useCallback(async (form) => api.register(form), []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, login, adminLogin, register, logout, setUser }),
    [user, loading, refresh, login, adminLogin, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const isAdmin = (user) => Boolean(user && user.role === 'admin');
export const isCustomer = (user) => Boolean(user && user.role === 'customer');
