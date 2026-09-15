// src/routes/RoomSearchPage.jsx
import { useState } from 'react';
import { RoomFilterBar } from '../components/rooms/RoomFilterBar.jsx';
import { RoomResultCard } from '../components/rooms/RoomResultCard.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { searchAvailableRooms } from '../api/rooms.js';
import { toIsoDateTime } from '../lib/dateRange.js';
import { ApiError } from '../lib/ApiError.js';

const today = new Date().toISOString().slice(0, 10);

export function RoomSearchPage() {
  const [filters, setFilters] = useState({
    date: today,
    startTime: '10:00',
    endTime: '11:00',
    minCapacity: '1',
    attributes: '',
  });
  const [results, setResults] = useState(null);
  const [searchedRange, setSearchedRange] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSearch() {
    setError(null);
    setSubmitting(true);
    try {
      const startTime = toIsoDateTime(filters.date, filters.startTime);
      const endTime = toIsoDateTime(filters.date, filters.endTime);
      const attributes = filters.attributes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const rooms = await searchAvailableRooms({
        startTime,
        endTime,
        minCapacity: Number(filters.minCapacity) || 1,
        attributes,
      });
      setResults(rooms);
      setSearchedRange({ startTime, endTime });
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === 'VALIDATION_ERROR' &&
        err.details?.errors?.some((e) => e.field === 'startTime')
      ) {
        setError('That time has already passed. Please choose a future time.');
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
      <RoomFilterBar filters={filters} onChange={setFilters} onSubmit={handleSearch} submitting={submitting} />
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
                startTime={searchedRange.startTime}
                endTime={searchedRange.endTime}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
