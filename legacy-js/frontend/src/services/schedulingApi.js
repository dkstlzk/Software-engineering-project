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

export const schedulingApi = {
    /**
     * List all slot systems
     * GET /api/slot-systems
     */
    getSlotSystems() {
        return client.get('/slot-systems');
    },

    /**
     * Get slot system by ID (includes slots)
     * GET /api/slot-systems/:id
     */
    getSlotSystemById(id) {
        return client.get(`/slot-systems/${id}`);
    },

    /**
     * Create a new slot system
     * POST /api/slot-systems
     * @param {{ name: string, programType: string, yearGroup?: string, description?: string }} payload
     */
    createSlotSystem(payload) {
        return client.post('/slot-systems', payload);
    },

    /**
     * Upload slots to a slot system
     * POST /api/slot-systems/:id/upload
     * @param {string} id - Slot system UUID
     * @param {Array<{ slotCode: string, day: string, startTime: string, endTime: string }>} slots
     */
    uploadSlots(id, slots) {
        return client.post(`/slot-systems/${id}/upload`, { slots });
    },

    /**
     * Upload timetable entries linked to a slot system
     * POST /api/timetables/upload
     * @param {{ slotSystemId: string, entries: Array }} payload
     */
    uploadTimetable(payload) {
        return client.post('/timetables/upload', payload);
    },

    /**
     * Get room availability for a date/slot/slotSystem
     * GET /api/rooms/availability?date=&slot=&slotSystemId=
     */
    getRoomAvailability(params) {
        return client.get(`/rooms/availability${queryString(params)}`);
    },
};
