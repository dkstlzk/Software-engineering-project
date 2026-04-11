import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../lib/api';
import type { AppNotification } from '../../lib/api';
import { Bell, LogOut, User, Settings, Mail } from 'lucide-react';
import { formatError } from '../../utils/formatError';

function formatNotificationTime(sentAt: string): string {
  const parsed = new Date(sentAt);

  if (Number.isNaN(parsed.getTime())) {
    return sentAt;
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Header() {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const refreshNotifications = useCallback(
    async (silent = false) => {
      if (!user) {
        return;
      }

      if (!silent) {
        setNotificationsLoading(true);
      }

      try {
        const response = await getNotifications({ limit: 20 });
        setNotifications(response.data);
        setNotificationCount(response.unreadCount);
        setNotificationsError(null);
      } catch (error) {
        if (!silent) {
          setNotificationsError(formatError(error, 'Failed to fetch notifications'));
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
      setNotificationCount(0);
      setNotificationsError(null);
      return;
    }

    void refreshNotifications();

    const intervalId = window.setInterval(() => {
      void refreshNotifications(true);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user, refreshNotifications]);

  const handleMarkNotificationRead = async (notificationId: number) => {
    const target = notifications.find(
      (notification) => notification.notificationId === notificationId,
    );

    if (!target || target.isRead) {
      return;
    }

    try {
      await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((notification) =>
          notification.notificationId === notificationId
            ? { ...notification, isRead: true }
            : notification,
        ),
      );
      setNotificationCount((current) => Math.max(0, current - 1));
      setNotificationsError(null);
    } catch (error) {
      setNotificationsError(formatError(error, 'Failed to mark notification as read'));
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (notificationCount === 0) {
      return;
    }

    try {
      await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, isRead: true })),
      );
      setNotificationCount(0);
      setNotificationsError(null);
    } catch (error) {
      setNotificationsError(formatError(error, 'Failed to mark all notifications as read'));
    }
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="border-b bg-white shadow-sm sticky top-0 z-40">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Left section */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Room Booking</h1>
        </div>

        {/* Right section */}
        {user && (
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Bell className="w-5 h-5 text-gray-600" />
                  {notificationCount > 0 && (
                    <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
                <div className="border-b border-gray-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">Notifications</p>
                    <button
                      type="button"
                      onClick={() => void handleMarkAllNotificationsRead()}
                      disabled={notificationCount === 0 || notificationsLoading}
                      className="text-xs font-medium text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      Mark all read
                    </button>
                  </div>
                  {notificationsError && (
                    <p className="mt-1 text-xs text-red-600">{notificationsError}</p>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {notificationsLoading && notifications.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-500">Loading notifications...</p>
                  ) : notifications.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-500">No notifications yet.</p>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.notificationId}
                        type="button"
                        onClick={() => void handleMarkNotificationRead(notification.notificationId)}
                        className={`w-full text-left border-b border-gray-100 px-3 py-2 hover:bg-gray-50 transition-colors ${
                          notification.isRead ? 'bg-white' : 'bg-blue-50/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{notification.subject}</p>
                          {!notification.isRead && (
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-600">{notification.message}</p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {formatNotificationTime(notification.sentAt)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.role}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.role}</p>
                   {user.buildings && user.buildings.length > 0 && (
                     <div className="mt-2 pt-2 border-t border-gray-200">
                       <p className="text-xs font-medium text-gray-700 mb-1">Buildings:</p>
                       {user.buildings.map((building) => (
                         <p key={building.id} className="text-xs text-gray-600">{building.name}</p>
                       ))}
                     </div>
                   )}
                  <div className="flex items-center gap-1 mt-1">
                    {user.registeredVia === 'google' ? (
                      <>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span className="text-xs text-gray-500">Google</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-3 h-3 text-gray-500" />
                        <span className="text-xs text-gray-500">Email</span>
                      </>
                    )}
                  </div>
                </div>
                <DropdownMenuSeparator />
                 <DropdownMenuItem asChild className="cursor-pointer">
                   <Link to="/profile" className="flex items-center">
                     <Settings className="w-4 h-4 mr-2" />
                     <span>Profile & Settings</span>
                   </Link>
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}
