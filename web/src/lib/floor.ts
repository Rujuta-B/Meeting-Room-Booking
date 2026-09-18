// src/lib/floor.ts
//
// A room's floor is a plain bounded integer on the backend (see the API's
// schema.prisma Room.floor comment) - this is the ONE place the frontend
// turns that number into a display label ("2nd floor") and the one fixed
// list of choices every floor <select> renders from, so every page shows
// the exact same wording/options instead of each form/card re-deriving its
// own ordinal formatting.
export const MIN_FLOOR = 1;
export const MAX_FLOOR = 5;

export const FLOOR_OPTIONS: number[] = Array.from({ length: MAX_FLOOR - MIN_FLOOR + 1 }, (_, i) => MIN_FLOOR + i);

export function formatFloorLabel(floor: number): string {
  const n = Number(floor);
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${n}th floor`;
  switch (n % 10) {
    case 1:
      return `${n}st floor`;
    case 2:
      return `${n}nd floor`;
    case 3:
      return `${n}rd floor`;
    default:
      return `${n}th floor`;
  }
}
