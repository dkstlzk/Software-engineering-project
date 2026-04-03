import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./auth/AuthContext";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "./api/api";
import { RoomsPage } from "./pages/Rooms";
import { BookingRequestsPage } from "./pages/BookingRequests";
import { BookingsPage } from "./pages/Bookings";
import { AvailabilityPage } from "./pages/Availability";
import { TimetableBuilderPage } from "./pages/TimetableBuilder";
import { UsersPage } from "./pages/Users";
import type {
  AvailabilityPrefill,
  BookingRequestPrefill,
} from "./pages/bookingAvailabilityBridge";

type PageKey =
  | "rooms"
  | "bookingRequests"
  | "bookings"
  | "availability"
  | "timetableBuilder"
  | "users";

type NavEntry = {
  key: PageKey;
  label: string;
  icon: string;
  roles?: string[]; // if set, only show for these roles
};

type ToastType = "success" | "error" | "info" | "warning";

type ToastMessage = {
  id: number;
  type: ToastType;
  message: string;
};

const NOTIFICATION_POLL_INTERVAL_MS = 30_000;
const MAX_VISIBLE_TOASTS = 4;

const NAV_ITEMS: NavEntry[] = [
  { key: "rooms", label: "Rooms", icon: "🚪" },
  { key: "users", label: "Users", icon: "👥", roles: ["ADMIN"] },
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
    case "users": return <UsersPage />;
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

function formatNotificationTime(sentAt: string): string {
  const parsed = new Date(sentAt);

  if (Number.isNaN(parsed.getTime())) {
    return sentAt;
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toNotificationTypeLabel(type: AppNotification["type"]): string {
  switch (type) {
    case "BOOKING_REQUEST_CREATED":
      return "Request Created";
    case "BOOKING_REQUEST_FORWARDED":
      return "Request Forwarded";
    case "BOOKING_REQUEST_APPROVED":
      return "Request Approved";
    case "BOOKING_REQUEST_REJECTED":
      return "Request Rejected";
    case "BOOKING_REQUEST_CANCELLED":
      return "Request Cancelled";
  }
}

function getToastIcon(type: ToastType): string {
  switch (type) {
    case "success":
      return "✅";
    case "error":
      return "⚠️";
    case "warning":
      return "⚡";
    case "info":
      return "🔔";
  }
}

function App() {
  const { user, login, loginWithGoogle, loginWithToken, logout } = useAuth();
  const [activePage, setActivePage] = useState<PageKey>("rooms");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookingRequestPrefill, setBookingRequestPrefill] = useState<BookingRequestPrefill | null>(null);
  const [availabilityPrefill, setAvailabilityPrefill] = useState<AvailabilityPrefill | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const notificationPopoverRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(1);
  const previousUnreadCountRef = useRef<number | null>(null);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const routeToken = searchParams.get("token");
  const routeError = searchParams.get("error");
  const firstLoginRole = searchParams.get("role");
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
          if (firstLoginRole === "STUDENT") {
            setAuthNotice("Signed in with Google as STUDENT. Contact admin for FACULTY or STAFF access.");
          } else if (firstLoginRole === "FACULTY" || firstLoginRole === "STAFF" || firstLoginRole === "ADMIN") {
            setAuthNotice(`Welcome! Your ${firstLoginRole} access is enabled.`);
          } else {
            setAuthNotice("Welcome! Google sign-in completed.");
          }
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
  }, [user, isOAuthCallbackPath, routeToken, isFirstLoginCallback, firstLoginRole, loginWithToken]);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;

    setToasts((current) => [...current, { id, type, message }].slice(-MAX_VISIBLE_TOASTS));

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const refreshNotifications = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user) {
        return;
      }

      const silent = options?.silent ?? false;

      if (!silent) {
        setNotificationsLoading(true);
      }

      try {
        const response = await getNotifications({ limit: 30 });
        setNotifications(response.data);
        setUnreadNotificationCount(response.unreadCount);
        setNotificationsError(null);
      } catch (error) {
        if (!silent) {
          setNotificationsError(
            error instanceof Error ? error.message : "Failed to fetch notifications",
          );
        }
      } finally {
        if (!silent) {
          setNotificationsLoading(false);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationsOpen(false);
      setNotificationsError(null);
      previousUnreadCountRef.current = null;
      return;
    }

    void refreshNotifications();

    const intervalId = window.setInterval(() => {
      void refreshNotifications({ silent: true });
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user, refreshNotifications]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const previousUnreadCount = previousUnreadCountRef.current;

    if (
      previousUnreadCount !== null &&
      unreadNotificationCount > previousUnreadCount
    ) {
      const delta = unreadNotificationCount - previousUnreadCount;

      pushToast(
        "info",
        delta === 1
          ? "You have 1 new notification."
          : `You have ${delta} new notifications.`,
      );
    }

    previousUnreadCountRef.current = unreadNotificationCount;
  }, [unreadNotificationCount, user, pushToast]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        notificationPopoverRef.current &&
        !notificationPopoverRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [notificationsOpen]);

  const handleNotificationToggle = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);

    if (nextOpen) {
      void refreshNotifications();
    }
  };

  const handleMarkNotificationRead = async (notificationId: number) => {
    const target = notifications.find(
      (notification) => notification.notificationId === notificationId,
    );

    if (!target || target.isRead) {
      return;
    }

    try {
      const updated = await markNotificationRead(notificationId);

      setNotifications((current) =>
        current.map((notification) =>
          notification.notificationId === notificationId ? updated : notification,
        ),
      );

      setUnreadNotificationCount((current) => Math.max(0, current - 1));
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Failed to mark notification as read",
      );
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (unreadNotificationCount === 0) {
      return;
    }

    try {
      const response = await markAllNotificationsRead();

      if (response.updatedCount > 0) {
        setNotifications((current) =>
          current.map((notification) => ({ ...notification, isRead: true })),
        );

        setUnreadNotificationCount(0);
        pushToast("success", `Marked ${response.updatedCount} notifications as read.`);
      }
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Failed to mark notifications as read",
      );
    }
  };

  const dismissToast = (toastId: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

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
          <div className="login-card">
            <h1>Google Setup Updated</h1>
            <p className="subtitle">
              Role selection during Google setup is disabled. New Google users are granted STUDENT access by default.
            </p>
            <div className="alert alert-success" style={{ marginTop: "var(--space-4)" }}>
              Contact admin if you need FACULTY or STAFF access.
            </div>
          </div>
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
  const unreadBadgeLabel = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);

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
        <div className="shell-toolbar">
          <div className="notification-shell" ref={notificationPopoverRef}>
            <button
              type="button"
              className={`notification-bell ${notificationsOpen ? "open" : ""}`}
              onClick={handleNotificationToggle}
              aria-label="Open notifications"
              aria-expanded={notificationsOpen}
            >
              <span className="notification-bell-icon">🔔</span>
              {unreadNotificationCount > 0 && (
                <span className="notification-badge">{unreadBadgeLabel}</span>
              )}
            </button>

            {notificationsOpen && (
              <section className="notification-panel" role="dialog" aria-label="Notifications panel">
                <header className="notification-panel-header">
                  <div>
                    <h3>Notifications</h3>
                    <p>{unreadNotificationCount} unread</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void handleMarkAllNotificationsRead()}
                    disabled={unreadNotificationCount === 0 || notificationsLoading}
                  >
                    Mark all read
                  </button>
                </header>

                {notificationsError && (
                  <div className="alert alert-error" style={{ marginBottom: "var(--space-3)" }}>
                    {notificationsError}
                  </div>
                )}

                {notificationsLoading && notifications.length === 0 ? (
                  <p className="notification-empty">Loading notifications...</p>
                ) : notifications.length === 0 ? (
                  <p className="notification-empty">No notifications yet.</p>
                ) : (
                  <ul className="notification-list">
                    {notifications.map((notification) => (
                      <li
                        key={notification.notificationId}
                        className={`notification-item ${notification.isRead ? "" : "unread"}`}
                      >
                        <div className="notification-item-header">
                          <span className="notification-subject">{notification.subject}</span>
                          <time className="notification-time" dateTime={notification.sentAt}>
                            {formatNotificationTime(notification.sentAt)}
                          </time>
                        </div>
                        <p className="notification-message">{notification.message}</p>
                        <div className="notification-item-footer">
                          <span className="notification-type">{toNotificationTypeLabel(notification.type)}</span>
                          {!notification.isRead && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => void handleMarkNotificationRead(notification.notificationId)}
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>

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

      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.type}`} role="status">
              <span className="toast-icon">{getToastIcon(toast.type)}</span>
              <span className="toast-message">{toast.message}</span>
              <button
                type="button"
                className="toast-dismiss"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
