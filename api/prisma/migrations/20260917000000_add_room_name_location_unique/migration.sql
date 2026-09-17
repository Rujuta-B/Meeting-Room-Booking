-- Composite unique constraint on rooms(name, location): allows the same
-- room name to be reused across different locations/floors ("Focus Room"
-- on Floor 1 and Floor 2), while blocking exact duplicates at the same
-- location. See rooms.service.ts for the P2002 -> 409 ROOM_DUPLICATE
-- translation this enables.
CREATE UNIQUE INDEX "rooms_name_location_key" ON "rooms"("name", "location");
