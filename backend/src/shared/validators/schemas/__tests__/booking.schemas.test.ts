import { describe, expect, it } from 'vitest';
import { bulkCreateBookingSchema, createBookingSchema } from '../booking.schemas';

describe('booking.schemas', () => {
  it('accepts top-level courseId for direct booking payload', () => {
    const parsed = createBookingSchema.parse({
      roomId: 10,
      startAt: '2026-04-10T10:00:00.000Z',
      endAt: '2026-04-10T11:00:00.000Z',
      courseId: 42,
    });

    expect(parsed.courseId).toBe(42);
  });

  it('accepts top-level courseId for bulk booking payload items', () => {
    const parsed = bulkCreateBookingSchema.parse({
      items: [
        {
          roomId: 11,
          startAt: '2026-04-10T12:00:00.000Z',
          endAt: '2026-04-10T13:00:00.000Z',
          courseId: 99,
          clientRowId: 'row-1',
        },
      ],
    });

    expect(parsed.items[0]?.courseId).toBe(99);
  });

  it('rejects invalid courseId values', () => {
    expect(() =>
      createBookingSchema.parse({
        roomId: 10,
        startAt: '2026-04-10T10:00:00.000Z',
        endAt: '2026-04-10T11:00:00.000Z',
        courseId: -1,
      }),
    ).toThrow();
  });
});
