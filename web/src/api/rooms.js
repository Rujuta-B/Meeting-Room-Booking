// src/api/rooms.js
import { apiFetch } from './client.js';

/**
 * @param {{ name?: string, page?: number, pageSize?: number }} [options]
 * @returns {Promise<{ rooms: object[], pagination: { page: number, pageSize: number, total: number, totalPages: number } }>}
 */
export async function listRooms({ name, page, pageSize } = {}) {
  const params = new URLSearchParams({
    ...(name ? { name } : {}),
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return apiFetch(`/rooms${suffix}`);
}

export async function listAttributes() {
  const { attributes } = await apiFetch('/rooms/attributes');
  return attributes;
}

/**
 * @param {{ startTime: string, endTime: string, minCapacity?: number, attributes?: string[], name?: string, page?: number, pageSize?: number }} filters
 * @returns {Promise<{ rooms: object[], pagination: { page: number, pageSize: number, total: number, totalPages: number } }>}
 */
export async function searchAvailableRooms(filters) {
  const params = new URLSearchParams({
    startTime: filters.startTime,
    endTime: filters.endTime,
    ...(filters.minCapacity ? { minCapacity: String(filters.minCapacity) } : {}),
    ...(filters.attributes?.length ? { attributes: filters.attributes.join(',') } : {}),
    ...(filters.name ? { name: filters.name } : {}),
    ...(filters.page ? { page: String(filters.page) } : {}),
    ...(filters.pageSize ? { pageSize: String(filters.pageSize) } : {}),
  });
  return apiFetch(`/rooms/search?${params.toString()}`);
}

export async function createRoom(input) {
  const { room } = await apiFetch('/rooms', { method: 'POST', body: JSON.stringify(input) });
  return room;
}

export async function updateRoom(roomId, input) {
  const { room } = await apiFetch(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(input) });
  return room;
}
