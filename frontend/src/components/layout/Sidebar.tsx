import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { LogOut, X, Menu } from 'lucide-react';

type NavItem = {
  path: string;
  label: string;
  icon: string;
  roles?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/rooms', label: 'Rooms', icon: '🚪' },
  { path: '/requests', label: 'Requests', icon: '📋' },
  { path: '/bookings', label: 'Bookings', icon: '📅' },
  { path: '/availability', label: 'Availability', icon: '🔍' },
  { path: '/users', label: 'Users', icon: '👥', roles: ['ADMIN'] },
  { path: '/timetable', label: 'Timetable', icon: '🧩', roles: ['ADMIN'] },
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
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`bg-gray-900 text-white w-64 flex flex-col transition-all duration-300 ${
          isMobile
            ? 'fixed left-0 top-0 h-screen z-40 shadow-lg'
            : 'relative h-full overflow-y-auto'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center font-bold">
              RB
            </div>
            <span className="font-semibold text-lg hidden sm:inline">Rooms</span>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  if (isMobile) onClose?.();
                }}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-3 ${
                  active
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Profile Section */}
        {user && (
          <div className="border-t border-gray-800 p-4 space-y-3">
            <div className="px-4 py-2 rounded-lg bg-gray-800">
              <p className="text-sm font-medium text-gray-200">{user.name}</p>
              <p className="text-xs text-gray-400">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200 flex items-center gap-2"
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
        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Menu className="w-5 h-5 text-gray-600" />
      </button>
      {isOpen && (
        <Sidebar isMobile={true} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
