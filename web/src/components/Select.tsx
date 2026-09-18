// src/components/Select.tsx
//
// A custom dropdown that visually matches DatePicker.tsx (same
// button-trigger + popover pattern), so every dropdown in the app looks
// the same regardless of browser/OS instead of relying on each browser's
// own native <select> rendering.
import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}

// `value`/`onChange` use the same string shape as a native `<select>`, so
// this drops into existing form state unchanged.
export function Select({ value, onChange, options, placeholder = 'Select…', id, required, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.value === value);

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

  function handlePick(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  return (
    <div className="select" ref={containerRef}>
      <button
        type="button"
        id={id}
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selectedOption ? '' : 'select-placeholder'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="select-icon" aria-hidden="true">
          ▾
        </span>
      </button>
      {/* A required-but-hidden input so native form validation ("please
          fill out this field") still fires for this field, since the
          visible control is a button, not a real form input. */}
      {required && <input type="text" value={value} required onChange={() => {}} className="select-validation-shim" tabIndex={-1} />}
      {open && (
        <div className="select-popover" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`select-option ${option.value === value ? 'select-option-selected' : ''}`}
              onClick={() => handlePick(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
