// src/components/admin/RoomForm.jsx
import { useEffect, useState } from 'react';
import { listAttributes } from '../../api/rooms.js';
import { FLOOR_OPTIONS, formatFloorLabel } from '../../lib/floor.js';
import { MIN_CAPACITY, MAX_CAPACITY } from '../../lib/capacity.js';
import { Select } from '../Select.jsx';

export function RoomForm({ initial, onSubmit, submitting, serverError }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [floor, setFloor] = useState(initial?.floor ?? 1);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 4);
  const [capacityError, setCapacityError] = useState(null);
  const [knownAttributes, setKnownAttributes] = useState([]);
  const [selectedAttributes, setSelectedAttributes] = useState(
    initial?.attributes?.map((a) => a.attribute.name) ?? [],
  );
  const [newAttribute, setNewAttribute] = useState('');

  useEffect(() => {
    listAttributes()
      .then(setKnownAttributes)
      .catch(() => setKnownAttributes([]));
  }, []);

  function toggleAttribute(attrName) {
    setSelectedAttributes((prev) =>
      prev.includes(attrName) ? prev.filter((a) => a !== attrName) : [...prev, attrName],
    );
  }

  function addNewAttribute() {
    const trimmed = newAttribute.trim();
    if (trimmed && !selectedAttributes.includes(trimmed)) {
      setSelectedAttributes((prev) => [...prev, trimmed]);
    }
    setNewAttribute('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    // A real, blocking check - the input's `min`/`max` attributes below are
    // only a hint, not a guarantee (a user can type past them, e.g.
    // "10000000000"), and the backend enforces the same 2-500 bounds too
    // (see the API's CreateRoomSchema) - this just gives immediate
    // feedback instead of a round trip to learn the same thing.
    const numericCapacity = Number(capacity);
    if (!Number.isInteger(numericCapacity) || numericCapacity < MIN_CAPACITY || numericCapacity > MAX_CAPACITY) {
      setCapacityError(`Capacity must be a whole number between ${MIN_CAPACITY} and ${MAX_CAPACITY}.`);
      return;
    }
    setCapacityError(null);
    onSubmit({
      name,
      floor: Number(floor),
      capacity: numericCapacity,
      attributes: selectedAttributes,
    });
  }

  const unknownSelected = selectedAttributes.filter((a) => !knownAttributes.some((k) => k.name === a));

  return (
    <form className="room-form" onSubmit={handleSubmit}>
      {serverError && (
        <p className="field-error" role="alert">
          {serverError}
        </p>
      )}
      <label>
        Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Floor
        <Select
          value={String(floor)}
          onChange={(value) => setFloor(Number(value))}
          required
          options={FLOOR_OPTIONS.map((f) => ({ value: String(f), label: formatFloorLabel(f) }))}
        />
      </label>
      <label>
        Capacity
        <input
          type="number"
          min={MIN_CAPACITY}
          max={MAX_CAPACITY}
          value={capacity}
          onChange={(e) => {
            setCapacity(e.target.value);
            const n = Number(e.target.value);
            if (capacityError && Number.isInteger(n) && n >= MIN_CAPACITY && n <= MAX_CAPACITY) {
              setCapacityError(null);
            }
          }}
          required
        />
        {capacityError && (
          <span className="field-error" role="alert">
            {capacityError}
          </span>
        )}
      </label>
      <fieldset className="room-form-attributes">
        <legend>Attributes</legend>
        {knownAttributes.map((attr) => (
          <label key={attr.id} className="checkbox-label">
            <input
              type="checkbox"
              checked={selectedAttributes.includes(attr.name)}
              onChange={() => toggleAttribute(attr.name)}
            />
            {attr.name}
          </label>
        ))}
        {unknownSelected.map((a) => (
          <label key={a} className="checkbox-label">
            <input type="checkbox" checked readOnly onClick={() => toggleAttribute(a)} />
            {a} <em>(new)</em>
          </label>
        ))}
        <div className="add-attribute-row">
          <input
            type="text"
            placeholder="Add new attribute"
            value={newAttribute}
            onChange={(e) => setNewAttribute(e.target.value)}
          />
          <button type="button" onClick={addNewAttribute}>
            Add
          </button>
        </div>
      </fieldset>
      <button type="submit" disabled={submitting}>
        {initial ? 'Save changes' : 'Create room'}
      </button>
    </form>
  );
}
