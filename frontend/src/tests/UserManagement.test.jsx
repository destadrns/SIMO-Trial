import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UserManagement from '../pages/UserManagement';
import * as AppDataCore from '../context/AppDataCore';

vi.mock('../services/apiClient', () => ({
  changeUserRole: vi.fn(),
  changeUserStatus: vi.fn(),
  getAdminUsers: vi.fn(),
  inviteUser: vi.fn(),
  resendUserInvite: vi.fn(),
}));

const baseData = {
  roles: [
    { id: 'foreman', name: 'Foreman' },
    { id: 'admin', name: 'Admin' },
    { id: 'super-admin', name: 'Super Admin' },
  ],
};

const users = [
  {
    id: 'usr-invited',
    name: 'Invited User',
    email: 'invited@simo.test',
    roleId: 'foreman',
    roleName: 'Foreman',
    site: 'Workshop',
    accountStatus: 'INVITED',
  },
];

describe('UserManagement admin actions', () => {
  it('shows Super Admin action controls', () => {
    vi.spyOn(AppDataCore, 'useAppData').mockReturnValue({
      activeUser: { roleId: 'super-admin', roleName: 'Super Admin' },
      data: baseData,
      users,
    });

    render(<UserManagement />);

    expect(screen.getAllByRole('button', { name: /Resend Invite/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Change role for invited@simo.test').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Change status for invited@simo.test').length).toBeGreaterThan(0);
  });

  it('hides action controls from non-Super Admin users', () => {
    vi.spyOn(AppDataCore, 'useAppData').mockReturnValue({
      activeUser: { roleId: 'admin', roleName: 'Admin' },
      data: baseData,
      users,
    });

    render(<UserManagement />);

    expect(screen.queryByRole('button', { name: /Resend Invite/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Change role for invited@simo.test')).not.toBeInTheDocument();
    expect(screen.getAllByText('Read only').length).toBeGreaterThan(0);
  });
});
