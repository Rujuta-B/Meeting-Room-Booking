// src/api/auth.ts
import { apiFetch, setAccessToken } from './client';
import type { User } from '../types/user';

interface AuthResult {
  user: User;
  accessToken: string;
}

export async function register(email: string, password: string): Promise<User> {
  const result = await apiFetch<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(result.accessToken);
  return result.user;
}

export async function login(email: string, password: string): Promise<User> {
  const result = await apiFetch<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(result.accessToken);
  return result.user;
}

// Used once on app mount to silently recover a session from the httpOnly
// refresh cookie - see auth/AuthContext.tsx. Deliberately does NOT throw
// on failure here; the caller decides what "no valid session" means (it
// means "render the app as logged out", not an error to surface).
export async function bootstrapSession(): Promise<User | null> {
  try {
    const result = await apiFetch<AuthResult>('/auth/refresh', { method: 'POST' });
    setAccessToken(result.accessToken);
    return result.user;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {}); // best-effort - we clear local state regardless
  setAccessToken(null);
}
