// tests/helpers/factories.ts
//
// Small helpers to create real rows through the real service layer / DB -
// avoids repeating "create a user, hash a password, sign a token" in every
// single test file. Each test file calls resetDatabase() in a
// beforeEach() so tests never see leftover rows from a previous test
// (this is what fileParallelism: false in vitest.config.ts protects, and
// why it's necessary).
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/prisma/client.js';
import { signAccessToken } from '../../src/lib/jwt.js';

// TRUNCATE ... CASCADE, not deleteMany() per table: this is faster and,
// more importantly, resets Postgres's own internal state (any
// auto-generated sequences, though we don't use them here since ids are
// UUIDs) cleanly between tests - deleteMany() would still leave the
// exclusion constraint's GiST index containing "empty space" rather than a
// truly fresh table. CASCADE handles foreign-key ordering automatically so
// we don't have to list tables in dependency order by hand.
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE bookings, booking_series, room_attributes, attributes, rooms, refresh_tokens, users RESTART IDENTITY CASCADE;',
  );
}

interface TestUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  accessToken: string;
}

export async function createTestUser(overrides: { role?: 'USER' | 'ADMIN'; email?: string } = {}): Promise<TestUser> {
  const email = overrides.email ?? `user-${randomUUID()}@example.com`;
  const passwordHash = await bcrypt.hash('TestPass123', 4); // low cost factor - tests don't need production hashing cost, just correctness
  const user = await prisma.user.create({
    data: { email, passwordHash, role: overrides.role ?? 'USER' },
  });

  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return { id: user.id, email: user.email, role: user.role, accessToken };
}

export async function createTestRoom(overrides: { capacity?: number; name?: string; location?: string } = {}) {
  return prisma.room.create({
    data: {
      name: overrides.name ?? `Room ${randomUUID().slice(0, 8)}`,
      location: overrides.location ?? 'Test Floor',
      capacity: overrides.capacity ?? 10,
    },
  });
}

// Booking creation/search deliberately rejects any startTime that isn't in
// the future (see CreateBookingSchema/SearchAvailabilitySchema) - so tests
// can't use a fixed calendar date literal (it eventually becomes "the
// past" and every test using it starts failing with an unrelated 400).
// Instead, every test builds its times relative to "now" via this helper:
// `daysFromNow(10, '10:00')` always means "10 days from whenever the
// suite runs, at 10:00 UTC" - so the whole suite stays valid indefinitely.
export function daysFromNow(days: number, hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hours, minutes, 0, 0);
  return date.toISOString();
}
