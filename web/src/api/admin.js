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
