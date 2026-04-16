import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  Activity,
  Bell,
  Calendar,
  Clock,
  FileText,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: Activity },
  { path: '/rooms', label: 'Rooms', icon: Settings },
  { path: '/requests', label: 'Requests', icon: FileText },
  { path: '/bookings', label: 'Bookings', icon: Calendar },
  { path: '/availability', label: 'Availability', icon: Search },
  { path: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { path: '/holidays', label: 'Day Adjustments', icon: Bell, roles: ['ADMIN'] },
  { path: '/timetable', label: 'Timetable', icon: Clock, roles: ['ADMIN'] },
];

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isMobile = false, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Filter nav items based on user role
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && (
        <div
          className="fixed inset-0 bg-black/25 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`bg-white text-slate-900 w-64 flex flex-col border-r border-slate-200 transition-colors duration-100 ${
          isMobile
            ? 'fixed left-0 top-0 h-screen z-40 shadow-sm'
            : 'relative h-full overflow-y-auto'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-slate-700 text-white flex items-center justify-center font-semibold">
              RB
            </div>
            <span className="font-semibold text-base tracking-tight hidden sm:inline">Rooms</span>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded-md transition-colors duration-100 lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  if (isMobile) onClose?.();
                }}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-3 ${
                  active
                    ? 'bg-slate-100 border border-slate-200 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Profile Section */}
        {user && (
          <div className="border-t border-slate-200 p-4 space-y-3">
            <div className="px-4 py-2 rounded-md bg-slate-50 border border-slate-200">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-100 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

export function MobileSidebarToggle() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden p-2 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors duration-100"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>
      {isOpen && (
        <Sidebar isMobile={true} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
