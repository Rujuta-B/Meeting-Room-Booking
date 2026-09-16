// src/components/rooms/RoomFilterBar.jsx
import { useEffect, useState } from 'react';
import { listAttributes } from '../../api/rooms.js';

// A controlled form - RoomSearchPage owns the actual filter state and
// passes it down, so the "current search" lives in exactly one place
// (the page), not duplicated between this component's own state and the
// page's.
export function RoomFilterBar({ filters, onChange, onSubmit, submitting }) {
  const [availableAttributes, setAvailableAttributes] = useState([]);

  // Attribute checkboxes are populated from the real, admin-defined
  // attribute list (GET /rooms/attributes) rather than a free-text field -
  // a free-text "projector,whiteboard" input lets a user typo a filter
  // into silently matching nothing, with no feedback that the attribute
  // they typed doesn't exist.
  useEffect(() => {
    listAttributes()
      .then(setAvailableAttributes)
      .catch(() => setAvailableAttributes([]));
  }, []);

  function handleField(field) {
    return (e) => onChange({ ...filters, [field]: e.target.value });
  }

  function toggleAttribute(name) {
    const selected = filters.attributes.includes(name)
      ? filters.attributes.filter((a) => a !== name)
      : [...filters.attributes, name];
    onChange({ ...filters, attributes: selected });
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
        Name or location
        <input
          type="text"
          placeholder="e.g. Aspen, 3rd floor"
          value={filters.name}
          onChange={handleField('name')}
        />
      </label>
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
      {availableAttributes.length > 0 && (
        <fieldset className="room-filter-attributes">
          <legend>Equipment</legend>
          {availableAttributes.map((attribute) => (
            <label key={attribute.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.attributes.includes(attribute.name)}
                onChange={() => toggleAttribute(attribute.name)}
              />
              {attribute.name}
            </label>
          ))}
        </fieldset>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
