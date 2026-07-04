import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { requestPasswordReset } from '../services/apiClient';
import { ActionButton, AlertMessage, FormField } from '../components/ui';

const inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans sm:p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-black text-slate-900">Reset Password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Masukkan email akun aktif. Respons tetap generik untuk mencegah enumerasi akun.</p>
        {error && <AlertMessage type="error" title="Permintaan gagal">{error}</AlertMessage>}
        {message && <AlertMessage type="success" title="Instruksi reset diproses">{message}</AlertMessage>}
        {demoToken && <AlertMessage type="info" title="Demo token"><span className="break-all text-xs font-semibold">{demoToken}</span></AlertMessage>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <FormField id="reset-email" label="Email akun">
            <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className={inputClass} placeholder="email@perusahaan.com" />
          </FormField>
          <ActionButton type="submit" icon={Mail} disabled={isLoading} className="w-full">
            {isLoading ? 'Mengirim...' : 'Minta Reset Password'}
          </ActionButton>
        </form>
        <div className="mt-4 flex justify-between gap-4 text-sm font-bold text-blue-700">
          <Link to="/login" className="hover:text-blue-800">Login</Link>
          <Link to="/reset-password" className="hover:text-blue-800">Sudah punya token?</Link>
        </div>
      </div>
    </div>
  );
}
