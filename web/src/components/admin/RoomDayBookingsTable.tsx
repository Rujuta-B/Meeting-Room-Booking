// src/components/admin/RoomDayBookingsTable.tsx
//
// Shows who booked the selected room on the selected day, backed by the
// same `slots` data as DayTimeline - no separate fetch, just a tabular
// view of the same booking list.
import type { DayTimelineSlot } from '../../types/utilisation';
import { formatIstTime } from '../../lib/istTime';

export function RoomDayBookingsTable({ slots }: { slots: DayTimelineSlot[] }) {
  if (slots.length === 0) return null;

  return (
    <div className="room-day-bookings-wrap">
      <table className="room-day-bookings-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Start</th>
            <th>End</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.bookingId}>
              <td className="room-day-bookings-user-cell">{slot.userEmail}</td>
              {/* IST to match DayTimeline's axis, which the day-range filter and bar positioning both use */}
              <td>{formatIstTime(slot.startTime)}</td>
              <td>{formatIstTime(slot.endTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
