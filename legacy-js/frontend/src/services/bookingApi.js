import client from './apiClient';

const queryString = (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, value);
        }
    });
    const result = search.toString();
    return result ? `?${result}` : '';
};

export const bookingApi = {
    /** POST /booking/request */
    createBooking(payload) {
        return client.post('/booking/request', payload);
    },

    /** GET /booking/:id */
    getBookingById(id) {
        return client.get(`/booking/${id}`);
    },

    /** GET /booking/user/:userId */
    getUserBookings(userId, params = {}) {
        return client.get(`/booking/user/${userId}${queryString(params)}`);
    },

    /** GET /booking/pending/faculty */
    getPendingForFaculty() {
        return client.get('/booking/pending/faculty');
    },

    /** GET /booking/pending/staff */
    getPendingForStaff() {
        return client.get('/booking/pending/staff');
    },

    /** POST /booking/:id/approve */
    approveBooking(id, data = {}) {
        return client.post(`/booking/${id}/approve`, data);
    },

    /** POST /booking/:id/reject */
    rejectBooking(id, data) {
        return client.post(`/booking/${id}/reject`, data);
    },

    /** GET /notifications */
    getNotifications(params = {}) {
        return client.get(`/notifications${queryString(params)}`);
    },

    /** GET /notifications/unread-count */
    getUnreadCount() {
        return client.get('/notifications/unread-count');
    },

    /** PATCH /notifications/:id/read */
    markAsRead(id) {
        return client.patch(`/notifications/${id}/read`);
    },

    /** PATCH /notifications/read-all */
    markAllRead() {
        return client.patch('/notifications/read-all');
    },
};
