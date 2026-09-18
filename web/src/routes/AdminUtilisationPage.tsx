// src/routes/AdminUtilisationPage.tsx
import { useEffect, useState } from 'react';
import { getUtilisationReport, getRoomDayTimeline } from '../api/admin';
import { listRooms } from '../api/rooms';
import { UtilisationTable } from '../components/admin/UtilisationTable';
import { DayTimeline } from '../components/admin/DayTimeline';
import { RoomDayBookingsTable } from '../components/admin/RoomDayBookingsTable';
import { ErrorBanner } from '../components/ErrorBanner';
import { DatePicker } from '../components/DatePicker';
import { Select } from '../components/Select';
import type { Room } from '../types/room';
import type { UtilisationReportRow, DayTimelineSlot } from '../types/utilisation';
import { addIstDays, istDayUtcRange, istMidnightToUtcIso, startOfIstWeek, todayInIst, utcMidnightsSpanningIstDay } from '../lib/istTime';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Renders a "YYYY-MM-DD" calendar-date string directly from its own parts
// (no Date/timezone round-trip), same approach as DatePicker's own
// formatDateLabel - avoids any risk of an IST-display conversion shifting
// a plain calendar-date string by a day.
function formatCalendarDate(isoLike: string): string {
  const [year, month, day] = isoLike.split('-').map(Number);
  return `${MONTH_LABELS[month! - 1]} ${day}, ${year}`;
}

export function AdminUtilisationPage() {
  // The report always covers exactly one IST week (Monday-Sunday), so
  // hoursAvailable is always a full 168 for every row - a range spanning
  // multiple weeks would mix full weeks with a clipped partial week at
  // either end, which looked inconsistent in the table (e.g. 168 next to
  // 120). Picking any day snaps to that day's own week's Monday.
  const [weekOf, setWeekOf] = useState(startOfIstWeek(todayInIst()));
  const [roomId, setRoomId] = useState('');
  const [report, setReport] = useState<UtilisationReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    listRooms({ pageSize: 100 })
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, []);

  async function handleFetch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // rangeEnd is exactly 7 IST days after weekOf (Monday) - i.e. the
      // following Monday, exclusive. The backend's `start_time < rangeEnd`
      // bound then covers exactly Mon-Sun of the picked week, no more and
      // no less, so every returned row's hoursAvailable is always a full
      // 168 (see utilisation.service.ts).
      const rangeStart = weekOf;
      const rangeEnd = addIstDays(weekOf, 7);

      const result = await getUtilisationReport(istMidnightToUtcIso(rangeStart), istMidnightToUtcIso(rangeEnd), {
        roomId: roomId || undefined,
      });
      setReport(result.report);
    } catch {
      setError('Could not load the utilisation report.');
    } finally {
      setLoading(false);
    }
  }

  const [timelineDate, setTimelineDate] = useState(todayInIst());
  const [timelineRoomId, setTimelineRoomId] = useState('');
  const [slots, setSlots] = useState<DayTimelineSlot[] | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  useEffect(() => {
    if (!timelineRoomId) {
      setSlots(null);
      return;
    }
    setTimelineError(null);
    // The backend's getRoomDayTimeline computes "the UTC calendar day
    // containing the given instant" - it has no notion of IST. An IST
    // calendar day always spans parts of TWO UTC calendar days (IST
    // midnight = 18:30 UTC the day before), so query both UTC days,
    // merge, dedupe, and keep only slots that actually overlap the true
    // IST window.
    const [utcMidnightBefore, utcMidnightOf] = utcMidnightsSpanningIstDay(timelineDate);
    const { start: istWindowStart, end: istWindowEnd } = istDayUtcRange(timelineDate);

    Promise.all([
      getRoomDayTimeline(timelineRoomId, utcMidnightBefore),
      getRoomDayTimeline(timelineRoomId, utcMidnightOf),
    ])
      .then(([a, b]) => {
        const byId = new Map(a.slots.concat(b.slots).map((slot) => [slot.bookingId, slot]));
        const overlappingIstWindow = [...byId.values()].filter(
          (slot) => slot.startTime < istWindowEnd && slot.endTime > istWindowStart,
        );
        overlappingIstWindow.sort((x, y) => x.startTime.localeCompare(y.startTime));
        setSlots(overlappingIstWindow);
      })
      .catch(() => setTimelineError('Could not load the timeline.'));
  }, [timelineRoomId, timelineDate]);

  return (
    <div className="admin-utilisation-page">
      <h1>Room utilisation</h1>
      <form className="utilisation-filter-bar" onSubmit={handleFetch}>
        <label>
          Week of
          {/* Snap whatever day is picked to that day's own week's Monday,
              so the report always covers exactly one IST week - see
              startOfIstWeek's own comment for why partial weeks were
              removed from this picker. */}
          <DatePicker value={weekOf} onChange={(v) => setWeekOf(startOfIstWeek(v))} required />
          <span className="utilisation-week-range-hint">
            {formatCalendarDate(weekOf)} – {formatCalendarDate(addIstDays(weekOf, 6))}
          </span>
        </label>
        <label>
          Room
          <Select
            value={roomId}
            onChange={setRoomId}
            placeholder="All rooms"
            options={[{ value: '', label: 'All rooms' }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Run report'}
        </button>
      </form>
      {error && <ErrorBanner message={error} />}
      {report && (
        <div className="utilisation-table-wrap">
          <UtilisationTable report={report} />
        </div>
      )}

      <section className="day-timeline-section">
        <h2>Day timeline</h2>
        <div className="utilisation-filter-bar">
          <label>
            Room
            <Select
              value={timelineRoomId}
              onChange={setTimelineRoomId}
              placeholder="Select a room…"
              options={rooms.map((r) => ({ value: r.id, label: r.name }))}
            />
          </label>
          <label>
            Date
            <DatePicker value={timelineDate} onChange={setTimelineDate} />
          </label>
        </div>
        {timelineError && <ErrorBanner message={timelineError} />}
        {!timelineRoomId && <p className="day-timeline-empty">Select a room to see its timeline.</p>}
        {timelineRoomId && slots && (
          <>
            <DayTimeline slots={slots} date={timelineDate} />
            <RoomDayBookingsTable slots={slots} />
          </>
        )}
      </section>
    </div>
  );
}
