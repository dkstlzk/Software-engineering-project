/**
 * Slot Resolution Service Tests
 * Tests slot code → time block resolution with constraints
 */

// Mock the database module
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));

const db = require('../src/config/database');
const slotResolutionService = require('../src/services/slotResolutionService');

describe('SlotResolutionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('resolve', () => {
        test('should resolve slot code to time blocks', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: 'uuid-1', slot_code: 'A', day: 'Mon', start_time: '09:00', end_time: '09:50' },
                    { id: 'uuid-2', slot_code: 'A', day: 'Tue', start_time: '09:00', end_time: '09:50' },
                ],
            });

            const result = await slotResolutionService.resolve('A', 'system-uuid-1', {});

            expect(result).toHaveLength(2);
            expect(result[0].day).toBe('Mon');
            expect(result[0].startTime).toBe('09:00');
            expect(result[1].day).toBe('Tue');
            expect(db.query).toHaveBeenCalledTimes(1);
        });

        test('should apply day constraints to filter results', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: 'uuid-1', slot_code: 'B', day: 'Mon', start_time: '10:00', end_time: '10:50' },
                    { id: 'uuid-2', slot_code: 'B', day: 'Tue', start_time: '10:00', end_time: '10:50' },
                    { id: 'uuid-3', slot_code: 'B', day: 'Wed', start_time: '10:00', end_time: '10:50' },
                ],
            });

            const result = await slotResolutionService.resolve('B', 'system-uuid-1', {
                dayConstraints: ['Tue'],
            });

            expect(result).toHaveLength(1);
            expect(result[0].day).toBe('Tue');
        });

        test('should return empty array when slot code not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await slotResolutionService.resolve('Z', 'system-uuid-1', {});
            expect(result).toHaveLength(0);
        });

        test('should throw error when slotCode or slotSystemId is missing', async () => {
            await expect(slotResolutionService.resolve(null, 'system-uuid-1')).rejects.toThrow();
            await expect(slotResolutionService.resolve('A', null)).rejects.toThrow();
        });

        test('should apply multiple day constraints', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: '1', slot_code: 'D', day: 'Mon', start_time: '11:00', end_time: '11:50' },
                    { id: '2', slot_code: 'D', day: 'Tue', start_time: '11:00', end_time: '11:50' },
                    { id: '3', slot_code: 'D', day: 'Wed', start_time: '11:00', end_time: '11:50' },
                    { id: '4', slot_code: 'D', day: 'Fri', start_time: '11:00', end_time: '11:50' },
                ],
            });

            const result = await slotResolutionService.resolve('D', 'system-uuid-1', {
                dayConstraints: ['Mon', 'Fri'],
            });

            expect(result).toHaveLength(2);
            expect(result.map(r => r.day)).toEqual(['Mon', 'Fri']);
        });
    });

    describe('resolveEntry', () => {
        test('should resolve a timetable entry object', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: '1', slot_code: 'A', day: 'Mon', start_time: '09:00', end_time: '09:50' },
                ],
            });

            const entry = {
                slot_code: 'A',
                slot_system_id: 'system-uuid-1',
                slot_constraints: { dayConstraints: [] },
            };

            const result = await slotResolutionService.resolveEntry(entry);
            expect(result).toHaveLength(1);
        });

        test('should handle slot_constraints as JSON string', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: '1', slot_code: 'B', day: 'Tue', start_time: '10:00', end_time: '10:50' },
                ],
            });

            const entry = {
                slot_code: 'B',
                slot_system_id: 'system-uuid-1',
                slot_constraints: JSON.stringify({ dayConstraints: ['Tue'] }),
            };

            const result = await slotResolutionService.resolveEntry(entry);
            expect(result).toHaveLength(1);
            expect(result[0].day).toBe('Tue');
        });
    });
});
