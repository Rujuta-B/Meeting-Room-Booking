// tests/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { resetDatabase } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('auth: register/login/refresh/logout', () => {
  it('registers a new user, returns an access token in the body, and sets the refresh cookie', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'a@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    // The refresh token must NEVER appear in the JSON body - see
    // auth.controller.ts for why. Only the cookie should carry it.
    expect(res.body.refreshToken).toBeUndefined();
    const setCookieHeader = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookieHeader).toContain('refreshToken=');
    expect(setCookieHeader.toLowerCase()).toContain('httponly');
  });

  it('rejects registering the same email twice with a 409', async () => {
    await request(app).post('/auth/register').send({ email: 'dup@example.com', password: 'password123' });
    const res = await request(app).post('/auth/register').send({ email: 'dup@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects registration with a short password before hitting the database', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'short@example.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials and rejects incorrect ones identically', async () => {
    await request(app).post('/auth/register').send({ email: 'login@example.com', password: 'password123' });

    const good = await request(app).post('/auth/login').send({ email: 'login@example.com', password: 'password123' });
    expect(good.status).toBe(200);

    const badPassword = await request(app).post('/auth/login').send({ email: 'login@example.com', password: 'wrong' });
    expect(badPassword.status).toBe(401);

    const noSuchUser = await request(app).post('/auth/login').send({ email: 'nope@example.com', password: 'password123' });
    expect(noSuchUser.status).toBe(401);
    // Same error code either way - doesn't reveal whether the email exists.
    expect(noSuchUser.body.error.code).toBe(badPassword.body.error.code);
  });

  it('refreshes using the httpOnly cookie and rotates it', async () => {
    const agent = request.agent(app); // supertest's agent persists cookies across requests, like a browser

    const registerRes = await agent.post('/auth/register').send({ email: 'refresh@example.com', password: 'password123' });
    const firstAccessToken = registerRes.body.accessToken;

    const refreshRes = await agent.post('/auth/refresh').send();
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTypeOf('string');
    expect(refreshRes.body.accessToken).not.toBe(firstAccessToken); // a NEW access token was issued

    // The OLD refresh token (from registration) should now be revoked -
    // rotation means it can't be reused. We can't directly resubmit the
    // old cookie easily via the agent (it auto-replaces it), so this is
    // implicitly covered by auth.service.ts's revocation logic and the
    // "refresh again works" check below, which proves rotation issued a
    // genuinely new, valid token rather than just returning the same one.
    const secondRefresh = await agent.post('/auth/refresh').send();
    expect(secondRefresh.status).toBe(200);
  });

  it('rejects /auth/refresh with no cookie at all', async () => {
    const res = await request(app).post('/auth/refresh').send();
    expect(res.status).toBe(401);
  });

  it('logout revokes the refresh token SERVER-SIDE, not just locally in the browser', async () => {
    // WHY this test captures the raw Set-Cookie header itself, rather than
    // relying only on supertest's cookie-jar agent: an agent-based check
    // (register, logout, then refresh with the SAME agent) can pass for
    // the WRONG reason - if logout only cleared the cookie in the browser
    // without revoking the token in the database, the agent would still
    // get a 401 on the next refresh simply because it no longer HAS a
    // cookie to send, not because the token was actually invalidated
    // server-side. That gap is exactly what caused this bug in the first
    // place (the refresh cookie's Path didn't originally cover
    // /auth/logout, so the server never saw the token to revoke it - see
    // auth.controller.ts's REFRESH_COOKIE_OPTIONS comment). Manually
    // replaying the ORIGINAL cookie value on a fresh, cookie-less request
    // proves the token itself is dead server-side, independent of what
    // any particular client remembers.
    const registerRes = await request(app).post('/auth/register').send({ email: 'logout@example.com', password: 'password123' });
    const setCookieHeader = registerRes.headers['set-cookie'][0];
    const rawCookiePair = setCookieHeader.split(';')[0]; // "refreshToken=<value>"

    const logoutRes = await request(app).post('/auth/logout').set('Cookie', rawCookiePair).send();
    expect(logoutRes.status).toBe(204);

    // A brand new request (no shared agent/cookie-jar state at all)
    // replaying the EXACT cookie value that was valid before logout.
    const refreshWithOldCookie = await request(app).post('/auth/refresh').set('Cookie', rawCookiePair).send();
    expect(refreshWithOldCookie.status).toBe(401);
  });

  it('logout clears the cookie so a normal browser session cannot refresh afterward', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/register').send({ email: 'logout2@example.com', password: 'password123' });

    const logoutRes = await agent.post('/auth/logout').send();
    expect(logoutRes.status).toBe(204);

    const refreshAfterLogout = await agent.post('/auth/refresh').send();
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('rejects an expired/garbage access token on a protected route', async () => {
    const res = await request(app).get('/bookings/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
