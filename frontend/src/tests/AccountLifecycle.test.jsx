import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ForgotPassword from '../pages/ForgotPassword';
import InviteAccept from '../pages/InviteAccept';
import ResetPassword from '../pages/ResetPassword';
import UserManagement from '../pages/UserManagement';
import * as AppDataCore from '../context/AppDataCore';

vi.mock('../services/apiClient', () => ({
  inviteUser: vi.fn(),
  acceptInvite: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

describe('account lifecycle pages', () => {
  it('renders accept invite page', () => {
    render(<MemoryRouter><InviteAccept /></MemoryRouter>);
    expect(screen.getByText('Aktivasi Akun')).toBeInTheDocument();
  });

  it('renders forgot password page', () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('renders reset password page', () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(screen.getByText('Buat Password Baru')).toBeInTheDocument();
  });

  it('renders user management for super admin data', () => {
    vi.spyOn(AppDataCore, 'useAppData').mockReturnValue({
      data: { roles: [{ id: 'foreman', name: 'Foreman' }] },
      users: [{ id: 'usr-1', name: 'User One', email: 'one@simo.test', roleName: 'Foreman', accountStatus: 'ACTIVE' }],
    });
    render(<UserManagement />);
    expect(screen.getByText('Account Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('User One')).toBeInTheDocument();
  });
});
