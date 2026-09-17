// src/components/DatePicker.jsx
//
// A calendar-only date picker: unlike a native <input type="date">, the
// popup calendar is the ONLY way to choose a date - there's no text field
// to type "31/04/234234" into. Used for both future booking dates (where
// `disablePast` rules out anything before today, rejected as unclickable
// rather than after the fact) and past-inclusive date ranges like
// reporting filters (where `disablePast` is omitted).
import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

function toDateOnly(isoLike) {
  if (!isoLike) return undefined;
  const [year, month, day] = isoLike.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @param {{ value: string, onChange: (value: string) => void, id?: string, required?: boolean, max?: string, disablePast?: boolean }} props
 * `value`/`onChange` use the same "YYYY-MM-DD" string shape as a native
 * `<input type="date">`, so this drops into existing form state unchanged.
 * `max`, when given, disables any date after it, matching the native
 * input's `max` attribute. `disablePast` disables any date before today,
 * for booking-style fields where only future dates make sense.
 */
export function DatePicker({ value, onChange, id, required, max, disablePast }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = toDateOnly(value);
  const today = startOfToday();
  const maxDate = toDateOnly(max);

  const disabledMatchers = [
    ...(disablePast ? [{ before: today }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleSelect(date) {
    if (!date) return;
    onChange(toDateInputValue(date));
    setOpen(false);
  }

  return (
    <div className="date-picker" ref={containerRef}>
      <button
        type="button"
        id={id}
        className="date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? '' : 'date-picker-placeholder'}>
          {selected
            ? selected.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
            : 'Select a date'}
        </span>
        <span className="date-picker-icon" aria-hidden="true">
          📅
        </span>
      </button>
      {/* A required-but-hidden input so native form validation ("please
          fill out this field") still fires for this field, since the
          visible control is a button, not a real form input. */}
      {required && <input type="text" value={value} required onChange={() => {}} className="date-picker-validation-shim" tabIndex={-1} />}
      {open && (
        <div className="date-picker-popover" role="dialog">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
            defaultMonth={selected ?? today}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}
