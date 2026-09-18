// src/types/api.ts
//
// Shared wire-level shapes for the API layer. ApiErrorCode/ApiErrorBody
// mirror api/src/lib/errors.ts's error codes and errorHandler.ts's actual
// response shape: { error: { code, message, ...spread details } } - e.g.
// ValidationError's details = { errors: [...] } spreads as a SIBLING of
// code/message (error.errors), not nested under a details key.
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BOOKING_CONFLICT'
  | 'BOOKING_ALREADY_STARTED'
  | 'BOOKING_TOO_CLOSE_TO_END'
  | 'ROOM_DUPLICATE'
  | 'EMAIL_TAKEN'
  | 'SESSION_EXPIRED'
  | 'UNKNOWN'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  errors?: Array<{ field: string; message: string }>; // present only for VALIDATION_ERROR
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
