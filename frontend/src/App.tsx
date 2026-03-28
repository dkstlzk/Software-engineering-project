import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth/AuthContext";
import { RoomsPage } from "./pages/Rooms";
import { BookingRequestsPage } from "./pages/BookingRequests";
import { BookingsPage } from "./pages/Bookings";
import { AvailabilityPage } from "./pages/Availability";
import { TimetableBuilderPage } from "./pages/TimetableBuilder";

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

function PageRenderer({ page }: { page: PageKey }) {
  switch (page) {
    case "rooms": return <RoomsPage />;
    case "bookingRequests": return <BookingRequestsPage />;
    case "bookings": return <BookingsPage />;
    case "availability": return <AvailabilityPage />;
    case "timetableBuilder": return <TimetableBuilderPage />;
  }
}

function App() {
  const { user, login, logout } = useAuth();
  const [activePage, setActivePage] = useState<PageKey>("rooms");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

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

  // ——— Login screen ———
  if (!user) {
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
        <PageRenderer page={activePage} />
      </main>
    </div>
  );
}

export default App;
