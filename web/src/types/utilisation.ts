// src/types/utilisation.ts
//
// utilisation is the one backend module without a schemas.ts (see
// api/src/modules/utilisation/utilisation.service.ts) - these shapes are
// reverse-engineered directly from that service's return types rather than
// mirrored from a Zod schema. weekStart/startTime/endTime are ISO strings
// over the wire (Date objects only exist server-side).
export interface UtilisationReportRow {
  roomId: string;
  roomName: string;
  weekStart: string;
  hoursBooked: number;
  hoursAvailable: number;
  utilisationPct: number;
}

export interface DayTimelineSlot {
  bookingId: string;
  startTime: string;
  endTime: string;
  userEmail: string;
}
