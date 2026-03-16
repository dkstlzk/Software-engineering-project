/**
 * Notification Controller
 * Thin controller for notification operations
 */
const notificationService = require('../services/notificationService');
const { asyncHandler } = require('../utils/errorHandler');

/**
 * GET /notifications — Get notifications for the authenticated user
 */
const getNotifications = asyncHandler(async (req, res) => {
    const { unreadOnly, page, limit } = req.query;

    const result = await notificationService.getForUser(req.user.userId, {
        unreadOnly: unreadOnly === 'true',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
    });

    res.json({ success: true, ...result });
});

/**
 * GET /notifications/unread-count — Get unread notification count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
    const count = await notificationService.getUnreadCount(req.user.userId);
    res.json({ success: true, data: { count } });
});

/**
 * PATCH /notifications/:id/read — Mark a notification as read
 */
const markAsRead = asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(req.params.id, req.user.userId);

    if (!notification) {
        return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
});

/**
 * PATCH /notifications/read-all — Mark all notifications as read
 */
const markAllRead = asyncHandler(async (req, res) => {
    const count = await notificationService.markAllRead(req.user.userId);
    res.json({ success: true, data: { updated: count }, message: `${count} notifications marked as read` });
});

module.exports = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllRead,
};
