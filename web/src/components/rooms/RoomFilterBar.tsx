// src/components/rooms/RoomFilterBar.tsx
import { useEffect, useState } from 'react';
import { listAttributes, listRooms } from '../../api/rooms';
import { formatFloorLabel } from '../../lib/floor';
import { MIN_CAPACITY, MAX_CAPACITY } from '../../lib/capacity';
import { DatePicker } from '../DatePicker';
import { Select } from '../Select';
import type { RoomAttribute, Room, RoomSearchFilters } from '../../types/room';

export interface RoomFilterBarProps {
  filters: RoomSearchFilters;
  onChange: (filters: RoomSearchFilters) => void;
  onSubmit: () => void;
  submitting: boolean;
}

// A controlled form - RoomSearchPage owns the actual filter state and
// passes it down, so the "current search" lives in exactly one place
// (the page), not duplicated between this component's own state and the
// page's.
export function RoomFilterBar({ filters, onChange, onSubmit, submitting }: RoomFilterBarProps) {
  const [availableAttributes, setAvailableAttributes] = useState<RoomAttribute[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);

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

  // The name field is a dropdown of every real room (GET /rooms), not
  // free text - so a user can only ever search for a room that actually
  // exists, instead of typing a name that silently matches nothing.
  useEffect(() => {
    listRooms({ pageSize: 100 })
      .then((r) => setAllRooms(r.rooms))
      .catch(() => setAllRooms([]));
  }, []);

  function handleField(field: keyof RoomSearchFilters) {
    return (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...filters, [field]: e.target.value });
  }

  // Only the ceiling is clamped live (typing "1" while building "10"
  // must not get bumped up to the floor mid-keystroke) - the floor is
  // enforced on blur instead, once the user has finished typing.
  function handleCapacityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const clamped = e.target.value === '' ? '' : Math.min(Number(e.target.value), MAX_CAPACITY);
    onChange({ ...filters, minCapacity: String(clamped) });
  }

  function handleCapacityBlur() {
    const n = Number(filters.minCapacity);
    if (filters.minCapacity !== '' && n < MIN_CAPACITY) {
      onChange({ ...filters, minCapacity: String(MIN_CAPACITY) });
    }
  }

  function toggleAttribute(name: string) {
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
        Name
        <Select
          value={filters.name}
          onChange={(value) => onChange({ ...filters, name: value })}
          placeholder="Any room"
          options={[
            { value: '', label: 'Any room' },
            ...allRooms.map((room) => ({ value: room.name, label: `${room.name} — ${formatFloorLabel(room.floor)}` })),
          ]}
        />
      </label>
      <label>
        Date
        <DatePicker value={filters.date} onChange={(value) => onChange({ ...filters, date: value })} required disablePast />
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
          min={MIN_CAPACITY}
          max={MAX_CAPACITY}
          value={filters.minCapacity}
          onChange={handleCapacityChange}
          onBlur={handleCapacityBlur}
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
