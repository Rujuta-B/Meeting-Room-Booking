// src/components/bookings/ValidationErrorList.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ValidationErrorList, FieldError } from './ValidationErrorList';

describe('ValidationErrorList', () => {
  it('renders nothing when there are no errors', () => {
    const { container } = render(<ValidationErrorList errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only errors whose field is not already shown inline via knownFields', () => {
    render(
      <ValidationErrorList
        errors={[
          { field: 'email', message: 'Email is invalid.' },
          { field: 'startTime', message: 'startTime must be in the future.' },
        ]}
        knownFields={['email']}
      />,
    );

    expect(screen.queryByText('Email is invalid.')).not.toBeInTheDocument();
    expect(screen.getByText('startTime must be in the future.')).toBeInTheDocument();
  });
});

describe('FieldError', () => {
  it('renders the message for a matching field', () => {
    render(<FieldError errors={[{ field: 'email', message: 'Email is invalid.' }]} field="email" />);
    expect(screen.getByText('Email is invalid.')).toBeInTheDocument();
  });

  it('renders nothing when no error matches the field', () => {
    const { container } = render(
      <FieldError errors={[{ field: 'password', message: 'Too short.' }]} field="email" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
