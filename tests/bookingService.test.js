/**
 * Booking Service Tests
 * Tests booking creation, validation, duplicate detection, and queries
 */

jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));
jest.mock('../src/services/validationService', () => ({
    checkRoomConflict: jest.fn(),
}));
jest.mock('../src/services/suggestionService', () => ({
    getSuggestions: jest.fn(),
}));
jest.mock('../src/services/notificationService', () => ({
    notifyBookingCreated: jest.fn(),
}));

const db = require('../src/config/database');
const validationService = require('../src/services/validationService');
const suggestionService = require('../src/services/suggestionService');
const notificationService = require('../src/services/notificationService');
const bookingService = require('../src/services/bookingService');

describe('BookingService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const validBookingData = {
        roomId: 'room-uuid',
        bookingDate: '2027-06-15',
        startTime: '09:00',
        endTime: '10:00',
        eventType: 'seminar',
        eventTitle: 'Test Seminar',
        slotSystemId: 'ss-uuid',
        slotCode: 'A',
    };

    describe('create', () => {
        test('should create faculty booking with pending_staff status', async () => {
            // Slot system exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-uuid' }] });
            // Room exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-uuid', capacity: 100 }] });
            // No conflict
            validationService.checkRoomConflict.mockResolvedValueOnce({ available: true, conflicts: [] });
            // No duplicate
            db.query.mockResolvedValueOnce({ rows: [] });
            // Slot resolution
            db.query.mockResolvedValueOnce({ rows: [] });
            // Insert
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'new-booking', status: 'pending_staff', event_title: 'Test Seminar' }],
            });
            // Audit log
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await bookingService.create(validBookingData, {
                userId: 'faculty-1',
                role: 'faculty',
            });

            expect(result.status).toBe('pending_staff');
            expect(notificationService.notifyBookingCreated).toHaveBeenCalled();
        });

        test('should create student booking with pending_faculty status', async () => {
            const studentData = {
                ...validBookingData,
                facultyVerifierId: 'faculty-1',
            };

            // Slot system exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-uuid' }] });
            // Room exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-uuid', capacity: 100 }] });
            // Faculty verifier exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'faculty-1' }] });
            // No conflict
            validationService.checkRoomConflict.mockResolvedValueOnce({ available: true, conflicts: [] });
            // No duplicate
            db.query.mockResolvedValueOnce({ rows: [] });
            // Slot resolution
            db.query.mockResolvedValueOnce({ rows: [] });
            // Insert
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'new-booking', status: 'pending_faculty', event_title: 'Test Seminar' }],
            });
            // Audit log
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await bookingService.create(studentData, {
                userId: 'student-1',
                role: 'student',
            });

            expect(result.status).toBe('pending_faculty');
        });

        test('should reject booking with invalid slot system', async () => {
            db.query.mockResolvedValueOnce({ rows: [] }); // Slot system not found

            await expect(
                bookingService.create(validBookingData, { userId: 'f1', role: 'faculty' })
            ).rejects.toThrow('Slot system not found');
        });

        test('should reject booking with room conflict and return suggestions', async () => {
            // Slot system exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-uuid' }] });
            // Room exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-uuid', capacity: 100 }] });
            // Conflict!
            validationService.checkRoomConflict.mockResolvedValueOnce({
                available: false,
                conflicts: [{ id: 'conflict-1' }],
            });
            // Suggestions
            suggestionService.getSuggestions.mockResolvedValueOnce({
                alternativeRooms: [{ id: 'alt-room' }],
                alternativeSlots: [],
            });

            await expect(
                bookingService.create(validBookingData, { userId: 'f1', role: 'faculty' })
            ).rejects.toThrow('Room is not available');
        });

        test('should reject duplicate requests', async () => {
            // Slot system exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-uuid' }] });
            // Room exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-uuid', capacity: 100 }] });
            // No conflict
            validationService.checkRoomConflict.mockResolvedValueOnce({ available: true, conflicts: [] });
            // Duplicate found
            db.query.mockResolvedValueOnce({ rows: [{ id: 'existing-booking' }] });

            await expect(
                bookingService.create(validBookingData, { userId: 'f1', role: 'faculty' })
            ).rejects.toThrow('duplicate booking');
        });

        test('should require faculty verifier for student requests', async () => {
            // Slot system exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-uuid' }] });
            // Room exists
            db.query.mockResolvedValueOnce({ rows: [{ id: 'room-uuid', capacity: 100 }] });

            await expect(
                bookingService.create(validBookingData, { userId: 's1', role: 'student' })
            ).rejects.toThrow('faculty verifier');
        });
    });

    describe('findById', () => {
        test('should return booking with joined data', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{
                    id: 'booking-1', requester_name: 'John Doe',
                    room_number: '101', status: 'pending_staff',
                }],
            });

            const result = await bookingService.findById('booking-1');
            expect(result.requester_name).toBe('John Doe');
        });

        test('should throw not found for missing booking', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            await expect(bookingService.findById('nonexistent')).rejects.toThrow('not found');
        });
    });

    describe('findByUser', () => {
        test('should return paginated user bookings', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: '2' }] })
                .mockResolvedValueOnce({
                    rows: [
                        { id: 'b1', status: 'pending_staff' },
                        { id: 'b2', status: 'approved' },
                    ],
                });

            const result = await bookingService.findByUser('user-1');
            expect(result.data).toHaveLength(2);
            expect(result.pagination.total).toBe(2);
        });
    });
});
