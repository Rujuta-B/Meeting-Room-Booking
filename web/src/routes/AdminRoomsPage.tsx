// src/routes/AdminRoomsPage.tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { listRooms, createRoom, updateRoom } from '../api/rooms';
import { RoomForm } from '../components/admin/RoomForm';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { ApiError } from '../lib/ApiError';
import { useToast } from '../components/ToastProvider';
import { formatFloorLabel } from '../lib/floor';
import type { Room, CreateRoomInput } from '../types/room';
import type { PaginationMeta } from '../types/api';

export function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [highlightForm, setHighlightForm] = useState(false);
  const formSectionRef = useRef<HTMLElement>(null);
  const showToast = useToast();

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
  function handleNameFilterChange(value: string) {
    setNameFilter(value);
    setPage(1);
  }

  function handleEditClick(roomId: string) {
    setEditingRoomId(roomId);
    setFormError(null);
    if (formSectionRef.current) {
      // Plain scrollIntoView({ block: 'start' }) aligns the section's top edge
      // with the viewport top, which lands right under the sticky navbar and
      // hides the heading/first field - so offset by the navbar's own height.
      const navbarHeight = document.querySelector('.navbar')?.getBoundingClientRect().height ?? 0;
      const top = formSectionRef.current.getBoundingClientRect().top + window.scrollY - navbarHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setHighlightForm(true);
    setTimeout(() => setHighlightForm(false), 1200); // matches the CSS pulse animation's duration
  }

  async function handleCreate(input: CreateRoomInput) {
    setError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await createRoom(input);
      await reload();
      showToast('Room created.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ROOM_DUPLICATE') {
        setFormError(err.message);
      } else {
        setError('Could not create the room.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(roomId: string, input: CreateRoomInput) {
    setError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await updateRoom(roomId, input);
      setEditingRoomId(null);
      await reload();
      showToast('Room updated.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ROOM_DUPLICATE') {
        setFormError(err.message);
      } else {
        setError('Could not update the room.');
      }
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

      <section ref={formSectionRef} className={highlightForm ? 'room-form-section highlight-pulse' : 'room-form-section'}>
        <h2>{editingRoom ? `Edit ${editingRoom.name}` : 'Add a room'}</h2>
        <RoomForm
          key={editingRoomId ?? 'new'} // remount the form with fresh defaults whenever the target room changes
          initial={editingRoom}
          submitting={submitting}
          serverError={formError ?? undefined}
          onSubmit={(input) => (editingRoom ? handleUpdate(editingRoom.id, input) : handleCreate(input))}
        />
        {editingRoom && (
          <button type="button" onClick={() => { setEditingRoomId(null); setFormError(null); }}>
            Cancel edit
          </button>
        )}
      </section>

      <section>
        <h2>Existing rooms</h2>
        <label className="admin-room-search">
          Search by name
          <input
            type="text"
            placeholder="e.g. Cedar"
            value={nameFilter}
            onChange={(e) => handleNameFilterChange(e.target.value)}
          />
        </label>
        {rooms.length === 0 ? (
          <p>No rooms match that search.</p>
        ) : (
          <ul className="admin-room-grid">
            {rooms.map((room) => (
              <li key={room.id} className={`room-card admin-room-card ${editingRoomId === room.id ? 'admin-room-card-editing' : ''}`}>
                <div className="admin-room-card-header">
                  <div>
                    <h3>{room.name}</h3>
                    <p>{formatFloorLabel(room.floor)}</p>
                    <p>Capacity: {room.capacity}</p>
                  </div>
                  <button type="button" onClick={() => handleEditClick(room.id)}>
                    Edit
                  </button>
                </div>
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
        <Pagination pagination={pagination} onPageChange={setPage} />
      </section>
    </div>
  );
}
