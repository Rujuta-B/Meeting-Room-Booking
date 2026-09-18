// src/auth/RequireAuth.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import * as AuthContextModule from './AuthContext';

function renderWithStatus(status: 'checking' | 'authenticated' | 'anonymous') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: null,
    status,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/protected"
          element={
            <RequireAuth>
              <div>Protected content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('shows a loading state while the session check is in flight', () => {
    renderWithStatus('checking');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('redirects to /login when anonymous', () => {
    renderWithStatus('anonymous');
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    renderWithStatus('authenticated');
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
