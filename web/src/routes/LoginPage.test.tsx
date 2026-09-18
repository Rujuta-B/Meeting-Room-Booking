// src/routes/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import * as AuthContextModule from '../auth/AuthContext';

describe('LoginPage', () => {
  const login = vi.fn();

  beforeEach(() => {
    login.mockReset();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      status: 'anonymous',
      register: vi.fn(),
      login,
      logout: vi.fn(),
    });
  });

  it('submits the entered credentials and navigates home on success', async () => {
    login.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(login).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });

  it('shows a generic invalid-credentials message on failure, without leaking which field was wrong', async () => {
    const { ApiError } = await import('../lib/ApiError');
    login.mockRejectedValueOnce(new ApiError('UNAUTHORIZED', 401));
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});
