// src/routes/AdminRoomsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminRoomsPage } from './AdminRoomsPage';
import * as roomsApi from '../api/rooms';
import { ApiError } from '../lib/ApiError';
import { ToastProvider } from '../components/ToastProvider';
import type { Room } from '../types/room';

vi.mock('../api/rooms');

function renderPage() {
  return render(
    <ToastProvider>
      <AdminRoomsPage />
    </ToastProvider>,
  );
}

function mockRoomsList(rooms: Room[]) {
  vi.mocked(roomsApi.listRooms).mockResolvedValue({
    rooms,
    pagination: { page: 1, pageSize: 20, total: rooms.length, totalPages: 1 },
  });
}

describe('AdminRoomsPage', () => {
  beforeEach(() => {
    vi.mocked(roomsApi.listRooms).mockReset();
    vi.mocked(roomsApi.createRoom).mockReset();
    vi.mocked(roomsApi.updateRoom).mockReset();
    vi.mocked(roomsApi.listAttributes).mockReset();
    vi.mocked(roomsApi.listAttributes).mockResolvedValue([]);
    mockRoomsList([]);
  });

  it('creates a room and reloads the list on success', async () => {
    const createdRoom: Room = {
      id: 'room-1',
      name: 'Cedar',
      floor: 2,
      capacity: 6,
      attributes: [],
    };
    vi.mocked(roomsApi.createRoom).mockResolvedValueOnce(createdRoom);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('No rooms match that search.');

    await user.type(screen.getByLabelText('Name'), 'Cedar');
    await user.clear(screen.getByLabelText('Capacity'));
    await user.type(screen.getByLabelText('Capacity'), '6');
    await user.click(screen.getByRole('button', { name: 'Create room' }));

    expect(roomsApi.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cedar', capacity: 6 }),
    );
    expect(await screen.findByText('Room created.')).toBeInTheDocument();
  });

  it('shows ROOM_DUPLICATE as a field-level error on the form, not the page banner', async () => {
    vi.mocked(roomsApi.createRoom).mockRejectedValueOnce(
      new ApiError('ROOM_DUPLICATE', 409, { message: 'A room named "Cedar" already exists.' }),
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('No rooms match that search.');

    await user.type(screen.getByLabelText('Name'), 'Cedar');
    await user.clear(screen.getByLabelText('Capacity'));
    await user.type(screen.getByLabelText('Capacity'), '6');
    await user.click(screen.getByRole('button', { name: 'Create room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A room named "Cedar" already exists.',
    );
    // Only the field-level alert should show - not a second, generic
    // "Could not create the room." page banner.
    expect(screen.queryByText('Could not create the room.')).not.toBeInTheDocument();
  });

  it('updates a room and reloads the list on success', async () => {
    const existingRoom: Room = {
      id: 'room-1',
      name: 'Cedar',
      floor: 2,
      capacity: 6,
      attributes: [],
    };
    mockRoomsList([existingRoom]);
    vi.mocked(roomsApi.updateRoom).mockResolvedValueOnce({ ...existingRoom, name: 'Cedar Room' });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Cedar');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('Edit Cedar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(roomsApi.updateRoom).toHaveBeenCalledWith('room-1', expect.objectContaining({ name: 'Cedar' }));
    expect(await screen.findByText('Room updated.')).toBeInTheDocument();
  });
});
