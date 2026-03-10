/**
 * Slot System Service Tests
 * Tests slot system CRUD and CSV upload parsing
 */

// Mock the database module
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));

// Mock logger to suppress output
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const db = require('../src/config/database');
const slotSystemService = require('../src/services/slotSystemService');

describe('SlotSystemService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        test('should create a slot system', async () => {
            const mockResult = {
                rows: [{
                    id: 'uuid-1',
                    name: 'BTech_1stYear_2025',
                    program_type: 'BTech',
                    year_group: '1st_year',
                    description: 'First year BTech slots',
                }],
            };
            db.query.mockResolvedValueOnce(mockResult);

            const result = await slotSystemService.create({
                name: 'BTech_1stYear_2025',
                programType: 'BTech',
                yearGroup: '1st_year',
                description: 'First year BTech slots',
            });

            expect(result.name).toBe('BTech_1stYear_2025');
            expect(db.query).toHaveBeenCalledTimes(1);
        });
    });

    describe('uploadSlots', () => {
        test('should upload valid slot rows', async () => {
            // Mock findById
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'system-1', name: 'BTech_1stYear' }] }) // system check
                .mockResolvedValueOnce({ rows: [] }) // slots query (for findById)
                .mockResolvedValueOnce({ rows: [{ id: 'slot-1', slot_code: 'A', day: 'Mon' }] }) // insert row 1
                .mockResolvedValueOnce({ rows: [{ id: 'slot-2', slot_code: 'A', day: 'Tue' }] }); // insert row 2

            const rows = [
                { slotCode: 'A', day: 'Mon', startTime: '09:00', endTime: '09:50' },
                { slotCode: 'A', day: 'Tue', startTime: '09:00', endTime: '09:50' },
            ];

            const result = await slotSystemService.uploadSlots('system-1', rows);
            expect(result.inserted).toHaveLength(2);
            expect(result.errors).toHaveLength(0);
            expect(result.totalProcessed).toBe(2);
        });

        test('should report errors for invalid rows', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'system-1' }] })
                .mockResolvedValueOnce({ rows: [] });

            const rows = [
                { slotCode: 'A', day: 'InvalidDay', startTime: '09:00', endTime: '09:50' },
                { slotCode: '', day: 'Mon', startTime: '09:00', endTime: '09:50' },
                { day: 'Mon', startTime: '09:00', endTime: '09:50' }, // missing slotCode
            ];

            const result = await slotSystemService.uploadSlots('system-1', rows);
            expect(result.inserted).toHaveLength(0);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        test('should validate time format', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'system-1' }] })
                .mockResolvedValueOnce({ rows: [] });

            const rows = [
                { slotCode: 'A', day: 'Mon', startTime: '9am', endTime: '10am' },
            ];

            const result = await slotSystemService.uploadSlots('system-1', rows);
            expect(result.errors).toHaveLength(1);
        });
    });

    describe('normalizeDay', () => {
        test('should normalize full day names', () => {
            expect(slotSystemService.normalizeDay('Monday')).toBe('Mon');
            expect(slotSystemService.normalizeDay('tuesday')).toBe('Tue');
            expect(slotSystemService.normalizeDay('WEDNESDAY')).toBe('Wed');
        });

        test('should normalize abbreviated day names', () => {
            expect(slotSystemService.normalizeDay('Mon')).toBe('Mon');
            expect(slotSystemService.normalizeDay('thu')).toBe('Thu');
            expect(slotSystemService.normalizeDay('Fri')).toBe('Fri');
        });

        test('should return null for invalid input', () => {
            expect(slotSystemService.normalizeDay('InvalidDay')).toBe(null);
            expect(slotSystemService.normalizeDay('')).toBe(null);
            expect(slotSystemService.normalizeDay(null)).toBe(null);
        });
    });

    describe('isValidTime', () => {
        test('should validate correct time formats', () => {
            expect(slotSystemService.isValidTime('09:00')).toBe(true);
            expect(slotSystemService.isValidTime('14:30')).toBe(true);
            expect(slotSystemService.isValidTime('00:00')).toBe(true);
        });

        test('should reject invalid time formats', () => {
            expect(slotSystemService.isValidTime('9:00')).toBe(false);
            expect(slotSystemService.isValidTime('9am')).toBe(false);
            expect(slotSystemService.isValidTime('')).toBe(false);
        });
    });

    describe('findAll', () => {
        test('should return all active slot systems with counts', async () => {
            db.query.mockResolvedValueOnce({
                rows: [
                    { id: '1', name: 'BTech_1stYear', slot_count: '10' },
                    { id: '2', name: 'MTech_2025', slot_count: '8' },
                ],
            });

            const result = await slotSystemService.findAll();
            expect(result).toHaveLength(2);
        });
    });

    describe('delete', () => {
        test('should throw conflict error when courses are mapped', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'system-1' }] }) // findById - system
                .mockResolvedValueOnce({ rows: [] }) // findById - slots
                .mockResolvedValueOnce({ rows: [{ count: '3' }] }); // course count check

            await expect(slotSystemService.delete('system-1')).rejects.toThrow();
        });
    });
});
