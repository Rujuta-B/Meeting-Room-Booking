// src/lib/capacity.ts
//
// The one shared floor/cap for any room-capacity input on the frontend,
// matching the backend's room capacity bounds (see the API's
// CreateRoomSchema) - kept here so every filter/form clamps to the same
// numbers instead of each component picking its own limit. A "room" for
// exactly one person isn't a meeting room, hence the floor of 2.
export const MIN_CAPACITY = 2;
export const MAX_CAPACITY = 500;
