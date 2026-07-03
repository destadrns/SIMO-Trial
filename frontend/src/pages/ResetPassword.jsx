import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/apiClient';

function isStrongEnoughPassword(password) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!isStrongEnoughPassword(password)) {
      setError('Password minimal 8 karakter dan wajib berisi huruf serta angka.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await resetPassword({ token, password });
      setMessage(res.data.message);
      setPassword('');
    } catch (err) {
      setError(err?.message || 'Reset password gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h1 className="text-2xl font-black text-slate-900">Buat Password Baru</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Token hanya bisa dipakai sekali. Password baru wajib berisi huruf dan angka.</p>
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input value={token} onChange={(event) => setToken(event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="reset_token" />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} pattern="(?=.*[A-Za-z])(?=.*\\d).{8,}" className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="Password baru" />
          <button disabled={isLoading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-60">
            {isLoading ? 'Menyimpan...' : 'Reset Password'}
          </button>
        </form>
        <Link to="/login" className="mt-4 block text-center text-sm font-bold text-blue-700">Kembali ke login</Link>
      </div>
    </div>
  );
}
