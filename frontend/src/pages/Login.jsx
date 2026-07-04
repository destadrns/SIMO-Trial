import { useState } from 'react';
import { useAppData } from '../context/AppDataCore';
import { LogIn, Mail, Lock, ShieldAlert, UserRoundCheck } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { role: 'Super Admin', email: 'super.admin@simo.test' },
  { role: 'Admin', email: 'dewi.lestari@simo.test' },
  { role: 'Owner', email: 'rina.wijaya@simo.test' },
  { role: 'Production Manager', email: 'budi.santoso@simo.test' },
  { role: 'Foreman', email: 'joko.anwar@simo.test' },
  { role: 'QC Inspector', email: 'siti.nurhaliza@simo.test' },
];

export default function Login() {
  const { login } = useAppData();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDemoHelper, setShowDemoHelper] = useState(false);
  const canShowDemoHelper = import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === 'true';

  const fillDemoAccount = (accountEmail) => {
    setEmail(accountEmail);
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err?.message || 'Login gagal. Silakan periksa kembali email dan password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans sm:p-6">
      <div className="grid w-full max-w-6xl items-stretch gap-6 md:grid-cols-12">
        <div className="hidden rounded-lg border border-white/10 bg-slate-900 p-8 text-white shadow-2xl shadow-black/30 md:col-span-5 md:flex md:flex-col md:justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-2xl font-black shadow-lg shadow-blue-500/20">
            S
          </div>

          <div className="mt-14 space-y-5">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-300">Operational control system</p>
            <h1 className="text-4xl font-black leading-tight tracking-normal">
              SIMO Mugi Jaya
            </h1>
            <p className="text-base leading-7 text-slate-300">
              Satu ruang kerja untuk monitoring produksi, inspeksi QC, manifest logistik, dan audit trail.
            </p>
          </div>

          <div className="mt-10 space-y-3 border-t border-white/10 pt-6">
            {['Monitoring produksi terpusat', 'QC gate sebelum pengiriman', 'Manifest logistik dan audit trail'].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-400"></span>
                <span className="text-sm font-medium leading-6 text-slate-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white p-6 shadow-2xl shadow-black/30 sm:p-8 md:col-span-7">
          <div className="mb-6 md:hidden">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-xl font-black text-white">
              S
            </div>
            <h1 className="text-3xl font-black text-slate-900">SIMO Mugi Jaya</h1>
            <p className="mt-1 text-sm text-slate-500">Operational Management Information System</p>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Masuk ke SIMO</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Gunakan email perusahaan dan password yang sudah dibuat dari invite atau reset password.
            </p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <ShieldAlert className="mt-0.5 flex-shrink-0 text-rose-600" size={18} />
              <div>
                <p className="font-bold">Login belum berhasil</p>
                <p className="mt-0.5 leading-5">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="email">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="nama@perusahaan.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>Memeriksa akun...</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Masuk Aplikasi</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <a href="/forgot-password" className="text-sm font-bold text-blue-700 hover:text-blue-800">
              Lupa password?
            </a>
          </div>

          {canShowDemoHelper && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => setShowDemoHelper((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <span className="flex items-center gap-2">
                  <UserRoundCheck className="text-blue-600" size={18} />
                  Development demo helper
                </span>
                <span className="text-xs font-semibold text-slate-500">{showDemoHelper ? 'Hide' : 'Show'}</span>
              </button>

              {showDemoHelper && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemoAccount(account.email)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <span className="block font-bold text-slate-900">{account.role}</span>
                      <span className="block truncate text-slate-500">{account.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
