import { describe, it, expect } from 'vitest';
import { createBooking, hasBookingOverlap } from '../bookingService';

function createOverlapExecutor(hasOverlap: boolean) {
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit: async () => (hasOverlap ? [{ id: 1 }] : []),
              };
            },
          };
        },
      };
    },
  };
}

describe('bookingService', () => {
  it('rejects booking creation when time interval is invalid', async () => {
    const result = await createBooking({
      roomId: 1,
      startAt: '2026-04-10T10:00:00.000Z',
      endAt: '2026-04-10T09:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_INTERVAL');
      expect(result.status).toBe(400);
    }
  });

  it('detects room overlaps when overlapping bookings exist', async () => {
    const overlap = await hasBookingOverlap(
      1,
      new Date('2026-04-10T10:00:00.000Z'),
      new Date('2026-04-10T11:00:00.000Z'),
      createOverlapExecutor(true) as never,
    );

    expect(overlap).toBe(true);
  });

  it('returns no overlap when no bookings conflict', async () => {
    const overlap = await hasBookingOverlap(
      1,
      new Date('2026-04-10T10:00:00.000Z'),
      new Date('2026-04-10T11:00:00.000Z'),
      createOverlapExecutor(false) as never,
    );

    expect(overlap).toBe(false);
  });
});
