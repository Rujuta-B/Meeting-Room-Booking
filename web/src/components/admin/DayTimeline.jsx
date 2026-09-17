// src/components/admin/DayTimeline.jsx
//
// A plain div-based timeline: the day (00:00-24:00) rendered as one flex
// row, with each booked slot an absolutely-positioned block sized/offset
// by percentage of the day. No chart library - consistent with
// UtilisationTable's "plain table, no chart lib" POC philosophy, just
// visual instead of tabular for this one view.
const MINUTES_PER_DAY = 24 * 60;
const GRIDLINE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

// A slot needs to be wide enough to legibly show its own time range inline
// before this component bothers rendering that text - anything narrower
// just shows the block itself, with the full range still available via the
// hover tooltip.
const MIN_WIDTH_PCT_FOR_INLINE_LABEL = 8;

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function DayTimeline({ slots, date }) {
  const dayStart = new Date(`${date}T00:00:00Z`).getTime();

  function pct(time) {
    const minutesFromMidnight = (new Date(time).getTime() - dayStart) / 60000;
    return Math.max(0, Math.min(100, (minutesFromMidnight / MINUTES_PER_DAY) * 100));
  }

  return (
    <div className="day-timeline">
      <div className="day-timeline-track">
        {GRIDLINE_HOURS.slice(1, -1).map((hour) => (
          <div key={hour} className="day-timeline-gridline" style={{ left: `${(hour / 24) * 100}%` }} />
        ))}
        {slots.map((slot) => {
          const left = pct(slot.startTime);
          const width = Math.max(pct(slot.endTime) - left, 0.5);
          const label = `${slot.userEmail} · ${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`;
          return (
            <div
              key={slot.bookingId}
              className="day-timeline-slot booked"
              style={{ left: `${left}%`, width: `${width}%` }}
              tabIndex={0}
            >
              {width >= MIN_WIDTH_PCT_FOR_INLINE_LABEL && <span className="day-timeline-slot-label">{label}</span>}
              <span className="day-timeline-tooltip">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="day-timeline-labels">
        {GRIDLINE_HOURS.map((hour) => (
          <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
        ))}
      </div>
      {slots.length === 0 && (
        <div className="day-timeline-empty">No confirmed bookings this day.</div>
      )}
    </div>
  );
}
