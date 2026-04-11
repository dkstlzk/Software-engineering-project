import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../LoginPage';

const loginMock = vi.fn();
const loginWithGoogleMock = vi.fn();

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    login: loginMock,
    loginWithGoogle: loginWithGoogleMock,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/login');
  });

  it('shows validation message for non-iitj email', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'user@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in with Email' }));

    expect(
      await screen.findByText('Please use your @iitj.ac.in email address.'),
    ).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('submits valid email login credentials', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'staff@iitj.ac.in');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in with Email' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        'staff@iitj.ac.in',
        'password123',
        'email',
      );
    });
  });
});
