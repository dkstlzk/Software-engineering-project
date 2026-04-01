import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SetupRole } from "./api/api";
import { useAuth } from "./auth/AuthContext";
import { RoomsPage } from "./pages/Rooms";
import { BookingRequestsPage } from "./pages/BookingRequests";
import { BookingsPage } from "./pages/Bookings";
import { AvailabilityPage } from "./pages/Availability";
import { TimetableBuilderPage } from "./pages/TimetableBuilder";
import type {
  AvailabilityPrefill,
  BookingRequestPrefill,
} from "./pages/bookingAvailabilityBridge";

type PageKey = "rooms" | "bookingRequests" | "bookings" | "availability" | "timetableBuilder";

type NavEntry = {
  key: PageKey;
  label: string;
  icon: string;
  roles?: string[]; // if set, only show for these roles
};

const NAV_ITEMS: NavEntry[] = [
  { key: "rooms", label: "Rooms", icon: "🚪" },
  { key: "bookingRequests", label: "Requests", icon: "📋" },
  { key: "bookings", label: "Bookings", icon: "📅", roles: ["ADMIN", "STAFF"] },
  { key: "availability", label: "Availability", icon: "🔍" },
  { key: "timetableBuilder", label: "Timetable Builder", icon: "🧩", roles: ["ADMIN"] },
];

type PageRendererProps = {
  page: PageKey;
  canRequestBooking: boolean;
  bookingRequestPrefill: BookingRequestPrefill | null;
  availabilityPrefill: AvailabilityPrefill | null;
  onBookingRequestPrefillConsumed: () => void;
  onAvailabilityPrefillConsumed: () => void;
  onRequestBookingFromAvailability: (prefill: BookingRequestPrefill) => void;
  onCheckAvailabilityFromRequests: (prefill: AvailabilityPrefill) => void;
};

function PageRenderer({
  page,
  canRequestBooking,
  bookingRequestPrefill,
  availabilityPrefill,
  onBookingRequestPrefillConsumed,
  onAvailabilityPrefillConsumed,
  onRequestBookingFromAvailability,
  onCheckAvailabilityFromRequests,
}: PageRendererProps) {
  switch (page) {
    case "rooms": return <RoomsPage />;
    case "bookingRequests":
      return (
        <BookingRequestsPage
          prefill={bookingRequestPrefill}
          onPrefillApplied={onBookingRequestPrefillConsumed}
          onOpenAvailability={onCheckAvailabilityFromRequests}
        />
      );
    case "bookings": return <BookingsPage />;
    case "availability":
      return (
        <AvailabilityPage
          canRequestBooking={canRequestBooking}
          prefill={availabilityPrefill}
          onPrefillApplied={onAvailabilityPrefillConsumed}
          onRequestBooking={onRequestBookingFromAvailability}
        />
      );
    case "timetableBuilder": return <TimetableBuilderPage />;
  }
}

