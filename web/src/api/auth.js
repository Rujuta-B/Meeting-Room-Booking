// src/api/auth.js
import { apiFetch, setAccessToken } from './client.js';

export async function register(email, password) {
  const result = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
  setAccessToken(result.accessToken);
  return result.user;
}

export async function login(email, password) {
  const result = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setAccessToken(result.accessToken);
  return result.user;
}

// Used once on app mount to silently recover a session from the httpOnly
// refresh cookie - see auth/AuthContext.jsx. Deliberately does NOT throw
// on failure here; the caller decides what "no valid session" means (it
// means "render the app as logged out", not an error to surface).
export async function bootstrapSession() {
  try {
    const result = await apiFetch('/auth/refresh', { method: 'POST' });
    setAccessToken(result.accessToken);
    return result.user;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {}); // best-effort - we clear local state regardless
  setAccessToken(null);
}
