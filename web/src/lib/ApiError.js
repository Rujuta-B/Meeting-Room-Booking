// src/lib/ApiError.js
//
// WHY a dedicated error class instead of just throwing whatever the fetch
// response gave us: every place that catches an API failure (a form's
// submit handler, a page's data-loading effect) needs to reliably ask
// "what KIND of failure was this" - a booking conflict, a validation
// error, an expired session, or something totally unexpected. Carrying
// `.code` (the backend's stable error code - see api/src/lib/errors.ts)
// and `.details` (extra structured data, like a list of field errors)
// lets calling code `switch (err.code)` instead of parsing message text,
// which is free to change wording without breaking anything that reads it.
export class ApiError extends Error {
  constructor(code, status, details) {
    super(details?.message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
