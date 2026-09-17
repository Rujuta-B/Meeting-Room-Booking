-- Adds a fixed recurrence cadence (DAILY/WEEKLY/MONTHLY) to BookingSeries,
-- replacing the old "just space occurrences 7 days apart, always" behavior
-- with an explicit, closed set of patterns a person actually thinks in.
--
-- Backfill note: every BookingSeries row created before this migration was
-- created under the old always-7-days-apart logic, which IS what WEEKLY
-- means - so existing rows are labeled 'WEEKLY' below before the column is
-- made required. This only labels existing series METADATA correctly; it
-- does not touch, alter, or delete any Booking (occurrence) row.

CREATE TYPE "RecurrencePattern" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "booking_series" ADD COLUMN "pattern" "RecurrencePattern";
ALTER TABLE "booking_series" ADD COLUMN "day_of_month" INTEGER;

-- Every existing series was weekly-only behavior - backfill before NOT NULL.
UPDATE "booking_series" SET "pattern" = 'WEEKLY' WHERE "pattern" IS NULL;
ALTER TABLE "booking_series" ALTER COLUMN "pattern" SET NOT NULL;

-- day_of_week is now meaningful only for WEEKLY series (null for
-- DAILY/MONTHLY going forward), so it can no longer be required for every row.
ALTER TABLE "booking_series" ALTER COLUMN "day_of_week" DROP NOT NULL;
