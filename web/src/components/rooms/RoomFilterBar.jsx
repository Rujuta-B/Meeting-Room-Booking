// src/components/rooms/RoomFilterBar.jsx
//
// A controlled form - RoomSearchPage owns the actual filter state and
// passes it down, so the "current search" lives in exactly one place
// (the page), not duplicated between this component's own state and the
// page's.
export function RoomFilterBar({ filters, onChange, onSubmit, submitting }) {
  function handleField(field) {
    return (e) => onChange({ ...filters, [field]: e.target.value });
  }

  return (
    <form
      className="room-filter-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Date
        <input type="date" value={filters.date} onChange={handleField('date')} required />
      </label>
      <label>
        Start time
        <input type="time" value={filters.startTime} onChange={handleField('startTime')} required />
      </label>
      <label>
        End time
        <input type="time" value={filters.endTime} onChange={handleField('endTime')} required />
      </label>
      <label>
        Min. capacity
        <input
          type="number"
          min="1"
          value={filters.minCapacity}
          onChange={handleField('minCapacity')}
        />
      </label>
      <label>
        Attributes (comma-separated)
        <input
          type="text"
          placeholder="projector,whiteboard"
          value={filters.attributes}
          onChange={handleField('attributes')}
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
