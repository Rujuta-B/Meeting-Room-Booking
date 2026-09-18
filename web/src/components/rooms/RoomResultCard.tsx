// src/components/rooms/RoomResultCard.tsx
import { Link } from 'react-router-dom';
import { formatFloorLabel } from '../../lib/floor';
import type { AvailableRoom } from '../../types/room';

export interface RoomResultCardProps {
  room: AvailableRoom;
  startTime: string;
  endTime: string;
}

export function RoomResultCard({ room, startTime, endTime }: RoomResultCardProps) {
  // Pre-fill the booking form's room + time via the URL's query string, so
  // BookingFormPage doesn't need any prop-drilling or global state to know
  // what the user was searching for - the URL IS the state, which also
  // means the booking page is directly linkable/refreshable on its own.
  const params = new URLSearchParams({ roomId: room.id, startTime, endTime });

  return (
    <div className="room-card">
      <h3>{room.name}</h3>
      <p>{formatFloorLabel(room.floor)}</p>
      <p>Capacity: {room.capacity}</p>
      {room.attributes.length > 0 && (
        <div className="attribute-tags">
          {room.attributes.map((attribute) => (
            <span key={attribute} className="attribute-tag">
              {attribute}
            </span>
          ))}
        </div>
      )}
      <Link to={`/book?${params.toString()}`}>Book this room</Link>
    </div>
  );
}
