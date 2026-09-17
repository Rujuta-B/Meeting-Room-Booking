// src/components/admin/UtilisationTable.jsx
//
// Still a plain table backed by the real grouped aggregate query - no
// chart library, per the plan's emphasis on backend depth over frontend
// visual polish. The utilisation bar below is pure CSS driven directly by
// row.utilisationPct, not a canvas/SVG chart.
export function UtilisationTable({ report }) {
  if (report.length === 0) return <p>No confirmed bookings in this date range.</p>;

  return (
    <table className="utilisation-table">
      <thead>
        <tr>
          <th>Room</th>
          <th>Week of</th>
          <th>Hours booked</th>
          <th>Hours available</th>
          <th>Utilisation</th>
        </tr>
      </thead>
      <tbody>
        {report.map((row, i) => (
          <tr key={`${row.roomId}-${row.weekStart}-${i}`}>
            <td className="utilisation-room-cell">{row.roomName}</td>
            <td>
              {new Date(row.weekStart).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </td>
            <td>{row.hoursBooked.toFixed(1)}</td>
            <td>{row.hoursAvailable}</td>
            <td>
              <div className="utilisation-cell">
                <div className="utilisation-bar-track">
                  <div
                    className="utilisation-bar-fill"
                    style={{ width: `${Math.min(100, row.utilisationPct)}%` }}
                  />
                </div>
                <span className="utilisation-pct">{row.utilisationPct}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
