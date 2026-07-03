import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { acceptInvite } from '../services/apiClient';

export default function InviteAccept() {
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
    setIsLoading(true);
    try {
      await acceptInvite({ token, password });
      setMessage('Akun aktif. Silakan login dengan password baru.');
      setPassword('');
    } catch (err) {
      setError(err?.message || 'Aktivasi akun gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h1 className="text-2xl font-black text-slate-900">Aktivasi Akun</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Masukkan token undangan dan buat password minimal 8 karakter.</p>
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input value={token} onChange={(event) => setToken(event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="invite_token" />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="Password baru" />
          <button disabled={isLoading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-60">
            {isLoading ? 'Memproses...' : 'Aktifkan Akun'}
          </button>
        </form>
        <Link to="/login" className="mt-4 block text-center text-sm font-bold text-blue-700">Kembali ke login</Link>
      </div>
    </div>
  );
}
