// src/api/admin.js
import { apiFetch } from './client.js';

export async function getUtilisationReport(rangeStart, rangeEnd) {
  const params = new URLSearchParams({ rangeStart, rangeEnd });
  const { report } = await apiFetch(`/utilisation?${params.toString()}`);
  return report;
}
