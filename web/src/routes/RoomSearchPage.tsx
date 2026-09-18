// src/routes/RoomSearchPage.tsx
import { useState } from 'react';
import { RoomFilterBar } from '../components/rooms/RoomFilterBar';
import { RoomResultCard } from '../components/rooms/RoomResultCard';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { searchAvailableRooms } from '../api/rooms';
import { toIsoDateTime } from '../lib/dateRange';
import { todayInIst } from '../lib/istTime';
import { ApiError } from '../lib/ApiError';
import type { AvailableRoom, RoomSearchFilters } from '../types/room';
import type { PaginationMeta } from '../types/api';

const today = todayInIst();

export function RoomSearchPage() {
  const [filters, setFilters] = useState<RoomSearchFilters>({
    date: today,
    startTime: '10:00',
    endTime: '11:00',
    minCapacity: '2',
    name: '',
    attributes: [],
  });
  const [results, setResults] = useState<AvailableRoom[] | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [searchedRange, setSearchedRange] = useState<{ startTime: string; endTime: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function runSearch(page = 1) {
    setError(null);
    setSubmitting(true);
    try {
      const startTime = toIsoDateTime(filters.date, filters.startTime);
      const endTime = toIsoDateTime(filters.date, filters.endTime);
      if (!startTime || !endTime) {
        setError('Please choose a date, start time, and end time.');
        return;
      }
      if (new Date(endTime) <= new Date(startTime)) {
        setError('End time must be after start time. (Start and end must be on the same date; overnight ranges spanning midnight are not supported.)');
        return;
      }

      const { rooms, pagination: nextPagination } = await searchAvailableRooms({
        startTime,
        endTime,
        minCapacity: Number(filters.minCapacity) || 2,
        attributes: filters.attributes,
        name: filters.name.trim() || undefined,
        page,
      });
      setResults(rooms);
      setPagination(nextPagination);
      setSearchedRange({ startTime, endTime });
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'VALIDATION_ERROR' &&
        err.details?.errors?.some((e) => e.field === 'startTime')
      ) {
        setError('That time has already passed. Please choose a future time.');
      } else if (
        err instanceof ApiError &&
        err.code === 'VALIDATION_ERROR' &&
        err.details?.errors?.some((e) => e.field === 'endTime')
      ) {
        setError('Search range must be at least 10 minutes long.');
      } else {
        setError('Could not search rooms right now. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="room-search-page">
      <h1>Find a room</h1>
      <RoomFilterBar filters={filters} onChange={setFilters} onSubmit={() => runSearch(1)} submitting={submitting} />
      {error && <ErrorBanner message={error} />}
      {results && (
        <div className="room-results">
          {results.length === 0 ? (
            <p>No rooms match your search for that time. Try a different time or fewer filters.</p>
          ) : (
            results.map((room) => (
              <RoomResultCard
                key={room.id}
                room={room}
                startTime={searchedRange?.startTime ?? ''}
                endTime={searchedRange?.endTime ?? ''}
              />
            ))
          )}
          <Pagination pagination={pagination} onPageChange={runSearch} />
        </div>
      )}
    </div>
  );
}
