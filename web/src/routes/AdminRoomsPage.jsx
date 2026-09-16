// src/routes/AdminRoomsPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { listRooms, createRoom, updateRoom } from '../api/rooms.js';
import { RoomForm } from '../components/admin/RoomForm.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { Pagination } from '../components/Pagination.jsx';

export function AdminRoomsPage() {
  const [rooms, setRooms] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [nameFilter, setNameFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await listRooms({ name: nameFilter.trim() || undefined, page });
      setRooms(result.rooms);
      setPagination(result.pagination);
    } catch {
      setError('Could not load rooms.');
    }
  }, [nameFilter, page]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Any change to the search term restarts from page 1 - staying on, say,
  // page 3 of an old, wider result set after narrowing the search would
  // silently show an empty or wrong page.
  function handleNameFilterChange(value) {
    setNameFilter(value);
    setPage(1);
  }

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
        <label className="admin-room-search">
          Search by name or location
          <input
            type="text"
            placeholder="e.g. Aspen, 3rd floor"
            value={nameFilter}
            onChange={(e) => handleNameFilterChange(e.target.value)}
          />
        </label>
        {rooms.length === 0 ? (
          <p>No rooms match that search.</p>
        ) : (
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
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </section>
    </div>
  );
}
