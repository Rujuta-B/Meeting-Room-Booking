// src/api/client.js
//
// This is the single most integration-critical file in the frontend - the
// one piece of logic here that a React-only background wouldn't already
// know how to write, because it's specifically about how a React app
// stays correctly authenticated against a real backend over time, not
// about React itself.
//
// THE PATTERN: the access token lives ONLY in memory (never localStorage,
// never a readable cookie) - see auth/AuthContext.jsx for why (XSS
// resistance: a script that can run on this page cannot read
// document.cookie for an httpOnly cookie, and it can't read this module's
// private `accessToken` variable from outside this module either). The
// refresh token lives ONLY in an httpOnly cookie the browser manages
// automatically - this file never sees its actual value, only whether a
// refresh attempt succeeded or failed.
import { ApiError } from '../lib/ApiError.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** @type {string | null} */
let accessToken = null;

/** @type {Promise<string> | null} */
let refreshPromise = null;

/** @type {(() => void) | null} */
let onSessionExpired = null;

// Called once from AuthContext, so this module can trigger "log the user
// out and send them to /login" WITHOUT importing React/the router directly
// - that would create a circular import (AuthContext imports this file to
// make API calls; this file would need to import AuthContext back to log
// out). A plain callback breaks that cycle.
export function registerSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken() {
  // WHY de-dupe concurrent refresh attempts with a SHARED in-flight
  // promise: imagine a page that fires three parallel API calls (e.g.
  // room search + "my bookings" + a room list) right at the moment the
  // access token expires. Without this, all three would independently hit
  // /auth/refresh at nearly the same instant. Because the backend ROTATES
  // refresh tokens (auth.service.ts: each refresh issues a new one and
  // revokes the old), only the FIRST of those three refresh calls would
  // succeed - the other two would arrive with an already-revoked cookie
  // and fail, incorrectly logging the user out even though their session
  // was actually fine. Sharing one in-flight promise means all three
  // callers await the exact same single refresh attempt instead of racing
  // each other.
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // sends the httpOnly refresh cookie automatically - this file never touches its value directly
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh failed');
        const body = await res.json();
        accessToken = body.accessToken;
        return body.accessToken;
      })
      .finally(() => {
        refreshPromise = null; // clear so the NEXT genuine 401 (later) triggers a fresh refresh, not a stale cached promise
      });
  }
  return refreshPromise;
}

/**
 * The one function every page/component uses to talk to the API. Handles
 * attaching the access token, and transparently recovering from an
 * expired one - callers never need to think about refresh logic
 * themselves.
 *
 * @param {string} path - e.g. '/rooms/search?...'
 * @param {RequestInit} [options]
 */
export async function apiFetch(path, options = {}) {
  const doFetch = (token) =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Harmless on routes that don't need the cookie, and REQUIRED on
      // /auth/refresh - included everywhere so we never have to remember
      // to add it per-call.
      credentials: 'include',
    });

  let res = await doFetch(accessToken);

  if (res.status === 401 && path !== '/auth/refresh') {
    // The access token expired mid-session - this is the NORMAL case, not
    // a bug: it's short-lived by design (see api/.env.example,
    // JWT_ACCESS_EXPIRES_IN). Try exactly ONE silent refresh + ONE retry.
    // Deliberately not a loop: if the RETRIED request also 401s, the
    // refresh token itself is dead (expired, revoked, or this is a
    // genuinely unauthenticated request) - continuing to retry would just
    // hammer the backend without ever succeeding.
    try {
      const newToken = await refreshAccessToken();
      res = await doFetch(newToken);
    } catch {
      accessToken = null;
      onSessionExpired?.();
      throw new ApiError('SESSION_EXPIRED', 401);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error?.code ?? 'UNKNOWN', res.status, body.error);
  }

  if (res.status === 204) return null; // no body to parse (cancel/logout responses)
  return res.json();
}
