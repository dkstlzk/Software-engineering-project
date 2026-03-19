/**
 * Suggestion Service Tests
 * Tests intelligent alternative room and slot suggestions
 */

jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));
jest.mock('../src/services/validationService', () => ({
    checkRoomConflict: jest.fn(),
}));

const db = require('../src/config/database');
const validationService = require('../src/services/validationService');
const suggestionService = require('../src/services/suggestionService');

describe('SuggestionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('findAlternativeRooms', () => {
        test('should return available rooms matching criteria', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: 'room-2', room_number: '102', capacity: 100, building_name: 'LHC' },
                    { id: 'room-3', room_number: '103', capacity: 150, building_name: 'LHC' },
                ],
            });

            const result = await suggestionService.findAlternativeRooms({
                roomId: 'room-1',
                date: '2027-06-15',
                startTime: '09:00',
                endTime: '10:00',
                expectedAttendees: 50,
            });

            expect(result).toHaveLength(2);
            expect(result[0].room_number).toBe('102');
        });

        test('should filter by projector requirement', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            await suggestionService.findAlternativeRooms({
                roomId: 'room-1',
                date: '2027-06-15',
                startTime: '09:00',
                endTime: '10:00',
                requiresProjector: true,
            });

            const queryCall = db.query.mock.calls[0][0];
            expect(queryCall).toContain('has_projector');
        });

        test('should return empty array on error', async () => {
            db.query.mockRejectedValueOnce(new Error('DB error'));

            const result = await suggestionService.findAlternativeRooms({
                roomId: 'room-1',
                date: '2027-06-15',
                startTime: '09:00',
                endTime: '10:00',
            });

            expect(result).toEqual([]);
        });
    });

    describe('findAlternativeSlots', () => {
        test('should return slots without conflicts', async () => {
            // Get slots for the day
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: 's1', slot_code: 'A', day: 'Sun', start_time: '09:00', end_time: '10:00' },
                    { id: 's2', slot_code: 'B', day: 'Sun', start_time: '10:00', end_time: '11:00' },
                    { id: 's3', slot_code: 'C', day: 'Sun', start_time: '11:00', end_time: '12:00' },
                ],
            });

            // Slot A has conflict, B and C are free
            validationService.checkRoomConflict
                .mockResolvedValueOnce({ available: false, conflicts: [{}] })
                .mockResolvedValueOnce({ available: true, conflicts: [] })
                .mockResolvedValueOnce({ available: true, conflicts: [] });

            const result = await suggestionService.findAlternativeSlots({
                roomId: 'room-1',
                date: '2027-06-15', // Sunday
                slotSystemId: 'ss-1',
            });

            expect(result).toHaveLength(2);
            expect(result[0].slot_code).toBe('B');
        });

        test('should return empty when no slot system provided', async () => {
            const result = await suggestionService.findAlternativeSlots({
                roomId: 'room-1',
                date: '2027-06-15',
            });

            expect(result).toEqual([]);
        });
    });

    describe('getSuggestions', () => {
        test('should return both alternative rooms and slots', async () => {
            // Alternative rooms
            db.query.mockResolvedValueOnce({ rows: [{ id: 'alt-room' }] });
            // Alternative slots query
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await suggestionService.getSuggestions({
                roomId: 'room-1',
                date: '2027-06-15',
                startTime: '09:00',
                endTime: '10:00',
                slotSystemId: 'ss-1',
            });

            expect(result).toHaveProperty('alternativeRooms');
            expect(result).toHaveProperty('alternativeSlots');
        });
    });
});
