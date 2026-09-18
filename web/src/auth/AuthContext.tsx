// src/auth/AuthContext.tsx
//
// The ONLY global state in this app. Everything else (search filters,
// results, bookings lists) is fine as page-local state fetched through
// the api/ layer, since nothing else needs to be shared across pages -
// see the plan for why this app deliberately avoids Redux/Zustand.
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { registerSessionExpiredHandler } from '../api/client';
import type { User } from '../types/user';
import type { AuthContextValue, AuthStatus } from '../types/auth';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // 'checking' | 'authenticated' | 'anonymous' - see the big comment below
  // for why this three-state model (not just a boolean) matters.
  const [status, setStatus] = useState<AuthStatus>('checking');

  // WHY this runs on every mount, not just once "if needed": the access
  // token lives ONLY in memory (see api/client.ts) - it is gone the
  // instant the tab is closed or the page hard-refreshes. That's a
  // DELIBERATE tradeoff for XSS resistance (an in-memory value can't be
  // read by document.cookie/localStorage-scraping scripts the way a
  // persisted token could be), and this effect is how the app compensates
  // for the resulting UX cost: on every fresh load, silently ask the
  // backend "do I still have a valid session?" via the httpOnly refresh
  // cookie, which DID survive the reload (cookies persist; JS memory
  // doesn't). If that succeeds, the user never notices they were
  // "logged out" by the refresh at all.
  useEffect(() => {
    authApi.bootstrapSession().then((restoredUser) => {
      setUser(restoredUser);
      setStatus(restoredUser ? 'authenticated' : 'anonymous');
    });
  }, []);

  // Registered once so api/client.ts can force a logout from WITHIN a
  // failed request (e.g. the refresh-then-retry in apiFetch also fails)
  // without importing this module directly - see client.ts's comment on
  // why that would be a circular import.
  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const newUser = await authApi.register(email, password);
    setUser(newUser);
    setStatus('authenticated');
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await authApi.login(email, password);
    setUser(loggedInUser);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, register, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
