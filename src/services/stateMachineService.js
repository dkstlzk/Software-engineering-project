/**
 * State Machine Service
 * Enforces strict booking request lifecycle transitions
 * 
 * Valid States: pending_faculty, pending_staff, approved, rejected, cancelled, conflict_escalated
 * 
 * Valid Transitions:
 *   pending_faculty → pending_staff  (faculty approves student request)
 *   pending_faculty → rejected       (faculty rejects student request)
 *   pending_staff   → approved       (staff approves)
 *   pending_staff   → rejected       (staff rejects)
 *   pending_staff   → conflict_escalated (conflict detected, escalated)
 *   approved        → cancelled      (requester cancels)
 *   pending_faculty → cancelled      (requester cancels)
 *   pending_staff   → cancelled      (requester cancels)
 */
const db = require('../config/database');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errorHandler');

// Valid transition map: fromStatus → [allowed toStatuses]
const TRANSITIONS = {
    pending_faculty: ['pending_staff', 'rejected', 'cancelled'],
    pending_staff: ['approved', 'rejected', 'cancelled', 'conflict_escalated'],
    approved: ['cancelled'],
    // Terminal states — no transitions out
    rejected: [],
    cancelled: [],
    conflict_escalated: ['approved', 'rejected'],
};

class StateMachineService {
    /**
     * Check if a state transition is valid
     * @param {string} fromStatus - Current status
     * @param {string} toStatus - Target status
     * @returns {boolean}
     */
    canTransition(fromStatus, toStatus) {
        const allowed = TRANSITIONS[fromStatus];
        if (!allowed) return false;
        return allowed.includes(toStatus);
    }

    /**
     * Perform an atomic state transition with optimistic locking
     * @param {string} bookingId - Booking request UUID
     * @param {string} expectedStatus - Expected current status (for optimistic lock)
     * @param {string} toStatus - Target status
     * @param {string} actorId - User performing the transition
     * @returns {Promise<Object>} Updated booking request
     */
    async transition(bookingId, expectedStatus, toStatus, actorId) {
        // Validate the transition
        if (!this.canTransition(expectedStatus, toStatus)) {
            throw ApiError.badRequest(
                `Invalid state transition: ${expectedStatus} → ${toStatus}`,
                {
                    currentStatus: expectedStatus,
                    requestedStatus: toStatus,
                    allowedTransitions: TRANSITIONS[expectedStatus] || [],
                }
            );
        }

        // Atomic update with optimistic locking on current status
        const result = await db.query(
            `UPDATE booking_requests
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND status = $3
             RETURNING *`,
            [toStatus, bookingId, expectedStatus]
        );

        if (result.rows.length === 0) {
            // Either booking doesn't exist or status changed concurrently
            const current = await db.query(
                `SELECT id, status FROM booking_requests WHERE id = $1`,
                [bookingId]
            );

            if (current.rows.length === 0) {
                throw ApiError.notFound('Booking request not found');
            }

            throw ApiError.conflict(
                `Booking status has changed. Expected "${expectedStatus}" but found "${current.rows[0].status}". Please refresh and try again.`
            );
        }

        logger.info('Booking state transition', {
            bookingId,
            from: expectedStatus,
            to: toStatus,
            actorId,
        });

        return result.rows[0];
    }

    /**
     * Get the initial status for a booking based on requester role
     * @param {string} requesterRole - 'student' or 'faculty'
     * @returns {string} Initial booking status
     */
    getInitialStatus(requesterRole) {
        switch (requesterRole) {
            case 'student':
                return 'pending_faculty';
            case 'faculty':
            case 'staff':
            case 'admin':
                return 'pending_staff';
            default:
                throw ApiError.badRequest(`Invalid requester role: ${requesterRole}`);
        }
    }

    /**
     * Get all valid transitions from a given status
     * @param {string} status - Current status
     * @returns {string[]} Allowed target statuses
     */
    getAllowedTransitions(status) {
        return TRANSITIONS[status] || [];
    }
}

module.exports = new StateMachineService();
