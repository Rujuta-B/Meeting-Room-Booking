// src/api/client.test.ts
//
// No MSW - fetch is mocked directly (per the project's established
// pattern for anything below the api/*.ts module layer), since this file
// IS the fetch wrapper everything else in api/*.ts is built on. The
// interesting behavior to prove: (1) a 401 on a normal call triggers
// exactly one silent refresh-then-retry, and (2) two 401s that happen
// concurrently share a single in-flight refresh call rather than each
// firing their own (see the big comment on refreshAccessToken in
// client.ts for why that matters - refresh tokens rotate on use, so a
// second, un-deduped refresh would fail and wrongly log the user out).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, setAccessToken, getAccessToken, registerSessionExpiredHandler } from './client';
import { ApiError } from '../lib/ApiError';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    setAccessToken(null);
    registerSessionExpiredHandler(() => {});
    vi.stubGlobal('fetch', vi.fn());
  });

  it('attaches the Authorization header when an access token is set', async () => {
    setAccessToken('token-123');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/rooms');

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
  });

  it('parses and returns the JSON body on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { rooms: [] }));

    const result = await apiFetch<{ rooms: unknown[] }>('/rooms');

    expect(result).toEqual({ rooms: [] });
  });

  it('returns null for a 204 response without parsing a body', async () => {
    const json = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 204, json } as unknown as Response);

    const result = await apiFetch('/bookings/some-id');

    expect(result).toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it('throws an ApiError built from the response body on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'BOOKING_CONFLICT', message: 'Slot taken.' } }),
    );

    await expect(apiFetch('/bookings')).rejects.toMatchObject({
      code: 'BOOKING_CONFLICT',
      status: 409,
    });
  });

  it('refreshes the access token once and retries after a single 401', async () => {
    setAccessToken('expired-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Expired.' } })) // initial call
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh-token' })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { bookings: [] })); // retried call

    const result = await apiFetch<{ bookings: unknown[] }>('/bookings/me');

    expect(result).toEqual({ bookings: [] });
    expect(getAccessToken()).toBe('fresh-token');
    expect(fetch).toHaveBeenCalledTimes(3);
    const refreshCall = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    expect(refreshCall[0]).toContain('/auth/refresh');
  });

  it('clears the access token and signals session expiry when the refresh itself fails', async () => {
    const onSessionExpired = vi.fn();
    registerSessionExpiredHandler(onSessionExpired);
    setAccessToken('expired-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Expired.' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Refresh failed.' } }));

    const error: unknown = await apiFetch('/bookings/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('SESSION_EXPIRED');
    expect(getAccessToken()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalled();
  });

  it('de-dupes two concurrent 401s into exactly one /auth/refresh call', async () => {
    setAccessToken('expired-token');

    // Two protected calls both 401 first, then the retried calls succeed.
    // /auth/refresh is scripted to resolve only after both original calls
    // have already fired, to genuinely exercise the shared in-flight
    // promise rather than relying on synchronous mock resolution order.
    let resolveRefresh: (value: Response) => void = () => {};
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return refreshResponse;
      }
      if (url.includes('/rooms')) {
        return Promise.resolve(jsonResponse(200, { rooms: [] }));
      }
      return Promise.resolve(jsonResponse(200, { bookings: [] }));
    });

    // Both calls see the 401 before refresh resolves, since fetch is async
    // and neither `await`s the other.
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Expired.' } })),
    );
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Expired.' } })),
    );

    const call1 = apiFetch<{ bookings: unknown[] }>('/bookings/me');
    const call2 = apiFetch<{ rooms: unknown[] }>('/rooms');

    // Let both initial 401s resolve and both callers reach refreshAccessToken().
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    resolveRefresh(jsonResponse(200, { accessToken: 'fresh-token' }));

    await Promise.all([call1, call2]);

    const refreshCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(getAccessToken()).toBe('fresh-token');
  });
});
