// src/routes/RecurringBookingFormPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSeries } from '../api/bookings';
import { searchAvailableRooms } from '../api/rooms';
import { toIsoDateTime } from '../lib/dateRange';
import { todayInIst } from '../lib/istTime';
import { ErrorBanner } from '../components/ErrorBanner';
import { formatFloorLabel } from '../lib/floor';
import { DatePicker } from '../components/DatePicker';
import { Select } from '../components/Select';
import type { AvailableRoom } from '../types/room';
import type { RecurrencePattern, CreateSeriesResult } from '../types/booking';

const today = todayInIst();

// Mirrors the backend's MIN_BOOKING_DURATION_MS (bookings.schemas.ts) - kept
// as a separate literal here rather than importing across the api/web
// boundary, same as every other client-side validation mirror in this file.
const MIN_BOOKING_DURATION_MS = 10 * 60 * 1000;

interface PatternOption {
  value: RecurrencePattern;
  label: string;
  maxOccurrences: number;
}

const PATTERNS: PatternOption[] = [
  { value: 'DAILY', label: 'Daily', maxOccurrences: 30 },
  { value: 'WEEKLY', label: 'Weekly', maxOccurrences: 12 },
  { value: 'MONTHLY', label: 'Monthly', maxOccurrences: 12 },
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function RecurringBookingFormPage() {
  const navigate = useNavigate();
  const [pattern, setPattern] = useState<RecurrencePattern>('WEEKLY');
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  // Starts at the pattern's own max - the user is only ever allowed to dial
  // this DOWN from the cap, never up, so the max is the natural default
  // rather than an arbitrary starting number.
  const [occurrenceCount, setOccurrenceCount] = useState('12'); // kept as a string (matching the <input>'s value) and coerced with Number() at submit time
  const [occurrenceCountError, setOccurrenceCountError] = useState<string | null>(null);
  const [occurrenceCountNotice, setOccurrenceCountNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateSeriesResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isoStart = toIsoDateTime(date, startTime);
  const isoEnd = toIsoDateTime(date, endTime);
  // Mirrors CreateSeriesSchema's own two refinements (bookings.schemas.ts):
  // endTime must be after startTime, AND at least 10 minutes after it -
  // kept as one combined flag since both produce the same "fix your time
  // range" hint to the user.
  const timeRangeInvalid = Boolean(
    isoStart && isoEnd && new Date(isoEnd).getTime() - new Date(isoStart).getTime() < MIN_BOOKING_DURATION_MS,
  );
  const startInPast = Boolean(isoStart && new Date(isoStart) <= new Date());

  // PATTERNS is a fixed, non-empty literal array and `pattern` state only
  // ever holds one of its own `value`s, so this lookup always succeeds;
  // the fallback exists only to satisfy noUncheckedIndexedAccess, which
  // can't see that invariant statically.
  const activePattern = PATTERNS.find((p) => p.value === pattern) ?? PATTERNS[0]!;

  // Switching pattern resets the count to that pattern's own max - the field
  // always starts at the cap and can only be dialed down, so a fresh pattern
  // means a fresh cap, not a clamp of whatever number was left over.
  useEffect(() => {
    setOccurrenceCount(String(activePattern.maxOccurrences));
    setOccurrenceCountError(null);
    setOccurrenceCountNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern]);

  // Users may only ever decrease this field from the pattern's max, never
  // increase it - so any keystroke that would raise the value above the
  // current cap is rejected outright (the input simply doesn't change),
  // and a green explanatory hint appears instead of a red error, since
  // trying to go higher isn't invalid input, just not allowed.
  function handleOccurrenceCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const n = Number(raw);

    if (raw !== '' && Number.isInteger(n) && n > activePattern.maxOccurrences) {
      setOccurrenceCountNotice(
        `Can't exceed the maximum of ${activePattern.maxOccurrences} for a ${activePattern.label.toLowerCase()} series - you can only decrease this value.`,
      );
      return;
    }

    setOccurrenceCount(raw);
    setOccurrenceCountNotice(null);
    if (Number.isInteger(n) && n >= 1 && n <= activePattern.maxOccurrences) {
      setOccurrenceCountError(null);
    }
  }

  function handleOccurrenceCountBlur() {
    const n = Number(occurrenceCount);
    if (!Number.isInteger(n) || n < 1 || n > activePattern.maxOccurrences) {
      setOccurrenceCountError(
        `Must be a whole number between 1 and ${activePattern.maxOccurrences} for a ${activePattern.label.toLowerCase()} series.`,
      );
    }
    setOccurrenceCountNotice(null);
  }

  // Only ever offers rooms actually free for the chosen FIRST occurrence -
  // not every room that exists (which is misleading, since the booking can
  // still conflict at submit time). This checks availability for the first
  // occurrence's window only; later occurrences in the series can still
  // conflict and are still caught by the same all-or-nothing transaction on
  // the backend, exactly as before - this is a head start on the common
  // case, not a guarantee for the whole series.
  useEffect(() => {
    if (!date || !startTime || !endTime) {
      setAvailableRooms([]);
      return;
    }
    if (!isoStart || !isoEnd || timeRangeInvalid || startInPast) {
      setAvailableRooms([]);
      return;
    }

    setLoadingRooms(true);
    const timer = setTimeout(() => {
      searchAvailableRooms({ startTime: isoStart, endTime: isoEnd, pageSize: 100 })
        .then(({ rooms }) => setAvailableRooms(rooms))
        .catch(() => setAvailableRooms([]))
        .finally(() => setLoadingRooms(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [date, startTime, endTime]);

  // If the room the user had selected drops out of the refreshed list
  // (time changed, or it's no longer free), don't let a stale id linger in
  // state where it could be silently submitted.
  useEffect(() => {
    if (roomId && !availableRooms.some((r) => r.id === roomId)) {
      setRoomId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRooms]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const n = Number(occurrenceCount);
    if (!Number.isInteger(n) || n < 1 || n > activePattern.maxOccurrences) {
      handleOccurrenceCountBlur();
      return;
    }
    if (!isoStart || !isoEnd || timeRangeInvalid || startInPast) return;
    setSubmitting(true);
    try {
      const created = await createSeries(roomId, isoStart, isoEnd, Number(occurrenceCount), pattern);
      setResult(created);
    } catch {
      // Series creation is all-or-nothing (see api's bookings.service.ts
      // $transaction) - if ANY occurrence conflicts, the whole series is
      // rolled back and nothing was created, so a single generic message
      // is accurate here (there's no "some succeeded, some didn't" case
      // to report per-occurrence).
      setError('Could not create the series - one of the occurrences conflicts with an existing booking. Try a different time or fewer occurrences.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="recurring-booking-page">
        <div className="recurring-series-result">
          <h1>Series created</h1>
          <p>
            {result.occurrences.length} {activePattern.label.toLowerCase()} occurrences booked, starting {date}.
          </p>
          <button type="button" onClick={() => navigate('/my-bookings')}>
            View my bookings
          </button>
        </div>
      </div>
    );
  }

  // date is already an IST calendar date string ("YYYY-MM-DD"); its
  // weekday/day-of-month are read directly from the string's own parts
  // (via a fixed UTC-anchored Date) rather than parsed as browser-local
  // time, so this hint text is correct regardless of the viewer's
  // local/OS timezone.
  const parsedDateParts = date ? date.split('-').map(Number) : null;
  const parsedDate = parsedDateParts ? new Date(Date.UTC(parsedDateParts[0]!, parsedDateParts[1]! - 1, parsedDateParts[2]!)) : null;
  const patternHint =
    pattern === 'WEEKLY' && parsedDate
      ? `Repeats every ${WEEKDAY_NAMES[parsedDate.getUTCDay()]}.`
      : pattern === 'MONTHLY' && parsedDate
        ? `Repeats on the ${ordinal(parsedDate.getUTCDate())} of each month (clamped to month-end when shorter).`
        : pattern === 'DAILY'
          ? 'Repeats every day at the same time.'
          : null;

  return (
    <div className="recurring-booking-page">
      <h1>Book a recurring series</h1>
      {error && <ErrorBanner message={error} />}
      <form className="recurring-series-form" onSubmit={handleSubmit}>
        <div className="pattern-selector" role="radiogroup" aria-label="Recurrence pattern">
          {PATTERNS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={pattern === p.value}
              className={`pattern-option ${pattern === p.value ? 'active' : ''}`}
              onClick={() => setPattern(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="field-row">
          <label>
            First occurrence date
            <DatePicker value={date} onChange={setDate} required disablePast />
          </label>
          <label>
            Start time
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label>
            End time
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </label>
        </div>

        {patternHint && <p className="pattern-hint">{patternHint}</p>}

        <label>
          Available rooms for this time
          <Select
            value={roomId}
            onChange={setRoomId}
            required
            disabled={loadingRooms}
            placeholder={loadingRooms ? 'Checking availability…' : 'Select a room'}
            options={availableRooms.map((room) => ({ value: room.id, label: `${room.name} (${formatFloorLabel(room.floor)})` }))}
          />
        </label>
        {timeRangeInvalid && (
          <p className="field-error" role="alert">
            {isoStart && isoEnd && new Date(isoEnd) <= new Date(isoStart)
              ? 'End time must be after start time.'
              : 'Each occurrence must be at least 10 minutes long.'}
          </p>
        )}
        {!timeRangeInvalid && startInPast && (
          <p className="field-error" role="alert">
            Start time must be in the future.
          </p>
        )}
        {!timeRangeInvalid && !startInPast && !loadingRooms && availableRooms.length === 0 && (
          <p className="field-hint">No rooms are free for this date/time — try a different slot.</p>
        )}

        <label>
          Number of {activePattern.label.toLowerCase()} occurrences
          <input
            type="number"
            min="1"
            max={activePattern.maxOccurrences}
            value={occurrenceCount}
            onChange={handleOccurrenceCountChange}
            onBlur={handleOccurrenceCountBlur}
            required
          />
          {occurrenceCountError && (
            <span className="field-error" role="alert">
              {occurrenceCountError}
            </span>
          )}
          {!occurrenceCountError && occurrenceCountNotice && (
            <span className="field-notice" role="status">
              {occurrenceCountNotice}
            </span>
          )}
        </label>

        <button type="submit" disabled={submitting || !roomId}>
          {submitting ? 'Creating…' : 'Create series'}
        </button>
      </form>
    </div>
  );
}
