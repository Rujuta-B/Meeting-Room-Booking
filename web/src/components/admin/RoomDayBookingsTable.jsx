// src/components/admin/RoomDayBookingsTable.jsx
//
// Shows who booked the selected room on the selected day, backed by the
// same `slots` data as DayTimeline - no separate fetch, just a tabular
// view of the same booking list.
export function RoomDayBookingsTable({ slots }) {
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
              <td>{new Date(slot.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</td>
              <td>{new Date(slot.endTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
