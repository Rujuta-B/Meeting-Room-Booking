// src/components/bookings/ValidationErrorList.jsx
//
// Renders the backend's { errors: [{ field, message }] } shape (see
// api/src/lib/errors.ts's ValidationError) as field-level messages -
// mapped to actual form fields wherever possible, rather than one opaque
// "validation failed" banner. Any error whose `field` doesn't match a
// known input on this form (or is the schema's own "(root)" catch-all)
// still needs to be visible SOMEWHERE, so it renders in a small fallback
// list - this should be the exception, not the default path for a
// well-designed form.
export function ValidationErrorList({ errors, knownFields = [] }) {
  if (!errors?.length) return null;

  const unmapped = errors.filter((e) => !knownFields.includes(e.field));

  if (unmapped.length === 0) return null; // every error is already shown inline next to its field

  return (
    <ul className="validation-error-list" role="alert">
      {unmapped.map((e, i) => (
        <li key={`${e.field}-${i}`}>{e.message}</li>
      ))}
    </ul>
  );
}

// Small helper a form can use next to a specific input:
// <FieldError errors={errors} field="email" />
export function FieldError({ errors, field }) {
  const match = errors?.find((e) => e.field === field);
  if (!match) return null;
  return <span className="field-error">{match.message}</span>;
}
