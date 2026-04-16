import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { GlobalToastViewport } from './GlobalToastViewport';
import { Sidebar, MobileSidebarToggle } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top Header */}
      <Header />

      {/* Sidebar + Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - hidden on mobile, visible on lg */}
        <div className="hidden lg:flex lg:flex-col lg:w-64">
          <Sidebar />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {/* Mobile sidebar toggle (shown only on mobile) */}
          <div className="lg:hidden p-4 border-b border-slate-200 bg-white sticky top-0 z-30">
            <MobileSidebarToggle />
          </div>

          {/* Page Content */}
          <div className="p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <GlobalToastViewport />
    </div>
  );
}
