// src/components/admin/RoomForm.jsx
import { useState } from 'react';

export function RoomForm({ initial, onSubmit, submitting }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ?? 4);
  const [attributes, setAttributes] = useState(
    initial?.attributes?.map((a) => a.attribute.name).join(', ') ?? '',
  );

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      name,
      location,
      capacity: Number(capacity),
      attributes: attributes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  return (
    <form className="room-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Location
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} required />
      </label>
      <label>
        Capacity
        <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
      </label>
      <label>
        Attributes (comma-separated)
        <input
          type="text"
          placeholder="projector, whiteboard"
          value={attributes}
          onChange={(e) => setAttributes(e.target.value)}
        />
      </label>
      <button type="submit" disabled={submitting}>
        {initial ? 'Save changes' : 'Create room'}
      </button>
    </form>
  );
}
