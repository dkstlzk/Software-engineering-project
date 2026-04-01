import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  clearAuth,
  completeOAuthSetup,
  getAuthUser,
  login as apiLogin,
  loginWithOAuthToken,
  startGoogleOAuthLogin,
  setOnUnauthorized,
  type SetupRole,
} from "../api/api";
import type { AuthUser } from "../api/api";

type AuthContextValue = {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  completeSetup: (setupToken: string, role: SetupRole, department?: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getAuthUser());

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  // Wire up the 401 auto-logout callback
  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await apiLogin(email, password);
    setUser(loggedInUser);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await startGoogleOAuthLogin();
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    const loggedInUser = await loginWithOAuthToken(token);
    setUser(loggedInUser);
  }, []);

  const completeSetup = useCallback(
    async (setupToken: string, role: SetupRole, department?: string) => {
      const loggedInUser = await completeOAuthSetup({
        setupToken,
        role,
        ...(department !== undefined ? { department } : {}),
      });
      setUser(loggedInUser);
    },
    [],
  );

  const value = useMemo(
    () => ({ user, login, loginWithGoogle, loginWithToken, completeSetup, logout }),
    [user, login, loginWithGoogle, loginWithToken, completeSetup, logout]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
