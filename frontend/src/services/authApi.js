import client from './apiClient';

export const authApi = {
  login(payload) {
    return client.post('/auth/login', payload);
  },
  me() {
    return client.get('/auth/me');
  },
  logout(payload) {
    return client.post('/auth/logout', payload);
  },
  logoutAll() {
    return client.post('/auth/logout-all');
  },
  changePassword(payload) {
    return client.post('/auth/change-password', payload);
  },
};
