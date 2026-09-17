// src/routes/RoomCataloguePage.jsx
//
// Distinct from RoomSearchPage on purpose: that page answers "is this
// room free at this specific time" via a mechanical form-and-submit
// search. This page answers "what rooms do we even have" - a browsable
// catalogue with instant, client-side filtering, no submit button, no
// network round-trip per filter change.
import { useEffect, useMemo, useState } from 'react';
import { listRooms, listAttributes } from '../api/rooms.js';
import { formatFloorLabel } from '../lib/floor.js';
import { MIN_CAPACITY, MAX_CAPACITY } from '../lib/capacity.js';

export function RoomCataloguePage() {
  const [rooms, setRooms] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [minCapacity, setMinCapacity] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [selectedAttrs, setSelectedAttrs] = useState([]);

  useEffect(() => {
    listRooms({ pageSize: 100 }).then((r) => setRooms(r.rooms));
    listAttributes()
      .then(setAttributes)
      .catch(() => setAttributes([]));
  }, []);

  const filtered = useMemo(() => {
    if (!rooms) return [];
    return rooms.filter((room) => {
      if (minCapacity && room.capacity < Number(minCapacity)) return false;
      if (maxCapacity && room.capacity > Number(maxCapacity)) return false;
      if (selectedAttrs.length > 0) {
        const roomAttrNames = room.attributes.map((a) => a.attribute.name);
        if (!selectedAttrs.every((a) => roomAttrNames.includes(a))) return false;
      }
      return true;
    });
  }, [rooms, minCapacity, maxCapacity, selectedAttrs]);

  function toggleAttr(name) {
    setSelectedAttrs((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]));
  }

  // Only the ceiling is clamped live (typing "1" while building "10"
  // must not get bumped up to the floor mid-keystroke) - the floor is
  // enforced on blur instead, once the user has finished typing.
  function clampCapacity(value) {
    return value === '' ? '' : String(Math.min(Number(value), MAX_CAPACITY));
  }

  function enforceFloorOnBlur(value, setValue) {
    const n = Number(value);
    if (value !== '' && n < MIN_CAPACITY) {
      setValue(String(MIN_CAPACITY));
    }
  }

  if (!rooms) return <p className="page-loading">Loading…</p>;

  return (
    <div className="room-catalogue-page">
      <h1>Browse rooms</h1>
      <div className="catalogue-filters">
        <div className="catalogue-filters-row">
          <div className="field-group">
            <label htmlFor="catalogue-min-capacity">Min capacity</label>
            <input
              id="catalogue-min-capacity"
              type="number"
              min={MIN_CAPACITY}
              max={MAX_CAPACITY}
              placeholder="Any"
              value={minCapacity}
              onChange={(e) => setMinCapacity(clampCapacity(e.target.value))}
              onBlur={(e) => enforceFloorOnBlur(e.target.value, setMinCapacity)}
            />
          </div>
          <div className="field-group">
            <label htmlFor="catalogue-max-capacity">Max capacity</label>
            <input
              id="catalogue-max-capacity"
              type="number"
              min={MIN_CAPACITY}
              max={MAX_CAPACITY}
              placeholder="Any"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(clampCapacity(e.target.value))}
              onBlur={(e) => enforceFloorOnBlur(e.target.value, setMaxCapacity)}
            />
          </div>
        </div>
        {attributes.length > 0 && (
          <fieldset className="room-filter-attributes">
            <legend>Attributes</legend>
            <div className="attribute-checkbox-group">
              {attributes.map((a) => (
                <label key={a.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedAttrs.includes(a.name)}
                    onChange={() => toggleAttr(a.name)}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <p className="catalogue-count">
        {filtered.length} of {rooms.length} rooms
      </p>
      {filtered.length === 0 ? (
        <p>No rooms match these filters.</p>
      ) : (
        <ul className="room-catalogue-grid">
          {filtered.map((room) => (
            <li key={room.id} className="room-card">
              <h3>{room.name}</h3>
              <p>{formatFloorLabel(room.floor)}</p>
              <p>Capacity: {room.capacity}</p>
              {room.attributes.length > 0 && (
                <div className="attribute-tags">
                  {room.attributes.map((a) => (
                    <span key={a.attribute.id} className="attribute-tag">
                      {a.attribute.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
