// Example: How to integrate ProtectedRoute and RequireRole in routes/index.tsx
// This shows the recommended route structure using the new components

import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute, RequireRole } from '../components/auth';

// Lazy load pages
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const RoomsPage = lazy(() => import('../pages/RoomsPage'));
const BookingsPage = lazy(() => import('../pages/BookingsPage'));
const BookingRequestsPage = lazy(() => import('../pages/BookingRequestsPage'));
const AvailabilityPage = lazy(() => import('../pages/AvailabilityPage'));
const UsersPage = lazy(() => import('../pages/UsersPage'));
const TimetableBuilderPage = lazy(() => import('../pages/TimetableBuilderPage'));
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage'));
const AuthSetupPage = lazy(() => import('../pages/AuthSetupPage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center w-full h-screen">
    <div className="text-lg text-gray-500">Loading...</div>
  </div>
);

// RECOMMENDED ROUTE STRUCTURE:
export const router = createBrowserRouter([
  // ===== PUBLIC ROUTES =====
  {
    path: '/login',
    element: <Suspense fallback={<PageLoader />}><LoginPage /></Suspense>,
  },
  {
    path: '/auth/callback',
    element: <Suspense fallback={<PageLoader />}><AuthCallbackPage /></Suspense>,
  },
  {
    path: '/auth/setup',
    element: <Suspense fallback={<PageLoader />}><AuthSetupPage /></Suspense>,
  },

  // ===== PROTECTED ROUTES (requires authentication) =====
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          // Routes accessible by ALL authenticated users
          {
            index: true,
            element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>,
          },
          {
            path: 'rooms',
            element: <Suspense fallback={<PageLoader />}><RoomsPage /></Suspense>,
          },
          {
            path: 'requests',
            element: <Suspense fallback={<PageLoader />}><BookingRequestsPage /></Suspense>,
          },
          {
            path: 'availability',
            element: <Suspense fallback={<PageLoader />}><AvailabilityPage /></Suspense>,
          },

          // Routes accessible by ADMIN only
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              {
                path: 'users',
                element: <Suspense fallback={<PageLoader />}><UsersPage /></Suspense>,
              },
              {
                path: 'timetable',
                element: <Suspense fallback={<PageLoader />}><TimetableBuilderPage /></Suspense>,
              },
            ],
          },

          // Routes accessible by STAFF and ADMIN
          {
            element: <RequireRole roles={['STAFF', 'ADMIN']} />,
            children: [
              {
                path: 'bookings',
                element: <Suspense fallback={<PageLoader />}><BookingsPage /></Suspense>,
              },
            ],
          },
        ],
      },
    ],
  },

  // ===== CATCH-ALL =====
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

/*
KEY FEATURES:

1. AUTHENTICATION PROTECTION (ProtectedRoute)
   - All routes under <ProtectedRoute /> require user to be logged in
   - Unauthenticated users are redirected to /login
   - Applied at the highest level before AppShell

2. ROLE-BASED ACCESS CONTROL (RequireRole)
   - Specific routes can be protected by role
   - Multiple roles can be specified: roles={['STAFF', 'ADMIN']}
   - Unauthorized users see a 403 Forbidden page
   - Applied to individual route subtrees

3. USAGE EXAMPLES:

   Admin-only page:
   <RequireRole roles={['ADMIN']} /> → UsersPage

   Staff and Admin:
   <RequireRole roles={['STAFF', 'ADMIN']} /> → BookingsPage

   All authenticated users:
   No RequireRole component needed

4. USER ROLES:
   - STUDENT: Basic access (rooms, requests, availability)
   - FACULTY: Can manage bookings, assigned to departments
   - STAFF: Can approve bookings, manage bookings
   - ADMIN: Full access (users, timetables, all admin features)
   - PENDING_ROLE: Temporary during OAuth setup
*/
