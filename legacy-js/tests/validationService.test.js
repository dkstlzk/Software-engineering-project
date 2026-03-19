/**
 * Validation Service Tests
 * Tests conflict detection and capacity validation
 */

// Mock the database module
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));

const db = require('../src/config/database');
const validationService = require('../src/services/validationService');

describe('ValidationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkRoomConflict', () => {
        test('should return available when no conflicts', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [] }) // bookings check
                .mockResolvedValueOnce({ rows: [] }); // booking_requests check

            const result = await validationService.checkRoomConflict(
                'room-uuid', 'Mon', '09:00', '10:00', null, '2025-01-15'
            );

            expect(result.available).toBe(true);
            expect(result.conflicts).toHaveLength(0);
        });

        test('should detect booking conflict', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{ id: 'booking-1', date: '2025-01-15', day: 'Mon', start_time: '09:00', end_time: '10:00' }],
                })
                .mockResolvedValueOnce({ rows: [] });

            const result = await validationService.checkRoomConflict(
                'room-uuid', 'Mon', '09:00', '10:00', null, '2025-01-15'
            );

            expect(result.available).toBe(false);
            expect(result.conflicts).toHaveLength(1);
            expect(result.conflicts[0].type).toBe('booking');
        });

        test('should detect booking_request conflict', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{ id: 'req-1', booking_date: '2025-01-15', start_time: '09:00', end_time: '10:00', event_title: 'Meeting' }],
                });

            const result = await validationService.checkRoomConflict(
                'room-uuid', 'Mon', '09:30', '10:30', null, '2025-01-15'
            );

            expect(result.available).toBe(false);
            expect(result.conflicts).toHaveLength(1);
            expect(result.conflicts[0].type).toBe('booking_request');
        });

        test('should detect both booking and request conflicts', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{ id: 'booking-1', date: '2025-01-15', day: 'Mon', start_time: '09:00', end_time: '10:00' }],
                })
                .mockResolvedValueOnce({
                    rows: [{ id: 'req-1', booking_date: '2025-01-15', start_time: '09:30', end_time: '10:30', event_title: 'Exam' }],
                });

            const result = await validationService.checkRoomConflict(
                'room-uuid', 'Mon', '09:00', '10:00', null, '2025-01-15'
            );

            expect(result.available).toBe(false);
            expect(result.conflicts).toHaveLength(2);
        });
    });

    describe('checkCapacity', () => {
        test('should return sufficient when capacity is enough', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{ capacity: 200 }],
            });

            const result = await validationService.checkCapacity('room-uuid', 150);
            expect(result.sufficient).toBe(true);
            expect(result.roomCapacity).toBe(200);
        });

        test('should return insufficient when capacity is not enough', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{ capacity: 50 }],
            });

            const result = await validationService.checkCapacity('room-uuid', 100);
            expect(result.sufficient).toBe(false);
            expect(result.roomCapacity).toBe(50);
            expect(result.requiredCapacity).toBe(100);
        });

        test('should handle room not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await validationService.checkCapacity('nonexistent-uuid', 100);
            expect(result.sufficient).toBe(false);
            expect(result.error).toBe('Room not found');
        });
    });

    describe('validateBooking', () => {
        test('should return valid when no conflicts and capacity is sufficient', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [] }) // checkRoomConflict: bookings
                .mockResolvedValueOnce({ rows: [] }) // checkRoomConflict: booking_requests
                .mockResolvedValueOnce({ rows: [{ capacity: 200 }] }); // checkCapacity

            const result = await validationService.validateBooking({
                roomId: 'room-uuid',
                day: 'Mon',
                startTime: '09:00',
                endTime: '10:00',
                requiredCapacity: 100,
                date: '2025-01-15',
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should return errors when both conflict and capacity fail', async () => {
            db.query
                .mockResolvedValueOnce({
                    rows: [{ id: 'b1', date: '2025-01-15', day: 'Mon', start_time: '09:00', end_time: '10:00' }],
                })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ capacity: 30 }] });

            const result = await validationService.validateBooking({
                roomId: 'room-uuid',
                day: 'Mon',
                startTime: '09:00',
                endTime: '10:00',
                requiredCapacity: 100,
                date: '2025-01-15',
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].type).toBe('ROOM_CONFLICT');
            expect(result.errors[1].type).toBe('INSUFFICIENT_CAPACITY');
        });

        test('should skip capacity check when no requiredCapacity', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const result = await validationService.validateBooking({
                roomId: 'room-uuid',
                day: 'Mon',
                startTime: '09:00',
                endTime: '10:00',
                date: '2025-01-15',
            });

            expect(result.valid).toBe(true);
            // checkCapacity should not be called
            expect(db.query).toHaveBeenCalledTimes(2);
        });
    });
});
