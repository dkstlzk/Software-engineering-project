const STORAGE_KEY = 'uras.auth';

export const authStorage = {
  get() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
