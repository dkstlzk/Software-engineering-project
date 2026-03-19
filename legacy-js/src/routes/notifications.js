/**
 * Notification Routes
 * Mounts notification endpoints
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// All routes require authentication
router.use(authenticate);

// GET /notifications — Get notifications for authenticated user
router.get('/', notificationController.getNotifications);

// GET /notifications/unread-count — Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// PATCH /notifications/read-all — Mark all as read (must be before /:id)
router.patch('/read-all', notificationController.markAllRead);

// PATCH /notifications/:id/read — Mark single as read
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
