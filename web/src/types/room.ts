// src/types/room.ts
//
// Two distinct room shapes, matching a real divergence in the backend
// (api/src/modules/rooms/rooms.service.ts): listRooms/createRoom/updateRoom
// return the raw Prisma join shape for attributes, while
// searchAvailableRooms (the raw-SQL /rooms/search path) returns an
// already-flattened string[] of attribute names. These are NOT
// interchangeable - do not merge them into one type.
export interface RoomAttribute {
  id: string;
  name: string;
}

// listRooms / createRoom / updateRoom response shape.
export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  attributes: Array<{ attribute: RoomAttribute }>;
}

// searchAvailableRooms (/rooms/search) response shape - attributes already
// flattened to plain names server-side.
export interface AvailableRoom {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  attributes: string[];
}

// Request payload shapes, hand-mirrored from api/src/modules/rooms/rooms.schemas.ts
// (CreateRoomSchema / UpdateRoomSchema = CreateRoomSchema.partial()) - keep in sync.
export interface CreateRoomInput {
  name: string;
  floor: number;
  capacity: number;
  attributes?: string[];
}

export interface UpdateRoomInput {
  name?: string;
  floor?: number;
  capacity?: number;
  attributes?: string[];
}

export function roomAttributeNames(room: Room): string[] {
  return room.attributes.map((a) => a.attribute.name);
}

// Page-local UI filter state (RoomSearchPage owns it, RoomFilterBar is a
// controlled form over it) - all fields are strings because they're bound
// directly to <input>/<Select> values, not yet parsed into the numeric/Date
// types the actual /rooms/search request needs.
export interface RoomSearchFilters {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  minCapacity: string;
  attributes: string[];
}
