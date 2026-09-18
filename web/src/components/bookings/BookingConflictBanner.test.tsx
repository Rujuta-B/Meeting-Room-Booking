// src/components/bookings/BookingConflictBanner.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingConflictBanner } from './BookingConflictBanner';

describe('BookingConflictBanner', () => {
  it('renders the conflict explanation as an alert', () => {
    render(<BookingConflictBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('This slot was just booked by someone else.');
  });

  it('does not render a dismiss button when onDismiss is not provided', () => {
    render(<BookingConflictBanner />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<BookingConflictBanner onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