function App() {
  const { user, login, loginWithGoogle, loginWithToken, completeSetup, logout } = useAuth();
  const [activePage, setActivePage] = useState<PageKey>("rooms");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookingRequestPrefill, setBookingRequestPrefill] = useState<BookingRequestPrefill | null>(null);
  const [availabilityPrefill, setAvailabilityPrefill] = useState<AvailabilityPrefill | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [setupRole, setSetupRole] = useState<SetupRole>("STUDENT");
  const [setupDepartment, setSetupDepartment] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const routeToken = searchParams.get("token");
  const routeError = searchParams.get("error");
  const isOAuthCallbackPath = pathname === "/auth/callback";
  const isOAuthSetupPath = pathname === "/auth/setup";
  const isOAuthFailed = routeError === "oauth_failed";
  const isFirstLoginCallback = searchParams.get("firstLogin") === "true";

  useEffect(() => {
    if (user || !isOAuthFailed) {
      return;
    }

    setAuthError("Google sign-in failed. Please try again.");
  }, [user, isOAuthFailed]);

  useEffect(() => {
    if (user || !isOAuthCallbackPath) {
      return;
    }

    if (!routeToken) {
      setAuthError("Missing OAuth token in callback URL");
      return;
    }

    let isCancelled = false;

    setAuthLoading(true);
    setAuthError(null);

    void loginWithToken(routeToken)
      .then(() => {
        if (isCancelled) {
          return;
        }

        if (isFirstLoginCallback) {
          setAuthNotice("Welcome! Please review your profile and preferences.");
        }

        window.history.replaceState({}, "", "/");
      })
      .catch((e) => {
        if (isCancelled) {
          return;
        }

        setAuthError(e instanceof Error ? e.message : "Google login failed");
      })
      .finally(() => {
        if (!isCancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [user, isOAuthCallbackPath, routeToken, isFirstLoginCallback, loginWithToken]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setAuthError("Email and password are required");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await login(trimmedEmail, password);
      setPassword("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);

    try {
      await loginWithGoogle();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Failed to start Google login");
      setAuthLoading(false);
    }
  };

  const handleCompleteSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!routeToken) {
      setAuthError("Missing setup token");
      return;
    }

    setSetupLoading(true);
    setAuthError(null);

    try {
      const trimmedDepartment = setupDepartment.trim();

      await completeSetup(
        routeToken,
        setupRole,
        trimmedDepartment.length > 0 ? trimmedDepartment : undefined,
      );

      setAuthNotice("Account setup complete. You are now signed in.");
      window.history.replaceState({}, "", "/");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Failed to complete setup");
    } finally {
      setSetupLoading(false);
    }
  };

  // ——— Login screen ———
  if (!user) {
    if (isOAuthCallbackPath) {
      return (
        <div className="login-page">
          <div className="login-card">
            <h1>Room Booking System</h1>
            <p className="subtitle">Completing Google sign-in…</p>
            {authError ? (
              <div className="alert alert-error" style={{ marginTop: "var(--space-4)" }}>
                {authError}
              </div>
            ) : (
              <p className="loading-text">Please wait while we verify your account.</p>
            )}
          </div>
        </div>
      );
    }

    if (isOAuthSetupPath) {
      return (
        <div className="login-page">
          <form className="login-card" onSubmit={handleCompleteSetup}>
            <h1>Complete Account Setup</h1>
            <p className="subtitle">Choose your role to finish Google sign-in</p>

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="setupRole">Role</label>
                <select
                  id="setupRole"
                  className="input"
                  value={setupRole}
                  onChange={(e) => setSetupRole(e.target.value as SetupRole)}
                  disabled={setupLoading}
                >
                  <option value="STUDENT">STUDENT</option>
                  <option value="FACULTY">FACULTY</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="setupDepartment">Department (optional)</label>
                <input
                  id="setupDepartment"
                  className="input"
                  type="text"
                  value={setupDepartment}
                  onChange={(e) => setSetupDepartment(e.target.value)}
                  placeholder="Computer Science"
                  disabled={setupLoading}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={setupLoading}>
              {setupLoading ? "Finishing setup…" : "Complete Setup"}
            </button>

            {authError && (
              <div className="alert alert-error" style={{ marginTop: "var(--space-4)" }}>
                {authError}
              </div>
            )}
          </form>
        </div>
      );
    }

    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Room Booking System</h1>
          <p className="subtitle">Sign in to manage rooms and bookings</p>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="loginEmail">Email</label>
              <input
                id="loginEmail"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                disabled={authLoading}
                autoFocus
              />
            </div>
            <div className="form-field">
              <label htmlFor="loginPassword">Password</label>
              <input
                id="loginPassword"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authLoading}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={authLoading}>
            {authLoading ? "Signing in…" : "Sign In"}
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-google"
            onClick={handleGoogleLogin}
            disabled={authLoading}
          >
            Continue with Google (@iitj.ac.in)
          </button>

          {authError && <div className="alert alert-error" style={{ marginTop: "var(--space-4)" }}>{authError}</div>}
        </form>
      </div>
    );
  }

  // ——— Authenticated shell ———
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const canRequestBooking = user.role === "STUDENT" || user.role === "FACULTY";

  const handleRequestBookingFromAvailability = (prefill: BookingRequestPrefill) => {
    setBookingRequestPrefill(prefill);
    setActivePage("bookingRequests");
    setSidebarOpen(false);
  };

  const handleCheckAvailabilityFromRequests = (prefill: AvailabilityPrefill) => {
    setAvailabilityPrefill(prefill);
    setActivePage("availability");
    setSidebarOpen(false);
  };

  return (
    <div className="app-layout">
      {/* Mobile toggle */}
      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      {/* Overlay for mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <h1>Room Booking</h1>
          <p>College Allocation System</p>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {visibleNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${activePage === item.key ? "active" : ""}`}
              onClick={() => {
                setActivePage(item.key);
                setSidebarOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
          <button type="button" className="btn-logout" onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Page content */}
      <main className="main-area">
        {authNotice && <div className="alert alert-success">{authNotice}</div>}
        <PageRenderer
          page={activePage}
          canRequestBooking={canRequestBooking}
          bookingRequestPrefill={bookingRequestPrefill}
          availabilityPrefill={availabilityPrefill}
          onBookingRequestPrefillConsumed={() => setBookingRequestPrefill(null)}
          onAvailabilityPrefillConsumed={() => setAvailabilityPrefill(null)}
          onRequestBookingFromAvailability={handleRequestBookingFromAvailability}
          onCheckAvailabilityFromRequests={handleCheckAvailabilityFromRequests}
        />
      </main>
    </div>
  );
}

export default App;
