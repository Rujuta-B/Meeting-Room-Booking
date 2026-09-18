// src/routes/RegisterPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import * as AuthContextModule from '../auth/AuthContext';

describe('RegisterPage', () => {
  const register = vi.fn();

  beforeEach(() => {
    register.mockReset();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      status: 'anonymous',
      register,
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('submits the entered credentials and navigates home on success', async () => {
    register.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText(/Password/), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(register).toHaveBeenCalledWith('new@example.com', 'password123');
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });

  it('shows field-level errors for a VALIDATION_ERROR response', async () => {
    const { ApiError } = await import('../lib/ApiError');
    register.mockRejectedValueOnce(
      new ApiError('VALIDATION_ERROR', 400, {
        errors: [{ field: 'password', message: 'Password must be at least 8 characters.' }],
      }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText(/Password/), 'short123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
  });

  it('shows a specific message for EMAIL_TAKEN', async () => {
    const { ApiError } = await import('../lib/ApiError');
    register.mockRejectedValueOnce(new ApiError('EMAIL_TAKEN', 409));
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText(/Password/), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists.',
    );
  });
});
