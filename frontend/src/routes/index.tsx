import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { RequireRole } from '../components/auth/RequireRole';

// Lazy load pages
// eslint-disable-next-line react-refresh/only-export-components
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
// eslint-disable-next-line react-refresh/only-export-components
const RoomsPage = lazy(() => import('../pages/RoomsPage'));
// eslint-disable-next-line react-refresh/only-export-components
const BookingsPage = lazy(() => import('../pages/BookingsPage'));
// eslint-disable-next-line react-refresh/only-export-components
const BookingRequestsPage = lazy(() => import('../pages/BookingRequestsPage'));
// eslint-disable-next-line react-refresh/only-export-components
const AvailabilityPage = lazy(() => import('../pages/AvailabilityPage'));
// eslint-disable-next-line react-refresh/only-export-components
const UsersPage = lazy(() => import('../pages/UsersPage'));
// eslint-disable-next-line react-refresh/only-export-components
const HolidaysPage = lazy(() => import('../pages/HolidaysPage'));
// eslint-disable-next-line react-refresh/only-export-components
const TimetableLayoutPage = lazy(() => import('../pages/timetable/TimetableLayoutPage'));
// eslint-disable-next-line react-refresh/only-export-components
const TimetableOverviewPage = lazy(() => import('../pages/timetable/TimetableOverviewPage'));
// eslint-disable-next-line react-refresh/only-export-components
const TimetableStructurePage = lazy(() => import('../pages/timetable/TimetableStructurePage'));
// eslint-disable-next-line react-refresh/only-export-components
const TimetableImportsPage = lazy(() => import('../pages/timetable/TimetableImportsPage'));
// eslint-disable-next-line react-refresh/only-export-components
const TimetableProcessedRowsPage = lazy(() => import('../pages/timetable/TimetableProcessedRowsPage'));
// eslint-disable-next-line react-refresh/only-export-components
const TimetableWorkspacePage = lazy(() => import('../pages/timetable/TimetableWorkspacePage'));
// eslint-disable-next-line react-refresh/only-export-components
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage'));
// eslint-disable-next-line react-refresh/only-export-components
const AuthSetupPage = lazy(() => import('../pages/AuthSetupPage'));
// eslint-disable-next-line react-refresh/only-export-components
const LoginPage = lazy(() => import('../pages/LoginPage'));
// eslint-disable-next-line react-refresh/only-export-components
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
// eslint-disable-next-line react-refresh/only-export-components
const ProfileSetupPage = lazy(() => import('../pages/ProfileSetupPage'));
// eslint-disable-next-line react-refresh/only-export-components
const PageLoader = () => (
  <div className="flex items-center justify-center w-full h-screen">
    <div className="text-lg text-gray-500">Loading...</div>
  </div>
);

// eslint-disable-next-line react-refresh/only-export-components
export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: 'profile/setup',
        element: <Suspense fallback={<PageLoader />}><ProfileSetupPage /></Suspense>,
      },
      {
        path: '/',
        element: <AppShell />,
        children: [
          // Accessible to all authenticated users
          { index: true, element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense> },
          { 
            path: 'availability', 
            element: <Suspense fallback={<PageLoader />}><AvailabilityPage /></Suspense> 
          },
          { 
            path: 'profile', 
            element: <Suspense fallback={<PageLoader />}><ProfilePage /></Suspense> 
          },
          
          // Accessible to all authenticated users (view-only for students/faculty)
          { 
            path: 'rooms', 
            element: <Suspense fallback={<PageLoader />}><RoomsPage /></Suspense> 
          },
          {
            path: 'bookings',
            element: <Suspense fallback={<PageLoader />}><BookingsPage /></Suspense>
          },

          // Accessible to all authenticated users (but page filters by role)
          { 
            path: 'requests', 
            element: <Suspense fallback={<PageLoader />}><BookingRequestsPage /></Suspense> 
          },

          // ADMIN only
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              { 
                path: 'users', 
                element: <Suspense fallback={<PageLoader />}><UsersPage /></Suspense> 
              },
              {
                path: 'holidays',
                element: <Suspense fallback={<PageLoader />}><HolidaysPage /></Suspense>,
              },
              {
                path: 'timetable',
                element: <Suspense fallback={<PageLoader />}><TimetableLayoutPage /></Suspense>,
                children: [
                  {
                    index: true,
                    element: <Suspense fallback={<PageLoader />}><TimetableOverviewPage /></Suspense>,
                  },
                  {
                    path: 'structure',
                    element: <Suspense fallback={<PageLoader />}><TimetableStructurePage /></Suspense>,
                  },
                  {
                    path: 'imports',
                    element: <Suspense fallback={<PageLoader />}><TimetableImportsPage /></Suspense>,
                  },
                  {
                    path: 'processed',
                    element: <Suspense fallback={<PageLoader />}><TimetableProcessedRowsPage /></Suspense>,
                  },
                  {
                    path: 'workspace',
                    element: <Suspense fallback={<PageLoader />}><TimetableWorkspacePage /></Suspense>,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '/auth/callback',
    element: <Suspense fallback={<PageLoader />}><AuthCallbackPage /></Suspense>,
  },
  {
    path: '/auth/setup',
    element: <Suspense fallback={<PageLoader />}><AuthSetupPage /></Suspense>,
  },
  {
    path: '/login',
    element: <Suspense fallback={<PageLoader />}><LoginPage /></Suspense>,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
