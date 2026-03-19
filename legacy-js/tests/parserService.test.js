/**
 * Parser Service Tests
 * Tests robust slot string parsing with various real-world edge cases
 */
const parserService = require('../src/services/parserService');

describe('ParserService', () => {
    describe('parseSlotString', () => {
        test('should parse simple slot code "A"', () => {
            const result = parserService.parseSlotString('A');
            expect(result.slotCode).toBe('A');
            expect(result.dayConstraints).toEqual([]);
        });

        test('should parse slot with day constraint "B (Tue)"', () => {
            const result = parserService.parseSlotString('B (Tue)');
            expect(result.slotCode).toBe('B');
            expect(result.dayConstraints).toEqual(['Tue']);
        });

        test('should parse "Only for Tuesday" — no slot code, day constraint only', () => {
            const result = parserService.parseSlotString('Only for Tuesday');
            expect(result.slotCode).toBe(null);
            expect(result.dayConstraints).toEqual(['Tue']);
        });

        test('should parse multi-day constraint "D (Mon, Fri)"', () => {
            const result = parserService.parseSlotString('D (Mon, Fri)');
            expect(result.slotCode).toBe('D');
            expect(result.dayConstraints).toContain('Mon');
            expect(result.dayConstraints).toContain('Fri');
            expect(result.dayConstraints.length).toBe(2);
        });

        test('should parse "Slot is N"', () => {
            const result = parserService.parseSlotString('Slot is N');
            expect(result.slotCode).toBe('N');
            expect(result.dayConstraints).toEqual([]);
        });

        test('should parse slot with department annotation "K (IE/EM)"', () => {
            const result = parserService.parseSlotString('K (IE/EM)');
            expect(result.slotCode).toBe('K');
            // IE/EM are not days, should not appear in dayConstraints
            expect(result.dayConstraints).toEqual([]);
        });

        test('should parse slot with multiple annotations "F (MA) (IB/CY)"', () => {
            const result = parserService.parseSlotString('F (MA) (IB/CY)');
            expect(result.slotCode).toBe('F');
            expect(result.dayConstraints).toEqual([]);
        });

        test('should parse numeric slot code "M1"', () => {
            const result = parserService.parseSlotString('M1');
            expect(result.slotCode).toBe('M1');
            expect(result.dayConstraints).toEqual([]);
        });

        test('should handle null/empty input gracefully', () => {
            expect(parserService.parseSlotString(null).slotCode).toBe(null);
            expect(parserService.parseSlotString('').slotCode).toBe(null);
            expect(parserService.parseSlotString(undefined).slotCode).toBe(null);
        });

        test('should handle slot code with full day name "C (Wednesday)"', () => {
            const result = parserService.parseSlotString('C (Wednesday)');
            expect(result.slotCode).toBe('C');
            expect(result.dayConstraints).toEqual(['Wed']);
        });

        test('should preserve raw annotations', () => {
            const result = parserService.parseSlotString('B (Tue)');
            expect(result.rawAnnotations).toBe('B (Tue)');
        });
    });

    describe('extractDays', () => {
        test('should extract multiple days from text', () => {
            const days = parserService.extractDays('Monday and Friday');
            expect(days).toContain('Mon');
            expect(days).toContain('Fri');
        });

        test('should not duplicate days', () => {
            const days = parserService.extractDays('Mon Mon Mon');
            expect(days.length).toBe(1);
            expect(days[0]).toBe('Mon');
        });

        test('should extract abbreviated day names', () => {
            const days = parserService.extractDays('Tue, Thu');
            expect(days).toContain('Tue');
            expect(days).toContain('Thu');
        });

        test('should return empty array for non-day text', () => {
            const days = parserService.extractDays('IE/EM department');
            expect(days).toEqual([]);
        });
    });

    describe('parseTimetableRow', () => {
        test('should parse a complete timetable row', () => {
            const row = {
                subject_code: 'CS101',
                subject_name: 'Intro to CS',
                slot: 'A',
                instructor: 'Dr. Smith',
                student_count: '120',
                classroom: 'LH1',
            };

            const result = parserService.parseTimetableRow(row);
            expect(result.subjectCode).toBe('CS101');
            expect(result.subjectName).toBe('Intro to CS');
            expect(result.slotCode).toBe('A');
            expect(result.instructor).toBe('Dr. Smith');
            expect(result.studentCount).toBe(120);
            expect(result.classroom).toBe('LH1');
        });

        test('should handle missing fields gracefully', () => {
            const row = {
                subject_code: 'EE201',
                slot: 'B (Tue)',
            };

            const result = parserService.parseTimetableRow(row);
            expect(result.subjectCode).toBe('EE201');
            expect(result.slotCode).toBe('B');
            expect(result.slotConstraints.dayConstraints).toEqual(['Tue']);
            expect(result.instructor).toBe('');
            expect(result.studentCount).toBe(0);
            expect(result.classroom).toBe(null);
        });
    });
});
