// src/routes/RecurringBookingFormPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSeries } from '../api/bookings.js';
import { listRooms } from '../api/rooms.js';
import { toIsoDateTime } from '../lib/dateRange.js';
import { ErrorBanner } from '../components/ErrorBanner.jsx';

const today = new Date().toISOString().slice(0, 10);

export function RecurringBookingFormPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [occurrenceCount, setOccurrenceCount] = useState('8'); // kept as a string (matching the <input>'s value) and coerced with Number() at submit time
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listRooms().then(setRooms).catch(() => setError('Could not load the room list.'));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const isoStart = toIsoDateTime(date, startTime);
      const isoEnd = toIsoDateTime(date, endTime);
      const created = await createSeries(roomId, isoStart, isoEnd, Number(occurrenceCount));
      setResult(created);
    } catch {
      // Series creation is all-or-nothing (see api's bookings.service.ts
      // $transaction) - if ANY occurrence conflicts, the whole series is
      // rolled back and nothing was created, so a single generic message
      // is accurate here (there's no "some succeeded, some didn't" case
      // to report per-occurrence).
      setError('Could not create the series - one of the occurrences conflicts with an existing booking. Try a different time or fewer weeks.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="recurring-booking-page">
        <h1>Series created</h1>
        <p>
          {result.occurrences.length} weekly occurrences booked, starting {date}.
        </p>
        <button type="button" onClick={() => navigate('/my-bookings')}>
          View my bookings
        </button>
      </div>
    );
  }

  return (
    <div className="recurring-booking-page">
      <h1>Book a recurring series</h1>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit}>
        <label>
          Room
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
            <option value="" disabled>
              Select a room
            </option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.location})
              </option>
            ))}
          </select>
        </label>
        <label>
          First occurrence date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Start time
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </label>
        <label>
          End time
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </label>
        <label>
          Number of weekly occurrences
          <input
            type="number"
            min="1"
            max="52"
            value={occurrenceCount}
            onChange={(e) => setOccurrenceCount(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create series'}
        </button>
      </form>
    </div>
  );
}
