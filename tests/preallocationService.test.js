/**
 * Preallocation Service Tests
 * Tests room allocation logic from timetable entries
 */

// Mock database module
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Mock slot resolution service
jest.mock('../src/services/slotResolutionService', () => ({
    resolveEntry: jest.fn(),
}));

// Mock validation service
jest.mock('../src/services/validationService', () => ({
    checkRoomConflict: jest.fn(),
}));

const db = require('../src/config/database');
const slotResolutionService = require('../src/services/slotResolutionService');
const validationService = require('../src/services/validationService');
const preallocationService = require('../src/services/preallocationService');

describe('PreallocationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getDatesForDay', () => {
        test('should return all Mondays in a date range', () => {
            // 2025-01-06 is a Monday
            const dates = preallocationService.getDatesForDay('2025-01-06', '2025-01-26', 1);
            expect(dates).toHaveLength(3);
            expect(dates[0]).toBe('2025-01-06');
            expect(dates[1]).toBe('2025-01-13');
            expect(dates[2]).toBe('2025-01-20');
        });

        test('should return empty array when no matching day in range', () => {
            // 2025-01-06 is Monday, 2025-01-07 is Tuesday — no Sunday in this range
            const dates = preallocationService.getDatesForDay('2025-01-06', '2025-01-07', 0);
            expect(dates).toHaveLength(0);
        });

        test('should handle single day range', () => {
            const dates = preallocationService.getDatesForDay('2025-01-06', '2025-01-06', 1);
            expect(dates).toHaveLength(1);
            expect(dates[0]).toBe('2025-01-06');
        });
    });

    describe('preallocate', () => {
        test('should create bookings for timetable entries', async () => {
            // Mock slot system check
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] }) // slot system check
                .mockResolvedValueOnce({ // timetable entries
                    rows: [{
                        id: 'te-1',
                        subject_code: 'CS101',
                        slot_code: 'A',
                        slot_system_id: 'ss-1',
                        slot_constraints: { dayConstraints: [] },
                        classroom: 'LH1',
                        student_count: 120,
                        course_student_count: 120,
                        course_id: 'course-1',
                    }],
                });

            // Mock slot resolution
            slotResolutionService.resolveEntry.mockResolvedValueOnce([
                { id: 'slot-entry-1', day: 'Mon', startTime: '09:00', endTime: '09:50', slotCode: 'A' },
            ]);

            // Mock room lookup (for classroom LH1)
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-1' }] });

            // Mock conflict check
            validationService.checkRoomConflict.mockResolvedValueOnce({ available: true, conflicts: [] });

            // Mock booking insert
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'booking-1', room_id: 'room-1', date: '2025-01-06' }],
            });

            const result = await preallocationService.preallocate('ss-1', '2025-01-06', '2025-01-06');

            expect(result.bookingsCreated).toHaveLength(1);
            expect(result.errors).toHaveLength(0);
        });

        test('should warn when classroom not found in database', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'te-1',
                        subject_code: 'CS101',
                        slot_code: 'A',
                        slot_system_id: 'ss-1',
                        slot_constraints: { dayConstraints: [] },
                        classroom: 'NONEXISTENT',
                        student_count: 0,
                        course_student_count: 0,
                        course_id: null,
                    }],
                });

            slotResolutionService.resolveEntry.mockResolvedValueOnce([
                { id: 'slot-1', day: 'Mon', startTime: '09:00', endTime: '09:50', slotCode: 'A' },
            ]);

            // Room not found
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await preallocationService.preallocate('ss-1', '2025-01-06', '2025-01-06');

            expect(result.warnings.length).toBeGreaterThan(0);
        });

        test('should throw error when slot system not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            await expect(
                preallocationService.preallocate('nonexistent', '2025-01-06', '2025-01-12')
            ).rejects.toThrow();
        });

        test('should find available room by capacity when no classroom specified', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'te-1',
                        subject_code: 'CS201',
                        slot_code: 'B',
                        slot_system_id: 'ss-1',
                        slot_constraints: {},
                        classroom: null,
                        student_count: 50,
                        course_student_count: 50,
                        course_id: 'course-2',
                    }],
                });

            slotResolutionService.resolveEntry.mockResolvedValueOnce([
                { id: 'slot-2', day: 'Tue', startTime: '10:00', endTime: '10:50', slotCode: 'B' },
            ]);

            // findAvailableRoom query
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-2' }] });

            // Conflict check
            validationService.checkRoomConflict.mockResolvedValueOnce({ available: true, conflicts: [] });

            // Booking insert
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'booking-2', room_id: 'room-2' }],
            });

            const result = await preallocationService.preallocate('ss-1', '2025-01-07', '2025-01-07');

            expect(result.bookingsCreated).toHaveLength(1);
        });
    });
});
