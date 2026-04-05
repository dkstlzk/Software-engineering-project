# Authentication & Route Protection Guide

This document explains the OAuth flow improvements and route protection components.

## Overview

Three new/improved components handle authentication and route protection:

1. **AuthCallbackPage** - Handles OAuth redirect with enhanced UX
2. **AuthSetupPage** - First-time user setup wizard (role + department selection)
3. **ProtectedRoute** - Ensures only authenticated users access routes
4. **RequireRole** - Ensures only users with specific roles access routes

## OAuth Flow

### 1. User Initiates Google Login
User clicks "Sign in with Google" button on the login page.

### 2. OAuth Callback (AuthCallbackPage)
- Backend redirects user to `/auth/callback?token=<oauth_token>`
- Page shows animated loading state: "Completing Sign In"
- Token is extracted from URL query params
- `loginWithToken(token)` is called to authenticate user

**Error Handling:**
- Missing token: Shows error message with "Back to Login" button
- OAuth failure: Displays "Google sign-in failed" message
- Network errors: User-friendly error message

**Redirect Logic:**
- If successful: User is logged in
- Next step is determined by backend (user.role)
- Route protection components handle next redirect

### 3. Role Setup (AuthSetupPage) - If Applicable
Some users may need to complete setup. The page is reached via `/auth/setup?token=<setup_token>`.

**3-Step Wizard:**
1. **Role Selection** - Choose between Student or Faculty (visual cards)
2. **Department Selection** (Faculty only) - Dropdown with department options
3. **Review & Complete** - Confirm settings and submit

**Validation:**
- Role is required
- Department is required for Faculty users
- Uses react-hook-form + Zod for validation

**On Success:**
- Shows success message with spinner
- Auto-redirects to dashboard after 1.5 seconds
- User is fully authenticated and setup complete

## Route Protection

### ProtectedRoute Component

Ensures only authenticated users can access routes. Redirects to `/login` if not authenticated.

**Usage in routes:**
```tsx
import { ProtectedRoute } from '../components/auth';

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />
  },
  {
    path: '/auth/setup',
    element: <AuthSetupPage />
  },

  // Protected routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'rooms', element: <RoomsPage /> },
          // ... other protected routes
        ]
      }
    ]
  },

  // Catch-all
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);
```

### RequireRole Component

Ensures only users with specific roles can access routes. Shows 403 Forbidden if unauthorized.

**Usage in routes:**
```tsx
import { RequireRole } from '../components/auth';

export const router = createBrowserRouter([
  // ... public routes ...

  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          // Regular routes accessible to all authenticated users
          { index: true, element: <DashboardPage /> },
          { path: 'rooms', element: <RoomsPage /> },

          // Admin-only routes
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              { path: 'users', element: <UsersPage /> },
              { path: 'timetable', element: <TimetableBuilderPage /> }
            ]
          },

          // Staff and Admin routes
          {
            element: <RequireRole roles={['STAFF', 'ADMIN']} />,
            children: [
              { path: 'bookings', element: <BookingsPage /> }
            ]
          }
        ]
      }
    ]
  }
]);
```

## User Roles

The system supports the following roles:

- **STUDENT** - Can view rooms and request bookings
- **FACULTY** - Can manage bookings and assign departments
- **STAFF** - Can approve/manage bookings
- **ADMIN** - Full system access (users, timetables, etc.)
- **PENDING_ROLE** - Temporary state during OAuth setup

## Error Handling

### AuthCallbackPage Errors
- OAuth failure → User-friendly message with retry button
- Missing token → Shows error and navigation options
- Network failure → Displays error message and options

### AuthSetupPage Errors
- Missing setup token → Shows error message
- Validation failure → Field-level error messages
- Submission failure → Shows error message with retry option

### Route Protection Errors
- Not authenticated → Redirects to `/login`
- Insufficient role → Shows 403 Forbidden page with "Back to Dashboard" and "Sign in with Different Account" options

## Implementation Details

### AuthCallbackPage
- Extracts token from `window.location.search`
- Calls `useAuth().loginWithToken(token)`
- Shows 3-state UI: loading → success → redirect
- Cancels pending operations on unmount

### AuthSetupPage
- Extracts setup token from URL
- Multi-step form with progress indicator
- Uses Zod validation schema
- Calls `useAuth().completeSetup(setupToken, role, department)`
- Auto-redirects on success

### ProtectedRoute
- Simple wrapper that checks `user !== null`
- Renders `<Outlet />` for child routes if authenticated
- Uses `<Navigate to="/login" />` for unauthenticated users

### RequireRole
- Checks if user's role is in required roles array
- Shows 403 Forbidden component if unauthorized
- Renders `<Outlet />` for child routes if authorized

## Styling

All components use Tailwind CSS with:
- Gradient backgrounds
- Consistent color scheme
- Animated spinners (lucide-react icons)
- Responsive design
- Accessible forms with proper labels

## Future Enhancements

- Add email verification step to setup
- Support additional OAuth providers (GitHub, Microsoft)
- Add role hierarchy (e.g., ADMIN can do everything STAFF can)
- Profile completion after initial setup
- Department-scoped permissions
