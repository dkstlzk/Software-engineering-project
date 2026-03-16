/**
 * Notification Service Tests
 * Tests notification CRUD and role-based triggers
 */

jest.mock('../src/config/database', () => ({
    query: jest.fn(),
}));

const db = require('../src/config/database');
const notificationService = require('../src/services/notificationService');

describe('NotificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        test('should create a notification', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'notif-1', user_id: 'user-1', title: 'Test', type: 'booking_request' }],
            });

            const result = await notificationService.create({
                userId: 'user-1',
                title: 'Test',
                message: 'Test message',
                type: 'booking_request',
                referenceType: 'booking_request',
                referenceId: 'booking-1',
            });

            expect(result.id).toBe('notif-1');
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO notifications'),
                expect.any(Array)
            );
        });
    });

    describe('notifyBookingCreated', () => {
        test('should notify faculty for student request', async () => {
            const booking = {
                id: 'b1',
                status: 'pending_faculty',
                faculty_verifier_id: 'faculty-1',
                event_title: 'Quiz',
                booking_date: '2027-06-15',
            };

            db.query.mockResolvedValueOnce({
                rows: [{ id: 'notif-1' }],
            });

            await notificationService.notifyBookingCreated(booking);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO notifications'),
                expect.arrayContaining(['faculty-1'])
            );
        });

        test('should notify staff for faculty request', async () => {
            const booking = {
                id: 'b2',
                status: 'pending_staff',
                event_title: 'Seminar',
                booking_date: '2027-06-15',
            };

            // Get staff users
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'staff-1' }, { id: 'admin-1' }],
            });
            // Create notifications for each
            db.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }] });
            db.query.mockResolvedValueOnce({ rows: [{ id: 'n2' }] });

            await notificationService.notifyBookingCreated(booking);

            // Should have queried staff users then created 2 notifications
            expect(db.query).toHaveBeenCalledTimes(3);
        });
    });

    describe('getForUser', () => {
        test('should return paginated notifications', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({
                    rows: [
                        { id: 'n1', title: 'Notif 1' },
                        { id: 'n2', title: 'Notif 2' },
                    ],
                });

            const result = await notificationService.getForUser('user-1', { page: 1, limit: 2 });

            expect(result.data).toHaveLength(2);
            expect(result.pagination.total).toBe(5);
        });

        test('should filter by unread when requested', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ count: '2' }] })
                .mockResolvedValueOnce({ rows: [] });

            await notificationService.getForUser('user-1', { unreadOnly: true });

            const countQuery = db.query.mock.calls[0][0];
            expect(countQuery).toContain('is_read = false');
        });
    });

    describe('markAsRead', () => {
        test('should mark notification as read', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{ id: 'n1', is_read: true }],
            });

            const result = await notificationService.markAsRead('n1', 'user-1');
            expect(result.is_read).toBe(true);
        });

        test('should return null if notification not found', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await notificationService.markAsRead('nonexistent', 'user-1');
            expect(result).toBeNull();
        });
    });

    describe('markAllRead', () => {
        test('should mark all unread as read', async () => {
            db.query.mockResolvedValueOnce({ rowCount: 3 });

            const count = await notificationService.markAllRead('user-1');
            expect(count).toBe(3);
        });
    });

    describe('getUnreadCount', () => {
        test('should return unread count', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });

            const count = await notificationService.getUnreadCount('user-1');
            expect(count).toBe(7);
        });
    });
});
