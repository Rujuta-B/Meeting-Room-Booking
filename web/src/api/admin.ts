// src/api/admin.ts
import { apiFetch } from './client';
import type { PaginationMeta } from '../types/api';
import type { UtilisationReportRow, DayTimelineSlot } from '../types/utilisation';

export interface UtilisationReportOptions {
  roomId?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export async function getUtilisationReport(
  rangeStart: string,
  rangeEnd: string,
  { roomId, page, pageSize }: UtilisationReportOptions = {},
): Promise<{ report: UtilisationReportRow[]; pagination: PaginationMeta }> {
  const params = new URLSearchParams({
    rangeStart,
    rangeEnd,
    ...(roomId ? { roomId } : {}),
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });
  return apiFetch(`/utilisation?${params.toString()}`);
}

export async function getRoomDayTimeline(roomId: string, date: string): Promise<{ slots: DayTimelineSlot[] }> {
  const params = new URLSearchParams({ roomId, date });
  return apiFetch(`/utilisation/day-timeline?${params.toString()}`);
}
