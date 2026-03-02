import axios from 'axios';
import { authStorage } from '../utils/storage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

let isRefreshing = false;
let waiters = [];

const runWaiters = (token) => {
  waiters.forEach((resolve) => resolve(token));
  waiters = [];
};

const failWaiters = () => {
  waiters.forEach((resolve) => resolve(null));
  waiters = [];
};

client.interceptors.request.use((config) => {
  const auth = authStorage.get();
  if (auth?.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;
    const auth = authStorage.get();

    if (status !== 401 || originalRequest?._retry || !auth?.refreshToken) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        waiters.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(client(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken: auth.refreshToken,
      });

      const newToken = response?.data?.data?.accessToken;
      authStorage.set({ ...auth, accessToken: newToken });
      runWaiters(newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return client(originalRequest);
    } catch (refreshError) {
      authStorage.clear();
      failWaiters(refreshError);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default client;
