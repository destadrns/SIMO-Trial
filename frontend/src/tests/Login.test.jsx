import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Login from '../pages/Login';
import * as AppDataCore from '../context/AppDataCore';

describe('Login Component DOM Tests', () => {
  const mockLogin = vi.fn();

  vi.spyOn(AppDataCore, 'useAppData').mockReturnValue({
    login: mockLogin,
  });

  it('renders public login form elements without registration link', () => {
    render(<Login />);

    expect(screen.getByText('Masuk ke SIMO')).toBeInTheDocument();
    expect(screen.getByText('Gunakan email perusahaan dan password yang sudah dibuat dari invite atau reset password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Alamat Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText('Lupa password?')).toBeInTheDocument();
    expect(screen.queryByText('Akun demo kelas')).not.toBeInTheDocument();
    expect(screen.queryByText('super.admin@simo.test')).not.toBeInTheDocument();
    expect(screen.queryByText(/Create Account|Register|Daftar Akun/i)).not.toBeInTheDocument();
  });

  it('submits form with correct parameters', async () => {
    mockLogin.mockClear();
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Alamat Email'), {
      target: { value: 'dewi.lestari@simo.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    });

    const submitButton = screen.getByRole('button', { name: /Masuk Aplikasi/i });
    fireEvent.click(submitButton);

    expect(mockLogin).toHaveBeenCalledWith('dewi.lestari@simo.test', 'password');
  });
});
