import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { acceptInvite } from '../services/apiClient';
import { ActionButton, AlertMessage, FormField } from '../components/ui';

const inputClass = 'w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const passwordRules = [
  { label: 'Minimal 8 karakter', test: (value) => value.length >= 8 },
  { label: 'Mengandung huruf', test: (value) => /[A-Za-z]/.test(value) },
  { label: 'Mengandung angka', test: (value) => /\d/.test(value) },
];

function PasswordChecklist({ password }) {
  return (
    <ul className="mt-2 space-y-1 text-xs font-semibold">
      {passwordRules.map((rule) => {
        const passed = rule.test(password);
        return <li key={rule.label} className={passed ? 'text-emerald-600' : 'text-slate-400'}>{passed ? '✓' : '•'} {rule.label}</li>;
      })}
    </ul>
  );
}



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
      await acceptInvite({ token, password, confirmPassword: password });
      setMessage('Akun aktif. Silakan login dengan password baru.');
      setPassword('');
    } catch (err) {
      setError(err?.message || 'Aktivasi akun gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans sm:p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-black text-slate-900">Aktivasi Akun</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Buat password untuk mengaktifkan akun Anda. Setelah aktif, login memakai email undangan.</p>
        {error && <AlertMessage type="error" title="Aktivasi gagal">{error}</AlertMessage>}
        {message && <AlertMessage type="success" title="Akun aktif">{message}</AlertMessage>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <FormField id="invite-token" label="Invite token">
            <input id="invite-token" value={token} onChange={(event) => setToken(event.target.value)} required className={inputClass} placeholder="invite_token" />
          </FormField>
          <FormField id="invite-password" label="Password baru" helper="Minimal 8 karakter, mengandung huruf dan angka.">
            <input id="invite-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className={inputClass} placeholder="Password baru" />
            <PasswordChecklist password={password} />
          </FormField>
          <ActionButton type="submit" icon={CheckCircle2} disabled={isLoading} className="w-full">
            {isLoading ? 'Memproses...' : 'Aktifkan Akun'}
          </ActionButton>
        </form>
        <Link to="/login" className="mt-4 block text-center text-sm font-bold text-blue-700 hover:text-blue-800">Kembali ke login</Link>
      </div>
    </div>
  );
}
