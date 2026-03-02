import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../../services/authApi';
import { authStorage } from '../../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() => ({
    user: authStorage.get()?.user || null,
    accessToken: authStorage.get()?.accessToken || null,
    refreshToken: authStorage.get()?.refreshToken || null,
    loading: true,
  }));

  useEffect(() => {
    const bootstrap = async () => {
      const stored = authStorage.get();
      if (!stored?.accessToken) {
        setAuthState((prev) => ({ ...prev, loading: false }));
        return;
      }

      try {
        const response = await authApi.me();
        const user = response?.data?.data?.user;
        const next = {
          ...stored,
          user,
        };
        authStorage.set(next);
        setAuthState({ ...next, loading: false });
      } catch {
        authStorage.clear();
        setAuthState({ user: null, accessToken: null, refreshToken: null, loading: false });
      }
    };

    bootstrap();
  }, []);

  const login = async (email, password) => {
    const response = await authApi.login({ email, password });
    const payload = response?.data?.data;
    const next = {
      user: payload?.user,
      accessToken: payload?.accessToken,
      refreshToken: payload?.refreshToken,
    };
    authStorage.set(next);
    setAuthState({ ...next, loading: false });
  };

  const logout = async () => {
    const refreshToken = authState.refreshToken;
    try {
      if (refreshToken) {
        await authApi.logout({ refreshToken });
      }
    } finally {
      authStorage.clear();
      setAuthState({ user: null, accessToken: null, refreshToken: null, loading: false });
    }
  };

  const getUserRole = () => authState.user?.role || authState.user?.role_name;

  const hasRole = (roles) => {
    if (!authState.user) return false;
    if (!roles?.length) return true;
    return roles.includes(getUserRole());
  };

  const hasPermission = (resource, action) => {
    const permission = authState.user?.permissions?.[resource];
    return Boolean(permission?.[action]);
  };

  const value = useMemo(
    () => ({
      ...authState,
      isAuthenticated: Boolean(authState.accessToken),
      login,
      logout,
      hasRole,
      hasPermission,
      role: getUserRole(),
    }),
    [authState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
