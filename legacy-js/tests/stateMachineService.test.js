/**
 * State Machine Service Tests
 * Tests strict booking lifecycle state transitions
 */

jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));

const db = require('../src/config/database');
const stateMachineService = require('../src/services/stateMachineService');

describe('StateMachineService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('canTransition', () => {
        test('should allow pending_faculty → pending_staff', () => {
            expect(stateMachineService.canTransition('pending_faculty', 'pending_staff')).toBe(true);
        });

        test('should allow pending_faculty → rejected', () => {
            expect(stateMachineService.canTransition('pending_faculty', 'rejected')).toBe(true);
        });

        test('should allow pending_staff → approved', () => {
            expect(stateMachineService.canTransition('pending_staff', 'approved')).toBe(true);
        });

        test('should allow pending_staff → rejected', () => {
            expect(stateMachineService.canTransition('pending_staff', 'rejected')).toBe(true);
        });

        test('should allow approved → cancelled', () => {
            expect(stateMachineService.canTransition('approved', 'cancelled')).toBe(true);
        });

        test('should NOT allow rejected → approved (terminal state)', () => {
            expect(stateMachineService.canTransition('rejected', 'approved')).toBe(false);
        });

        test('should NOT allow approved → pending_staff (backward)', () => {
            expect(stateMachineService.canTransition('approved', 'pending_staff')).toBe(false);
        });

        test('should NOT allow pending_faculty → approved (skip)', () => {
            expect(stateMachineService.canTransition('pending_faculty', 'approved')).toBe(false);
        });

        test('should return false for unknown status', () => {
            expect(stateMachineService.canTransition('unknown', 'approved')).toBe(false);
        });
    });

    describe('transition', () => {
        test('should perform valid transition atomically', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'booking-1', status: 'pending_staff' }],
            });

            const result = await stateMachineService.transition(
                'booking-1', 'pending_faculty', 'pending_staff', 'faculty-1'
            );

            expect(result.status).toBe('pending_staff');
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE booking_requests'),
                ['pending_staff', 'booking-1', 'pending_faculty']
            );
        });

        test('should throw on invalid transition', async () => {
            await expect(
                stateMachineService.transition('booking-1', 'rejected', 'approved', 'admin-1')
            ).rejects.toThrow('Invalid state transition');
        });

        test('should throw conflict when concurrent modification detected', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [] }) // UPDATE returns 0 rows
                .mockResolvedValueOnce({ rows: [{ id: 'booking-1', status: 'approved' }] }); // SELECT current

            await expect(
                stateMachineService.transition('booking-1', 'pending_staff', 'approved', 'staff-1')
            ).rejects.toThrow('Booking status has changed');
        });

        test('should throw not found when booking does not exist', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [] }) // UPDATE returns 0 rows
                .mockResolvedValueOnce({ rows: [] }); // SELECT returns nothing

            await expect(
                stateMachineService.transition('nonexistent', 'pending_staff', 'approved', 'staff-1')
            ).rejects.toThrow('Booking request not found');
        });
    });

    describe('getInitialStatus', () => {
        test('should return pending_faculty for student', () => {
            expect(stateMachineService.getInitialStatus('student')).toBe('pending_faculty');
        });

        test('should return pending_staff for faculty', () => {
            expect(stateMachineService.getInitialStatus('faculty')).toBe('pending_staff');
        });

        test('should return pending_staff for admin', () => {
            expect(stateMachineService.getInitialStatus('admin')).toBe('pending_staff');
        });

        test('should throw for invalid role', () => {
            expect(() => stateMachineService.getInitialStatus('guest')).toThrow();
        });
    });

    describe('getAllowedTransitions', () => {
        test('should return allowed transitions for pending_faculty', () => {
            const transitions = stateMachineService.getAllowedTransitions('pending_faculty');
            expect(transitions).toContain('pending_staff');
            expect(transitions).toContain('rejected');
        });

        test('should return empty array for terminal states', () => {
            expect(stateMachineService.getAllowedTransitions('rejected')).toEqual([]);
            expect(stateMachineService.getAllowedTransitions('cancelled')).toEqual([]);
        });
    });
});
