import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/apiClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [demoToken, setDemoToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setDemoToken('');
    setIsLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setMessage(res.data.message);
      setDemoToken(res.data.delivery?.resetToken || '');
    } catch (err) {
      setError(err?.message || 'Permintaan reset gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h1 className="text-2xl font-black text-slate-900">Reset Password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Masukkan email akun aktif. Respons tetap generik untuk mencegah enumerasi akun.</p>
        {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
        {demoToken && <p className="mt-3 break-all rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-600">Demo token: {demoToken}</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="email@perusahaan.com" />
          <button disabled={isLoading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-60">
            {isLoading ? 'Mengirim...' : 'Minta Reset Password'}
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm font-bold text-blue-700">
          <Link to="/login">Login</Link>
          <Link to="/reset-password">Sudah punya token?</Link>
        </div>
      </div>
    </div>
  );
}
