import { Room } from "../types";

function clampGuestCount(room: Room, guestCount: number): number {
  if (!Number.isFinite(guestCount)) {
    return Math.min(Math.max(room.pricing.baseOccupancy, 1), room.capacity);
  }

  return Math.min(Math.max(Math.trunc(guestCount), 1), room.capacity);
}

export function getNightlyPriceForGuests(room: Room, guestCount: number): number {
  const safeGuestCount = clampGuestCount(room, guestCount);
  const extraGuests = Math.max(safeGuestCount - room.pricing.baseOccupancy, 0);

  return room.pricing.basePricePerNight + (extraGuests * room.pricing.extraGuestPricePerNight);
}

export function getRoomStartingPrice(room: Room): number {
  return getNightlyPriceForGuests(room, room.pricing.baseOccupancy);
}

export function getOccupancyPriceOptions(room: Room): Array<{ guestCount: number; nightlyPrice: number }> {
  return Array.from({ length: room.capacity }, (_, index) => {
    const guestCount = index + 1;
    return {
      guestCount,
      nightlyPrice: getNightlyPriceForGuests(room, guestCount),
    };
  });
}
