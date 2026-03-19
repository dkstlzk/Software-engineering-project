/**
 * Notification Service
 * Role-aware notification system for booking workflow events
 * 
 * Triggers:
 *   1. Booking created → notify assigned faculty (student) or staff (faculty)
 *   2. Faculty approval → notify staff
 *   3. Final decision → notify requester
 *   4. Rejection → include rejection reason
 */
const db = require('../config/database');
const logger = require('../utils/logger');

class NotificationService {
    /**
     * Create a notification
     * @param {Object} data - { userId, title, message, type, referenceType, referenceId }
     * @returns {Promise<Object>} Created notification
     */
    async create({ userId, title, message, type, referenceType, referenceId }) {
        const result = await db.query(
            `INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [userId, title, message, type, referenceType || null, referenceId || null]
        );

        logger.info('Notification created', { userId, type, referenceId });
        return result.rows[0];
    }

    /**
     * Notify when a booking request is created
     * - Student request → notify assigned faculty verifier
     * - Faculty request → notify all staff members
     * @param {Object} booking - The created booking request (with requester info)
     */
    async notifyBookingCreated(booking) {
        try {
            if (booking.status === 'pending_faculty' && booking.faculty_verifier_id) {
                // Student request — notify the assigned faculty
                await this.create({
                    userId: booking.faculty_verifier_id,
                    title: 'New Booking Request for Verification',
                    message: `A student has submitted a booking request for ${booking.event_title} on ${booking.booking_date}. Please review and verify.`,
                    type: 'booking_request',
                    referenceType: 'booking_request',
                    referenceId: booking.id,
                });
            } else if (booking.status === 'pending_staff') {
                // Faculty/staff request — notify all staff members
                const staffUsers = await db.query(
                    `SELECT u.id FROM users u
                     JOIN roles r ON u.role_id = r.id
                     WHERE r.name IN ('staff', 'admin') AND u.is_active = true`
                );

                for (const staff of staffUsers.rows) {
                    await this.create({
                        userId: staff.id,
                        title: 'New Booking Request for Approval',
                        message: `A new booking request for ${booking.event_title} on ${booking.booking_date} requires your approval.`,
                        type: 'booking_request',
                        referenceType: 'booking_request',
                        referenceId: booking.id,
                    });
                }
            }
        } catch (error) {
            // Notification failures should not break the booking flow
            logger.error('Failed to send booking created notification', { error: error.message, bookingId: booking.id });
        }
    }

    /**
     * Notify when faculty approves a student request
     * → Notify staff that the request is ready for final approval
     * @param {Object} booking - The booking request
     */
    async notifyFacultyApproval(booking) {
        try {
            const staffUsers = await db.query(
                `SELECT u.id FROM users u
                 JOIN roles r ON u.role_id = r.id
                 WHERE r.name IN ('staff', 'admin') AND u.is_active = true`
            );

            for (const staff of staffUsers.rows) {
                await this.create({
                    userId: staff.id,
                    title: 'Booking Request Faculty-Verified',
                    message: `Booking request for ${booking.event_title} on ${booking.booking_date} has been verified by faculty and is pending your approval.`,
                    type: 'approval',
                    referenceType: 'booking_request',
                    referenceId: booking.id,
                });
            }
        } catch (error) {
            logger.error('Failed to send faculty approval notification', { error: error.message, bookingId: booking.id });
        }
    }

    /**
     * Notify the requester of the final decision
     * @param {Object} booking - The booking request
     * @param {'approved' | 'rejected'} decision
     * @param {string|null} reason - Rejection reason if rejected
     */
    async notifyFinalDecision(booking, decision, reason = null) {
        try {
            const isApproved = decision === 'approved';
            const title = isApproved ? 'Booking Request Approved' : 'Booking Request Rejected';
            let message = isApproved
                ? `Your booking request for ${booking.event_title} on ${booking.booking_date} has been approved.`
                : `Your booking request for ${booking.event_title} on ${booking.booking_date} has been rejected.`;

            if (!isApproved && reason) {
                message += ` Reason: ${reason}`;
            }

            await this.create({
                userId: booking.requester_id,
                title,
                message,
                type: isApproved ? 'approval' : 'rejection',
                referenceType: 'booking_request',
                referenceId: booking.id,
            });
        } catch (error) {
            logger.error('Failed to send final decision notification', { error: error.message, bookingId: booking.id });
        }
    }

    /**
     * Get notifications for a user
     * @param {string} userId - User UUID
     * @param {Object} options - { unreadOnly, page, limit }
     * @returns {Promise<Object>} { data, pagination }
     */
    async getForUser(userId, options = {}) {
        const { unreadOnly = false, page = 1, limit = 20 } = options;
        const offset = (page - 1) * limit;

        const params = [userId];
        let readFilter = '';

        if (unreadOnly) {
            readFilter = 'AND is_read = false';
        }

        const countResult = await db.query(
            `SELECT COUNT(*) FROM notifications WHERE user_id = $1 ${readFilter}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT * FROM notifications
             WHERE user_id = $1 ${readFilter}
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return {
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Mark a notification as read
     * @param {string} notificationId - Notification UUID
     * @param {string} userId - User UUID (ownership check)
     * @returns {Promise<Object>} Updated notification
     */
    async markAsRead(notificationId, userId) {
        const result = await db.query(
            `UPDATE notifications SET is_read = true, read_at = NOW()
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [notificationId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    /**
     * Mark all notifications as read for a user
     * @param {string} userId - User UUID
     * @returns {Promise<number>} Count of updated notifications
     */
    async markAllRead(userId) {
        const result = await db.query(
            `UPDATE notifications SET is_read = true, read_at = NOW()
             WHERE user_id = $1 AND is_read = false`,
            [userId]
        );

        return result.rowCount;
    }

    /**
     * Get unread notification count for a user
     * @param {string} userId - User UUID
     * @returns {Promise<number>}
     */
    async getUnreadCount(userId) {
        const result = await db.query(
            `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
            [userId]
        );

        return parseInt(result.rows[0].count);
    }
}

module.exports = new NotificationService();
