/**
 * Approval Service
 * Multi-level approval workflow engine
 * 
 * Flow:
 *   Student → Faculty (verify) → Staff (approve/reject)
 *   Faculty → Staff (approve/reject)
 * 
 * RBAC rules:
 *   - Faculty can only approve/reject student requests assigned to them
 *   - Staff/Admin can approve/reject pending_staff requests
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');
const stateMachineService = require('./stateMachineService');
const bookingService = require('./bookingService');
const notificationService = require('./notificationService');
const validationService = require('./validationService');

class ApprovalService {
    /**
     * Faculty approves a student booking request
     * Transitions: pending_faculty → pending_staff
     * @param {string} bookingId - Booking request UUID
     * @param {string} facultyId - Faculty user UUID
     * @param {string} remarks - Optional remarks
     * @returns {Promise<Object>} Updated booking
     */
    async facultyApprove(bookingId, facultyId, remarks = null) {
        const booking = await bookingService.findById(bookingId);

        // RBAC: Only the assigned faculty can approve
        if (booking.faculty_verifier_id !== facultyId) {
            throw ApiError.forbidden('You are not the assigned faculty verifier for this request');
        }

        // State machine transition
        await stateMachineService.transition(bookingId, 'pending_faculty', 'pending_staff', facultyId);

        // Update faculty verification fields
        const result = await db.query(
            `UPDATE booking_requests
             SET faculty_verification_at = NOW(),
                 faculty_remarks = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [remarks, bookingId]
        );

        const updatedBooking = result.rows[0];

        // Notify staff
        await notificationService.notifyFacultyApproval(updatedBooking);

        // Audit log
        await this.logAudit(facultyId, 'FACULTY_APPROVE', bookingId, booking.status, 'pending_staff');

        logger.info('Faculty approved booking', { bookingId, facultyId });
        return updatedBooking;
    }

    /**
     * Faculty rejects a student booking request
     * Transitions: pending_faculty → rejected
     * @param {string} bookingId - Booking request UUID
     * @param {string} facultyId - Faculty user UUID
     * @param {string} reason - Rejection reason (required)
     * @returns {Promise<Object>} Updated booking
     */
    async facultyReject(bookingId, facultyId, reason) {
        if (!reason || !reason.trim()) {
            throw ApiError.badRequest('Rejection reason is required');
        }

        const booking = await bookingService.findById(bookingId);

        // RBAC: Only the assigned faculty can reject
        if (booking.faculty_verifier_id !== facultyId) {
            throw ApiError.forbidden('You are not the assigned faculty verifier for this request');
        }

        // State machine transition
        await stateMachineService.transition(bookingId, 'pending_faculty', 'rejected', facultyId);

        // Update rejection fields
        const result = await db.query(
            `UPDATE booking_requests
             SET faculty_verification_at = NOW(),
                 faculty_remarks = $1,
                 rejection_reason = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [reason, reason, bookingId]
        );

        const updatedBooking = result.rows[0];

        // Notify requester
        await notificationService.notifyFinalDecision(updatedBooking, 'rejected', reason);

        // Audit log
        await this.logAudit(facultyId, 'FACULTY_REJECT', bookingId, booking.status, 'rejected');

        logger.info('Faculty rejected booking', { bookingId, facultyId });
        return updatedBooking;
    }

    /**
     * Staff approves a booking request (final approval)
     * Transitions: pending_staff → approved
     * @param {string} bookingId - Booking request UUID
     * @param {string} staffId - Staff/Admin user UUID
     * @param {string} remarks - Optional remarks
     * @returns {Promise<Object>} Updated booking
     */
    async staffApprove(bookingId, staffId, remarks = null) {
        const booking = await bookingService.findById(bookingId);

        // Re-validate conflicts before final approval
        const dayOfWeek = new Date(booking.booking_date).getDay();
        const dayMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        const day = dayMap[dayOfWeek];

        const conflictResult = await validationService.checkRoomConflict(
            booking.room_id, day, booking.start_time, booking.end_time, null, booking.booking_date
        );

        if (!conflictResult.available) {
            throw ApiError.conflict(
                'Cannot approve: room conflict detected since request was created',
                { conflicts: conflictResult.conflicts }
            );
        }

        // State machine transition
        await stateMachineService.transition(bookingId, 'pending_staff', 'approved', staffId);

        // Update staff review fields
        const result = await db.query(
            `UPDATE booking_requests
             SET staff_reviewer_id = $1,
                 staff_review_at = NOW(),
                 staff_remarks = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [staffId, remarks, bookingId]
        );

        const updatedBooking = result.rows[0];

        // Notify requester
        await notificationService.notifyFinalDecision(updatedBooking, 'approved');

        // Audit log
        await this.logAudit(staffId, 'STAFF_APPROVE', bookingId, booking.status, 'approved');

        logger.info('Staff approved booking', { bookingId, staffId });
        return updatedBooking;
    }

    /**
     * Staff rejects a booking request
     * Transitions: pending_staff → rejected
     * @param {string} bookingId - Booking request UUID
     * @param {string} staffId - Staff/Admin user UUID
     * @param {string} reason - Rejection reason (required)
     * @returns {Promise<Object>} Updated booking
     */
    async staffReject(bookingId, staffId, reason) {
        if (!reason || !reason.trim()) {
            throw ApiError.badRequest('Rejection reason is required');
        }

        const booking = await bookingService.findById(bookingId);

        // State machine transition
        await stateMachineService.transition(bookingId, 'pending_staff', 'rejected', staffId);

        // Update review fields
        const result = await db.query(
            `UPDATE booking_requests
             SET staff_reviewer_id = $1,
                 staff_review_at = NOW(),
                 staff_remarks = $2,
                 rejection_reason = $3,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [staffId, reason, reason, bookingId]
        );

        const updatedBooking = result.rows[0];

        // Notify requester
        await notificationService.notifyFinalDecision(updatedBooking, 'rejected', reason);

        // Audit log
        await this.logAudit(staffId, 'STAFF_REJECT', bookingId, booking.status, 'rejected');

        logger.info('Staff rejected booking', { bookingId, staffId });
        return updatedBooking;
    }

    /**
     * Log audit entry for approval actions
     */
    async logAudit(userId, action, bookingId, fromStatus, toStatus) {
        try {
            await db.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
                 VALUES ($1, $2, 'booking_request', $3, $4, $5)`,
                [
                    userId, action, bookingId,
                    JSON.stringify({ status: fromStatus }),
                    JSON.stringify({ status: toStatus }),
                ]
            );
        } catch (error) {
            logger.error('Failed to log audit', { error: error.message });
        }
    }
}

module.exports = new ApprovalService();
