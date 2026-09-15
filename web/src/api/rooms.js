// src/api/rooms.js
import { apiFetch } from './client.js';

export async function listRooms() {
  const { rooms } = await apiFetch('/rooms');
  return rooms;
}

/**
 * @param {{ startTime: string, endTime: string, minCapacity?: number, attributes?: string[] }} filters
 */
export async function searchAvailableRooms(filters) {
  const params = new URLSearchParams({
    startTime: filters.startTime,
    endTime: filters.endTime,
    ...(filters.minCapacity ? { minCapacity: String(filters.minCapacity) } : {}),
    ...(filters.attributes?.length ? { attributes: filters.attributes.join(',') } : {}),
  });
  const { rooms } = await apiFetch(`/rooms/search?${params.toString()}`);
  return rooms;
}

export async function createRoom(input) {
  const { room } = await apiFetch('/rooms', { method: 'POST', body: JSON.stringify(input) });
  return room;
}

export async function updateRoom(roomId, input) {
  const { room } = await apiFetch(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(input) });
  return room;
}
