/**
 * Approval Service Tests
 * Tests multi-level approval workflow
 */

jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));
jest.mock('../src/services/bookingService', () => ({
    findById: jest.fn(),
}));
jest.mock('../src/services/stateMachineService', () => ({
    transition: jest.fn(),
}));
jest.mock('../src/services/notificationService', () => ({
    notifyFacultyApproval: jest.fn(),
    notifyFinalDecision: jest.fn(),
}));
jest.mock('../src/services/validationService', () => ({
    checkRoomConflict: jest.fn(),
}));

const db = require('../src/config/database');
const bookingService = require('../src/services/bookingService');
const stateMachineService = require('../src/services/stateMachineService');
const notificationService = require('../src/services/notificationService');
const validationService = require('../src/services/validationService');
const approvalService = require('../src/services/approvalService');

describe('ApprovalService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockBooking = {
        id: 'booking-1',
        requester_id: 'student-1',
        faculty_verifier_id: 'faculty-1',
        status: 'pending_faculty',
        room_id: 'room-1',
        booking_date: '2027-06-15',
        start_time: '09:00',
        end_time: '10:00',
        event_title: 'Test Event',
    };

    describe('facultyApprove', () => {
        test('should transition from pending_faculty to pending_staff', async () => {
            bookingService.findById.mockResolvedValueOnce(mockBooking);
            stateMachineService.transition.mockResolvedValueOnce({ ...mockBooking, status: 'pending_staff' });
            db.query.mockResolvedValueOnce({ rows: [{ ...mockBooking, status: 'pending_staff' }] });
            db.query.mockResolvedValueOnce({ rows: [] }); // audit

            const result = await approvalService.facultyApprove('booking-1', 'faculty-1', 'Looks good');

            expect(stateMachineService.transition).toHaveBeenCalledWith(
                'booking-1', 'pending_faculty', 'pending_staff', 'faculty-1'
            );
            expect(notificationService.notifyFacultyApproval).toHaveBeenCalled();
        });

        test('should reject when faculty is not the assigned verifier', async () => {
            bookingService.findById.mockResolvedValueOnce(mockBooking);

            await expect(
                approvalService.facultyApprove('booking-1', 'other-faculty', 'OK')
            ).rejects.toThrow('not the assigned faculty');
        });
    });

    describe('facultyReject', () => {
        test('should transition from pending_faculty to rejected', async () => {
            bookingService.findById.mockResolvedValueOnce(mockBooking);
            stateMachineService.transition.mockResolvedValueOnce({ ...mockBooking, status: 'rejected' });
            db.query.mockResolvedValueOnce({ rows: [{ ...mockBooking, status: 'rejected' }] });
            db.query.mockResolvedValueOnce({ rows: [] }); // audit

            const result = await approvalService.facultyReject('booking-1', 'faculty-1', 'Not appropriate');

            expect(stateMachineService.transition).toHaveBeenCalledWith(
                'booking-1', 'pending_faculty', 'rejected', 'faculty-1'
            );
            expect(notificationService.notifyFinalDecision).toHaveBeenCalledWith(
                expect.anything(), 'rejected', 'Not appropriate'
            );
        });

        test('should require rejection reason', async () => {
            await expect(
                approvalService.facultyReject('booking-1', 'faculty-1', '')
            ).rejects.toThrow('Rejection reason is required');
        });
    });

    describe('staffApprove', () => {
        test('should re-validate conflicts before approval', async () => {
            const pendingStaffBooking = { ...mockBooking, status: 'pending_staff' };
            bookingService.findById.mockResolvedValueOnce(pendingStaffBooking);
            validationService.checkRoomConflict.mockResolvedValueOnce({ available: true, conflicts: [] });
            stateMachineService.transition.mockResolvedValueOnce({ ...pendingStaffBooking, status: 'approved' });
            db.query.mockResolvedValueOnce({ rows: [{ ...pendingStaffBooking, status: 'approved' }] });
            db.query.mockResolvedValueOnce({ rows: [] }); // audit

            await approvalService.staffApprove('booking-1', 'staff-1', 'Approved');

            expect(validationService.checkRoomConflict).toHaveBeenCalled();
            expect(notificationService.notifyFinalDecision).toHaveBeenCalledWith(
                expect.anything(), 'approved'
            );
        });

        test('should reject approval when conflict detected', async () => {
            const pendingStaffBooking = { ...mockBooking, status: 'pending_staff' };
            bookingService.findById.mockResolvedValueOnce(pendingStaffBooking);
            validationService.checkRoomConflict.mockResolvedValueOnce({
                available: false,
                conflicts: [{ id: 'conflict-1' }],
            });

            await expect(
                approvalService.staffApprove('booking-1', 'staff-1', 'OK')
            ).rejects.toThrow('conflict detected');
        });
    });

    describe('staffReject', () => {
        test('should transition from pending_staff to rejected', async () => {
            const pendingStaffBooking = { ...mockBooking, status: 'pending_staff' };
            bookingService.findById.mockResolvedValueOnce(pendingStaffBooking);
            stateMachineService.transition.mockResolvedValueOnce({ ...pendingStaffBooking, status: 'rejected' });
            db.query.mockResolvedValueOnce({ rows: [{ ...pendingStaffBooking, status: 'rejected' }] });
            db.query.mockResolvedValueOnce({ rows: [] }); // audit

            await approvalService.staffReject('booking-1', 'staff-1', 'Room needed for exam');

            expect(stateMachineService.transition).toHaveBeenCalledWith(
                'booking-1', 'pending_staff', 'rejected', 'staff-1'
            );
        });
    });
});
