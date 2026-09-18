// src/api/rooms.ts
import { apiFetch } from './client';
import type { PaginationMeta } from '../types/api';
import type { Room, AvailableRoom, RoomAttribute, CreateRoomInput, UpdateRoomInput } from '../types/room';

// `| undefined` spelled out explicitly (not just `?:`) so callers can pass
// through a value that's ALREADY `string | undefined` (e.g. `x || undefined`)
// without exactOptionalPropertyTypes rejecting the assignment - this is a
// plain request-options bag, not a domain shape where the distinction
// between "absent" and "explicitly undefined" matters.
export interface ListRoomsOptions {
  name?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export async function listRooms(
  { name, page, pageSize }: ListRoomsOptions = {},
): Promise<{ rooms: Room[]; pagination: PaginationMeta }> {
  const params = new URLSearchParams({
    ...(name ? { name } : {}),
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return apiFetch(`/rooms${suffix}`);
}

export async function listAttributes(): Promise<RoomAttribute[]> {
  const { attributes } = await apiFetch<{ attributes: RoomAttribute[] }>('/rooms/attributes');
  return attributes;
}

export interface SearchAvailableRoomsFilters {
  startTime: string;
  endTime: string;
  minCapacity?: number | undefined;
  attributes?: string[] | undefined;
  name?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export async function searchAvailableRooms(
  filters: SearchAvailableRoomsFilters,
): Promise<{ rooms: AvailableRoom[]; pagination: PaginationMeta }> {
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

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const { room } = await apiFetch<{ room: Room }>('/rooms', { method: 'POST', body: JSON.stringify(input) });
  return room;
}

export async function updateRoom(roomId: string, input: UpdateRoomInput): Promise<Room> {
  const { room } = await apiFetch<{ room: Room }>(`/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return room;
}
