import { useMemo, useState } from 'react';
import { inviteUser } from '../services/apiClient';
import { useAppData } from '../context/AppDataCore';
import { StatusBadge } from '../components/ui';

export default function AccountLifecycle() {
  const { data, users } = useAppData();
  const roles = useMemo(() => data.roles.filter((role) => role.id !== 'super-admin'), [data.roles]);
  const [form, setForm] = useState({ name: '', email: '', roleId: roles[0]?.id || 'foreman', site: '' });
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setInviteToken('');
    setIsLoading(true);
    try {
      const res = await inviteUser(form);
      setInviteToken(res.data.delivery.inviteToken);
      setForm({ name: '', email: '', roleId: roles[0]?.id || 'foreman', site: '' });
    } catch (err) {
      setError(err?.message || 'Undangan gagal dibuat.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Account Lifecycle</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Akun baru hanya dibuat melalui undangan Super Admin. Token disimpan hash-only di server.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Invite User</h2>
          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
          {inviteToken && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-bold text-emerald-800">Demo invite token</p>
              <p className="mt-1 break-all text-xs font-semibold text-emerald-700">{inviteToken}</p>
              <p className="mt-2 text-xs text-emerald-700">Production nanti kirim via email, bukan tampil permanen.</p>
            </div>
          )}
          <input value={form.name} onChange={(event) => update('name', event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="Nama lengkap" />
          <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="email@perusahaan.com" />
          <select value={form.roleId} onChange={(event) => update('roleId', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold">
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <input value={form.site} onChange={(event) => update('site', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="Site / lokasi" />
          <button disabled={isLoading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-60">
            {isLoading ? 'Membuat...' : 'Kirim Undangan'}
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">User Status</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3"><span className="font-bold text-slate-900">{user.name}</span><span className="block text-xs text-slate-500">{user.email}</span></td>
                    <td className="px-3 py-3 text-slate-600">{user.roleName}</td>
                    <td className="px-3 py-3"><StatusBadge tone={user.accountStatus === 'ACTIVE' ? 'green' : 'amber'}>{user.accountStatus || 'ACTIVE'}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
