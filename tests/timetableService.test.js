/**
 * Timetable Service Tests
 * Tests timetable upload with course validation and slot system assignment
 */

// Mock the database module
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

// Mock courseService
jest.mock('../src/services/courseService', () => ({
    findByCode: jest.fn(),
}));

const db = require('../src/config/database');
const courseService = require('../src/services/courseService');
const timetableService = require('../src/services/timetableService');

describe('TimetableService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('upload', () => {
        test('should upload timetable entries with valid data', async () => {
            // Mock slot system check
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] });

            // Mock course lookup
            courseService.findByCode.mockResolvedValueOnce({
                id: 'course-1',
                course_code: 'CS101',
                slot_system_id: 'ss-1',
            });

            // Mock timetable entry insert
            db.query.mockResolvedValueOnce({
                rows: [{
                    id: 'te-1',
                    subject_code: 'CS101',
                    slot_code: 'A',
                    slot_system_id: 'ss-1',
                }],
            });

            const rows = [{
                subject_code: 'CS101',
                subject_name: 'Intro to CS',
                slot: 'A',
                instructor: 'Dr. Smith',
                student_count: '120',
                classroom: 'LH1',
            }];

            const result = await timetableService.upload('ss-1', rows);
            expect(result.inserted).toHaveLength(1);
            expect(result.errors).toHaveLength(0);
            expect(result.totalProcessed).toBe(1);
        });

        test('should report error for missing subject_code', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] });

            const rows = [{
                subject_code: '',
                slot: 'A',
            }];

            const result = await timetableService.upload('ss-1', rows);
            expect(result.errors).toHaveLength(1);
            expect(result.inserted).toHaveLength(0);
        });

        test('should warn when course not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] });
            courseService.findByCode.mockResolvedValueOnce(null);
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'te-1', subject_code: 'UNKNOWN101', slot_code: 'A' }],
            });

            const rows = [{
                subject_code: 'UNKNOWN101',
                slot: 'A',
            }];

            const result = await timetableService.upload('ss-1', rows);
            expect(result.inserted).toHaveLength(1);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        test('should handle complex slot strings', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] });
            courseService.findByCode.mockResolvedValueOnce({
                id: 'course-1',
                course_code: 'EE201',
                slot_system_id: 'ss-1',
            });
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'te-1', subject_code: 'EE201', slot_code: 'B' }],
            });

            const rows = [{
                subject_code: 'EE201',
                slot: 'B (Tue)',
                instructor: 'Prof. Jones',
                student_count: '80',
            }];

            const result = await timetableService.upload('ss-1', rows);
            expect(result.inserted).toHaveLength(1);
        });

        test('should throw error when slot system not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            await expect(
                timetableService.upload('nonexistent-ss', [{ subject_code: 'CS101', slot: 'A' }])
            ).rejects.toThrow();
        });

        test('should warn when course belongs to different slot system', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1' }] });
            courseService.findByCode.mockResolvedValueOnce({
                id: 'course-1',
                course_code: 'CS101',
                slot_system_id: 'ss-different', // Different slot system
            });
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'te-1', subject_code: 'CS101', slot_code: 'A' }],
            });

            const rows = [{
                subject_code: 'CS101',
                slot: 'A',
            }];

            const result = await timetableService.upload('ss-1', rows);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });
});
