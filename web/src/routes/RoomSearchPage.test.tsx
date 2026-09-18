// src/routes/RoomSearchPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RoomSearchPage } from './RoomSearchPage';
import * as roomsApi from '../api/rooms';
import { ApiError } from '../lib/ApiError';

vi.mock('../api/rooms');

describe('RoomSearchPage', () => {
  beforeEach(() => {
    vi.mocked(roomsApi.searchAvailableRooms).mockReset();
    vi.mocked(roomsApi.listAttributes).mockReset();
    vi.mocked(roomsApi.listAttributes).mockResolvedValue([]);
    vi.mocked(roomsApi.listRooms).mockReset();
    vi.mocked(roomsApi.listRooms).mockResolvedValue({
      rooms: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
    });
  });

  it('renders search results on a successful search', async () => {
    vi.mocked(roomsApi.searchAvailableRooms).mockResolvedValueOnce({
      rooms: [{ id: 'room-1', name: 'Cedar', floor: 2, capacity: 6, attributes: [] }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RoomSearchPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Cedar')).toBeInTheDocument();
    expect(screen.getByText('Capacity: 6')).toBeInTheDocument();
  });

  it('shows a future-time message when the search rejects a past startTime as VALIDATION_ERROR', async () => {
    vi.mocked(roomsApi.searchAvailableRooms).mockRejectedValueOnce(
      new ApiError('VALIDATION_ERROR', 400, {
        errors: [{ field: 'startTime', message: 'startTime must be in the future.' }],
      }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RoomSearchPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That time has already passed. Please choose a future time.',
    );
  });

  it('shows a minimum-duration message when the search range is rejected as VALIDATION_ERROR on endTime', async () => {
    vi.mocked(roomsApi.searchAvailableRooms).mockRejectedValueOnce(
      new ApiError('VALIDATION_ERROR', 400, {
        errors: [{ field: 'endTime', message: 'Search range must be at least 10 minutes long.' }],
      }),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RoomSearchPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search range must be at least 10 minutes long.',
    );
  });
});
