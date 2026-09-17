-- Replaces the free-text `location` column with a typed, bounded `floor`
-- integer. Free text let the same floor end up recorded as "Floor 2",
-- "2nd floor", or "2" depending on who typed it - a plain bounded int
-- makes that structurally impossible and lets the app render one
-- consistent label ("2nd floor") everywhere from a single source value.
--
-- Hand-written (not `prisma migrate dev`-generated) because this is a
-- rename-with-backfill: Prisma's own diffing would want to drop the old
-- column and add the new one as two independent, data-losing operations.
-- Existing seeded/test rooms all have `location` values of the exact form
-- "Floor N", so the backfill below is lossless for all current data.

ALTER TABLE "rooms" ADD COLUMN "floor" INTEGER;

UPDATE "rooms"
SET "floor" = COALESCE(NULLIF(regexp_replace("location", '\D', '', 'g'), '')::int, 1);

ALTER TABLE "rooms" ALTER COLUMN "floor" SET NOT NULL;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_range" CHECK ("floor" BETWEEN 1 AND 50);

-- The old trigram index backed ILIKE '%term%' search against `location`
-- (see 20260101000002_add_room_name_search_index) - floor is a plain int
-- now, which ILIKE can't usefully match, so room search becomes name-only
-- and this index has no remaining purpose. The trigram index on `name`
-- alone (rooms_name_trgm_idx) is untouched - name search still needs it.
DROP INDEX IF EXISTS "rooms_location_trgm_idx";

DROP INDEX IF EXISTS "rooms_name_location_key";
CREATE UNIQUE INDEX "rooms_name_floor_key" ON "rooms"("name", "floor");

ALTER TABLE "rooms" DROP COLUMN "location";
