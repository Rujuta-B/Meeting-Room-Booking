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
import { addIstDays, firstOfMonthInIst, istDayUtcRange, istMidnightToUtcIso, todayInIst, utcMidnightsSpanningIstDay } from '../lib/istTime';

export function AdminUtilisationPage() {
  const [rangeStart, setRangeStart] = useState(firstOfMonthInIst());
  const [rangeEnd, setRangeEnd] = useState(todayInIst());
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
      // WHY rangeEnd is pushed to the START OF THE IST DAY AFTER the one
      // picked, not midnight of the picked date itself: the backend query
      // (api's utilisation.service.ts) filters with `start_time < rangeEnd`
      // - an EXCLUSIVE upper bound, so it can correctly use a plain B-tree
      // index range scan. If we sent midnight of the "To" date as-is, any
      // booking that starts ON that date (any time after midnight IST)
      // would be silently excluded - an admin picking "Aug 1 to Aug 31"
      // would get a report missing all of August 31st. Advancing rangeEnd
      // to IST midnight of Sept 1 makes the exclusive bound behave like an
      // INCLUSIVE end date from the admin's point of view, without
      // changing how the backend's query itself works.
      const endOfSelectedDayIst = addIstDays(rangeEnd, 1);

      const result = await getUtilisationReport(istMidnightToUtcIso(rangeStart), istMidnightToUtcIso(endOfSelectedDayIst), {
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
          From
          <DatePicker value={rangeStart} onChange={setRangeStart} required />
        </label>
        <label>
          To
          <DatePicker value={rangeEnd} onChange={setRangeEnd} required />
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
