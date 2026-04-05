import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import type { ReactNode } from "react";
import {
  clearAuth,
  completeOAuthSetup,
  getAuthUser,
  getAuthToken,
  login as apiLogin,
  loginWithOAuthToken,
  startGoogleOAuthLogin,
  setOnUnauthorized,
  refreshAccessToken,
  type SetupRole,
} from "../lib/api";
import type { AuthUser } from "../lib/api";
import { isTokenExpired, isTokenExpiring } from "../lib/api/jwt-utils";
import { LAST_ACTIVITY_KEY } from "../lib/api/constants";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, authProvider?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  completeSetup: (setupToken: string, role: SetupRole, department?: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT_WARNING_TIME = 30 * 60 * 1000; // 30 minutes of inactivity
const SESSION_TIMEOUT_TIME = 35 * 60 * 1000; // 35 minutes of inactivity

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getAuthUser());
  const [isLoading, setIsLoading] = useState(true);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutWarningShownRef = useRef<boolean>(false);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setShowTimeoutWarning(false);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  }, []);

  // Check initial auth state
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getAuthToken();

        if (!token) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        if (isTokenExpired(token)) {
          // Try to refresh
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            setUser(getAuthUser());
          } else {
            clearAuth();
            setUser(null);
          }
        } else {
          setUser(getAuthUser());
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        clearAuth();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Track user activity
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current));
      timeoutWarningShownRef.current = false;
      setShowTimeoutWarning(false);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, updateActivity);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  // Token refresh timer - check every 5 minutes
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      const token = getAuthToken();

      if (!token) {
        clearAuth();
        setUser(null);
        return;
      }

      // Refresh if token is expiring soon (within 2 minutes)
      if (isTokenExpiring(token, 2 * 60 * 1000)) {
        try {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            setUser(getAuthUser());
            return;
          }

          // Keep the current user if the access token is still valid.
          const latestToken = getAuthToken();
          if (!latestToken || isTokenExpired(latestToken)) {
            clearAuth();
            setUser(null);
          }
        } catch (error) {
          console.error("Token refresh error:", error);
        }
      }
    }, TOKEN_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user]);

  // Session timeout timer - check every minute
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;

      // Show warning at 30 minutes
      if (
        timeSinceLastActivity >= SESSION_TIMEOUT_WARNING_TIME &&
        !timeoutWarningShownRef.current
      ) {
        timeoutWarningShownRef.current = true;
        setShowTimeoutWarning(true);
      }

      // Auto-logout at 35 minutes
      if (timeSinceLastActivity >= SESSION_TIMEOUT_TIME) {
        logout();
      }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, [user, logout]);

  // Wire up the 401 auto-logout callback
  useEffect(() => {
    setOnUnauthorized(logout);

    return () => {
      setOnUnauthorized(() => {});
    };
  }, [logout]);

  const login = useCallback(async (email: string, password: string, authProvider: string = "email") => {
    const loggedInUser = await apiLogin(email, password, authProvider);
    setUser(loggedInUser);
    lastActivityRef.current = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current));
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await startGoogleOAuthLogin();
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    const loggedInUser = await loginWithOAuthToken(token);
    setUser(loggedInUser);
    lastActivityRef.current = Date.now();
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current));
  }, []);

  const completeSetup = useCallback(
    async (setupToken: string, role: SetupRole, department?: string) => {
      const loggedInUser = await completeOAuthSetup({
        setupToken,
        role,
        ...(department !== undefined ? { department } : {}),
      });
      setUser(loggedInUser);
      lastActivityRef.current = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityRef.current));
    },
    [],
  );

  const refreshToken = useCallback(async () => {
    try {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        setUser(getAuthUser());
      } else {
        const token = getAuthToken();
        if (!token || isTokenExpired(token)) {
          clearAuth();
          setUser(null);
        }
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      loginWithGoogle,
      loginWithToken,
      completeSetup,
      logout,
      refreshToken,
    }),
    [user, isLoading, login, loginWithGoogle, loginWithToken, completeSetup, logout, refreshToken]
  );

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? (
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-lg mb-4">
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-lg font-semibold text-white">Loading...</h2>
            <p className="text-slate-400 mt-2">Checking your session</p>
          </div>
        </div>
      ) : (
        <>
          {showTimeoutWarning && (
            <SessionTimeoutModal onLogout={logout} onStayLoggedIn={() => setShowTimeoutWarning(false)} />
          )}
          {children}
        </>
      )}
    </AuthContext.Provider>
  );
}

// Simple session timeout warning modal
function SessionTimeoutModal({
  onLogout,
  onStayLoggedIn,
}: {
  onLogout: () => void;
  onStayLoggedIn: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onLogout]);

  const minutesLeft = Math.floor(timeLeft / 60);
  const secondsLeft = timeLeft % 60;
  const displayTime = minutesLeft > 0
    ? `${minutesLeft}:${String(secondsLeft).padStart(2, '0')}`
    : `${secondsLeft}s`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Session Timeout</h2>
        <p className="text-slate-600 mb-6">
          You've been inactive for 30 minutes. You'll be logged out in{" "}
          <span className="font-semibold text-red-600">{displayTime}</span>.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg font-medium hover:bg-slate-300 transition-colors"
          >
            Logout
          </button>
          <button
            onClick={onStayLoggedIn}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
