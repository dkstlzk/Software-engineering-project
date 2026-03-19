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

export const resourceApi = {
  listDepartments(params) {
    return client.get(`/departments${queryString(params)}`);
  },
  createDepartment(payload) {
    return client.post('/departments', payload);
  },
  updateDepartment(id, payload) {
    return client.put(`/departments/${id}`, payload);
  },
  deleteDepartment(id) {
    return client.delete(`/departments/${id}`);
  },

  listRooms(params) {
    return client.get(`/rooms${queryString(params)}`);
  },
  createRoom(payload) {
    return client.post('/rooms', payload);
  },
  updateRoom(id, payload) {
    return client.put(`/rooms/${id}`, payload);
  },
  deleteRoom(id) {
    return client.delete(`/rooms/${id}`);
  },
  findAvailableRooms(params) {
    return client.get(`/rooms/available${queryString(params)}`);
  },
  getRoomDaySchedule(id, params) {
    return client.get(`/rooms/${id}/schedule${queryString(params)}`);
  },

  getRoomInventory(roomId, params) {
    return client.get(`/rooms/${roomId}/inventory${queryString(params)}`);
  },
  addRoomInventory(roomId, payload) {
    return client.post(`/rooms/${roomId}/inventory`, payload);
  },
  updateInventory(id, payload) {
    return client.put(`/inventory/${id}`, payload);
  },
  updateInventoryStatus(id, payload) {
    return client.patch(`/inventory/${id}/status`, payload);
  },
  deleteInventory(id) {
    return client.delete(`/inventory/${id}`);
  },

  listAllocations(params) {
    return client.get(`/allocations${queryString(params)}`);
  },
  createAllocation(payload) {
    return client.post('/allocations', payload);
  },
  updateAllocation(id, payload) {
    return client.put(`/allocations/${id}`, payload);
  },
  deleteAllocation(id) {
    return client.delete(`/allocations/${id}`);
  },
  validatePolicy(payload) {
    return client.post('/allocations/validate-policy', payload);
  },
  getPolicies() {
    return client.get('/allocations/policies');
  },
  getAllPolicies() {
    return client.get('/allocations/policies/all');
  },
  updatePolicy(roleName, payload) {
    return client.put(`/allocations/policies/${roleName}`, payload);
  },
  getWeekly(roomId, params) {
    return client.get(`/allocations/room/${roomId}/weekly${queryString(params)}`);
  },

  listBuildings(params) {
    return client.get(`/buildings${queryString(params)}`);
  },
  getBuildingRooms(buildingId) {
    return client.get(`/buildings/${buildingId}/rooms`);
  },
  createBuilding(payload) {
    return client.post('/buildings', payload);
  },
  updateBuilding(id, payload) {
    return client.put(`/buildings/${id}`, payload);
  },
  deleteBuilding(id) {
    return client.delete(`/buildings/${id}`);
  },

  listUsers(params) {
    return client.get(`/users${queryString(params)}`);
  },
  registerUser(payload) {
    return client.post('/auth/register', payload);
  },
  updateUser(id, payload) {
    return client.put(`/users/${id}`, payload);
  },
  deleteUser(id) {
    return client.delete(`/users/${id}`);
  },
};
