// src/components/ErrorBanner.jsx
//
// The LAST-RESORT fallback - only reached after a caller has already
// checked for the specific, expected error codes (BOOKING_CONFLICT,
// VALIDATION_ERROR) and this wasn't one of them. Genuinely unexpected
// failures (500, network drop) still need SOME visible feedback, but
// shouldn't pretend to explain what went wrong since we don't know.
export function ErrorBanner({ message }) {
  return (
    <div className="banner banner-error" role="alert">
      {message || 'Something went wrong. Please try again.'}
    </div>
  );
}
