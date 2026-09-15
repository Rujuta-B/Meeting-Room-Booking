// src/routes/AdminRoomsPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { listRooms, createRoom, updateRoom } from '../api/rooms.js';
import { RoomForm } from '../components/admin/RoomForm.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';

export function AdminRoomsPage() {
  const [rooms, setRooms] = useState(null);
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRooms(await listRooms());
    } catch {
      setError('Could not load rooms.');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate(input) {
    setError(null);
    setSubmitting(true);
    try {
      await createRoom(input);
      await reload();
    } catch {
      setError('Could not create the room.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(roomId, input) {
    setError(null);
    setSubmitting(true);
    try {
      await updateRoom(roomId, input);
      setEditingRoomId(null);
      await reload();
    } catch {
      setError('Could not update the room.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!rooms) return <p>Loading…</p>;

  const editingRoom = rooms.find((r) => r.id === editingRoomId);

  return (
    <div className="admin-rooms-page">
      <h1>Manage rooms</h1>
      {error && <ErrorBanner message={error} />}

      <section>
        <h2>{editingRoom ? `Edit ${editingRoom.name}` : 'Add a room'}</h2>
        <RoomForm
          key={editingRoomId ?? 'new'} // remount the form with fresh defaults whenever the target room changes
          initial={editingRoom}
          submitting={submitting}
          onSubmit={(input) => (editingRoom ? handleUpdate(editingRoom.id, input) : handleCreate(input))}
        />
        {editingRoom && (
          <button type="button" onClick={() => setEditingRoomId(null)}>
            Cancel edit
          </button>
        )}
      </section>

      <section>
        <h2>Existing rooms</h2>
        <ul className="admin-room-list">
          {rooms.map((room) => (
            <li key={room.id}>
              <strong>{room.name}</strong> — {room.location}, capacity {room.capacity}
              {room.attributes.length > 0 && <> ({room.attributes.map((a) => a.attribute.name).join(', ')})</>}
              <button type="button" onClick={() => setEditingRoomId(room.id)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
