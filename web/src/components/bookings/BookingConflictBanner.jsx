// src/components/bookings/BookingConflictBanner.jsx
//
// WHY this gets its OWN component, rendered inline and persistent - not a
// generic toast that vanishes after a few seconds: a 409 BOOKING_CONFLICT
// is the headline "does the concurrency guarantee actually work"
// moment (see api's EXCLUDE constraint) - it deserves a distinct,
// reassuring explanation, not a generic "something went wrong." It's
// framed as an EXPECTED outcome of two people racing for the same slot,
// not a system failure, because that's literally what happened and
// what the system is supposed to do.
export function BookingConflictBanner({ onDismiss }) {
  return (
    <div className="banner banner-conflict" role="alert">
      <p>
        <strong>This slot was just booked by someone else.</strong> Someone beat you to it — pick another
        time or room below. The list of available times has been refreshed.
      </p>
      {onDismiss && (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
