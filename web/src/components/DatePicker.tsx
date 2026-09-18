// src/components/DatePicker.tsx
//
// A calendar-only date picker: unlike a native <input type="date">, the
// popup calendar is the ONLY way to choose a date - there's no text field
// to type "31/04/234234" into. Used for both future booking dates (where
// `disablePast` rules out anything before today, rejected as unclickable
// rather than after the fact) and past-inclusive date ranges like
// reporting filters (where `disablePast` is omitted).
import { useEffect, useRef, useState } from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import 'react-day-picker/style.css';
import { todayInIst } from '../lib/istTime';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateOnly(isoLike: string | undefined): Date | undefined {
  if (!isoLike) return undefined;
  const [year, month, day] = isoLike.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return undefined;
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "Today" for this picker must be IST's today, not the browser/OS's local
// today - every value fed into this component (`value`, `max`) is an
// IST calendar date string produced by lib/istTime.ts, so comparing against
// a browser-local "today" desyncs the enabled/disabled range on any machine
// not set to IST (this was the root cause of the shorten date picker
// appearing entirely unusable on non-IST systems).
function startOfToday(): Date {
  return toDateOnly(todayInIst())!;
}

// Formats a "YYYY-MM-DD" string directly from its own parts, with no
// Date/timezone round-trip - the label must show the calendar date the
// string encodes, regardless of the viewer's local timezone.
function formatDateLabel(isoLike: string): string {
  const [year, month, day] = isoLike.split('-').map(Number);
  const asUtc = new Date(Date.UTC(year!, month! - 1, day!));
  const weekday = WEEKDAY_LABELS[asUtc.getUTCDay()];
  return `${weekday}, ${MONTH_LABELS[asUtc.getUTCMonth()]} ${asUtc.getUTCDate()}, ${asUtc.getUTCFullYear()}`;
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  max?: string;
  disablePast?: boolean;
}

// `value`/`onChange` use the same "YYYY-MM-DD" string shape as a native
// `<input type="date">`, so this drops into existing form state unchanged.
// `max`, when given, disables any date after it, matching the native
// input's `max` attribute. `disablePast` disables any date before today,
// for booking-style fields where only future dates make sense.
export function DatePicker({ value, onChange, id, required, max, disablePast }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = toDateOnly(value);
  const today = startOfToday();
  const maxDate = toDateOnly(max);

  const disabledMatchers: Matcher[] = [
    ...(disablePast ? [{ before: today }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleSelect(date: Date | undefined) {
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
          {value ? formatDateLabel(value) : 'Select a date'}
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
