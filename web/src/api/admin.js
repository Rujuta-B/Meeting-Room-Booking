// src/api/admin.js
import { apiFetch } from './client.js';

/**
 * @param {string} rangeStart
 * @param {string} rangeEnd
 * @param {{ roomId?: string, page?: number, pageSize?: number }} [options]
 * @returns {Promise<{ report: object[], pagination: { page: number, pageSize: number, total: number, totalPages: number } }>}
 */
export async function getUtilisationReport(rangeStart, rangeEnd, { roomId, page, pageSize } = {}) {
  const params = new URLSearchParams({
    rangeStart,
    rangeEnd,
    ...(roomId ? { roomId } : {}),
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });
  return apiFetch(`/utilisation?${params.toString()}`);
}

/**
 * @param {string} roomId
 * @param {string} date - an ISO date string, e.g. "2026-09-17"
 * @returns {Promise<{ slots: Array<{ bookingId: string, startTime: string, endTime: string }> }>}
 */
export async function getRoomDayTimeline(roomId, date) {
  const params = new URLSearchParams({ roomId, date });
  return apiFetch(`/utilisation/day-timeline?${params.toString()}`);
}
