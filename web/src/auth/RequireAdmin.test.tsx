// src/auth/RequireAdmin.test.tsx
//
// Same caveat as RequireAuth.test.tsx: this component (and this test) only
// cover the UX guard - hiding an admin screen from a logged-in non-admin so
// they get a clear explanation instead of a confusing 403. The REAL
// enforcement is server-side (api/src/middleware/requireAdmin.ts), already
// proven with real HTTP requests by the backend's
// api/tests/bookings.ownership.test.ts-style coverage; nothing here can be
// relied on for security.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';
import * as AuthContextModule from './AuthContext';
import type { User } from '../types/user';

function renderWithAuth(status: 'checking' | 'authenticated' | 'anonymous', user: User | null = null) {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user,
    status,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={['/admin/rooms']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/admin/rooms"
          element={
            <RequireAdmin>
              <div>Admin content</div>
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAdmin', () => {
  it('shows a loading state while the session check is in flight', () => {
    renderWithAuth('checking');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('redirects to /login when anonymous', () => {
    renderWithAuth('anonymous');
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument();
  });

  it('renders ForbiddenPage in place for an authenticated non-admin, rather than redirecting', () => {
    renderWithAuth('authenticated', { id: 'user-1', email: 'user@example.com', role: 'USER' });

    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument();
  });

  it('renders children for an authenticated admin', () => {
    renderWithAuth('authenticated', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' });

    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });
});
