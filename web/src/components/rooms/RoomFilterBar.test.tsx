// src/components/rooms/RoomFilterBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomFilterBar } from './RoomFilterBar';
import * as roomsApi from '../../api/rooms';
import type { RoomSearchFilters } from '../../types/room';

vi.mock('../../api/rooms');

const baseFilters: RoomSearchFilters = {
  name: '',
  date: '2026-05-01',
  startTime: '10:00',
  endTime: '11:00',
  minCapacity: '2',
  attributes: [],
};

describe('RoomFilterBar', () => {
  beforeEach(() => {
    vi.mocked(roomsApi.listAttributes).mockResolvedValue([
      { id: 'attr-1', name: 'Projector' },
      { id: 'attr-2', name: 'Whiteboard' },
    ]);
    vi.mocked(roomsApi.listRooms).mockResolvedValue({
      rooms: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
    });
  });

  it('toggles an attribute checkbox in and out of the filter state', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <RoomFilterBar filters={baseFilters} onChange={onChange} onSubmit={vi.fn()} submitting={false} />,
    );

    const checkbox = await screen.findByLabelText('Projector');
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledWith({ ...baseFilters, attributes: ['Projector'] });
  });

  it('calls onSubmit when the form is submitted', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <RoomFilterBar filters={baseFilters} onChange={vi.fn()} onSubmit={onSubmit} submitting={false} />,
    );

    await waitFor(() => expect(roomsApi.listAttributes).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
