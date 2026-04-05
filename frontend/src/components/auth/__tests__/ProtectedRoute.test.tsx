import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '../ProtectedRoute';
import type { AuthUser } from '../../../lib/api/types';

const mockUseAuth = vi.fn();
const mockIsProfileSetupRequiredForUser = vi.fn();

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../../../auth/profileSetup', () => ({
  isProfileSetupRequiredForUser: (userId: number) =>
    mockIsProfileSetupRequiredForUser(userId),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bookings" element={<div>Bookings</div>} />
          <Route path="/profile/setup" element={<div>Profile Setup</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/auth/setup" element={<div>Auth Setup</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    name: 'Test User',
    role: 'STAFF',
    ...overrides,
  };
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsProfileSetupRequiredForUser.mockReturnValue(false);
  });

  it('redirects unauthenticated users to login', () => {
    mockUseAuth.mockReturnValue({ user: null });

    renderAt('/bookings');

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects pending-role users to auth setup', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ role: 'PENDING_ROLE' }) });

    renderAt('/bookings');

    expect(screen.getByText('Auth Setup')).toBeInTheDocument();
  });

  it('redirects users requiring profile setup to profile setup page', () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ id: 42 }) });
    mockIsProfileSetupRequiredForUser.mockReturnValue(true);

    renderAt('/bookings');

    expect(screen.getByText('Profile Setup')).toBeInTheDocument();
  });

  it('renders protected content for authenticated users', () => {
    mockUseAuth.mockReturnValue({ user: makeUser() });

    renderAt('/bookings');

    expect(screen.getByText('Bookings')).toBeInTheDocument();
  });
});
