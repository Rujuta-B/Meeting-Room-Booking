// src/routes/AdminUtilisationPage.jsx
import { useEffect, useState } from 'react';
import { getUtilisationReport, getRoomDayTimeline } from '../api/admin.js';
import { listRooms } from '../api/rooms.js';
import { UtilisationTable } from '../components/admin/UtilisationTable.jsx';
import { DayTimeline } from '../components/admin/DayTimeline.jsx';
import { RoomDayBookingsTable } from '../components/admin/RoomDayBookingsTable.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { DatePicker } from '../components/DatePicker.jsx';
import { Select } from '../components/Select.jsx';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AdminUtilisationPage() {
  const [rangeStart, setRangeStart] = useState(firstOfMonth());
  const [rangeEnd, setRangeEnd] = useState(today());
  const [roomId, setRoomId] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    listRooms({ pageSize: 100 })
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, []);

  async function handleFetch(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // WHY rangeEnd is pushed to the START OF THE DAY AFTER the one
      // picked, not midnight of the picked date itself: the backend query
      // (api's utilisation.service.ts) filters with `start_time < rangeEnd`
      // - an EXCLUSIVE upper bound, so it can correctly use a plain B-tree
      // index range scan. If we sent midnight of the "To" date as-is, any
      // booking that starts ON that date (any time after midnight) would
      // be silently excluded - an admin picking "Aug 1 to Aug 31" would
      // get a report missing all of August 31st. Advancing rangeEnd to
      // midnight of Sept 1 makes the exclusive bound behave like an
      // INCLUSIVE end date from the admin's point of view, without
      // changing how the backend's query itself works.
      const endOfSelectedDay = new Date(rangeEnd);
      endOfSelectedDay.setDate(endOfSelectedDay.getDate() + 1);

      const result = await getUtilisationReport(new Date(rangeStart).toISOString(), endOfSelectedDay.toISOString(), {
        roomId: roomId || undefined,
      });
      setReport(result.report);
    } catch {
      setError('Could not load the utilisation report.');
    } finally {
      setLoading(false);
    }
  }

  const [timelineDate, setTimelineDate] = useState(today());
  const [timelineRoomId, setTimelineRoomId] = useState('');
  const [slots, setSlots] = useState(null);
  const [timelineError, setTimelineError] = useState(null);

  useEffect(() => {
    if (!timelineRoomId) {
      setSlots(null);
      return;
    }
    setTimelineError(null);
    getRoomDayTimeline(timelineRoomId, timelineDate)
      .then((r) => setSlots(r.slots))
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
