export type BookingRequestPrefill = {
  roomId: number;
  startAt: string;
  endAt: string;
  buildingId?: number;
  purpose?: string;
};

export type AvailabilityPrefill = {
  startAt: string;
  endAt: string;
  buildingId?: number;
  focusRoomId?: number;
};
