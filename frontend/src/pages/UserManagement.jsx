import { useMemo, useState } from 'react';
import { changeUserRole, changeUserStatus, inviteUser, resendInvite } from '../services/apiClient';
import { useAppData } from '../context/AppDataCore';
import { StatusBadge } from '../components/ui';

const statusOptions = ['ACTIVE', 'SUSPENDED', 'DISABLED'];

export default function AccountLifecycle() {
  const { activeUser, data, fetchData, users } = useAppData();
  const roles = useMemo(() => data.roles, [data.roles]);
  const inviteRoles = useMemo(() => roles.filter((role) => role.id !== 'super-admin'), [roles]);
  const [form, setForm] = useState({ name: '', email: '', roleId: inviteRoles[0]?.id || 'foreman', site: '' });
  const [inviteToken, setInviteToken] = useState('');
  const [actionToken, setActionToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState('');

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const canEditUser = (user) => !(user.id === activeUser?.id && user.roleId === 'super-admin');

  const resetFeedback = () => {
    setError('');
    setMessage('');
    setActionToken('');
  };

  const submit = async (event) => {
    event.preventDefault();
    resetFeedback();
    setInviteToken('');
    setIsLoading(true);
    try {
      const res = await inviteUser(form);
      setInviteToken(res.data.delivery?.inviteToken || '');
      setForm({ name: '', email: '', roleId: inviteRoles[0]?.id || 'foreman', site: '' });
      await fetchData();
      setMessage('Undangan user berhasil dibuat.');
    } catch (err) {
      setError(err?.message || 'Undangan gagal dibuat.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendInvite = async (user) => {
    resetFeedback();
    setSavingUserId(user.id);
    try {
      const res = await resendInvite(user.id);
      setActionToken(res.data.delivery?.inviteToken || '');
      await fetchData();
      setMessage(`Undangan untuk ${user.email} berhasil dikirim ulang.`);
    } catch (err) {
      setError(err?.message || 'Undangan belum dapat dikirim ulang.');
    } finally {
      setSavingUserId('');
    }
  };

  const handleRoleChange = async (user, roleId) => {
    if (roleId === user.roleId) return;
    resetFeedback();
    setSavingUserId(user.id);
    try {
      await changeUserRole(user.id, roleId);
      await fetchData();
      setMessage(`Role ${user.email} berhasil diperbarui.`);
    } catch (err) {
      setError(err?.message || 'Role user belum dapat diperbarui.');
    } finally {
      setSavingUserId('');
    }
  };

  const handleStatusChange = async (user, status) => {
    if (status === user.accountStatus) return;
    resetFeedback();
    setSavingUserId(user.id);
    try {
      await changeUserStatus(user.id, status);
      await fetchData();
      setMessage(`Status ${user.email} berhasil diperbarui.`);
    } catch (err) {
      setError(err?.message || 'Status user belum dapat diperbarui.');
    } finally {
      setSavingUserId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">Account Lifecycle</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Akun baru hanya dibuat melalui undangan Super Admin. Token disimpan hash-only di server.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Invite User</h2>
          {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
          {inviteToken && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-bold text-emerald-800">Demo invite token</p>
              <p className="mt-1 break-all text-xs font-semibold text-emerald-700">{inviteToken}</p>
              <p className="mt-2 text-xs text-emerald-700">Production nanti kirim via email, bukan tampil permanen.</p>
            </div>
          )}
          {actionToken && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-bold text-blue-800">Demo resend token</p>
              <p className="mt-1 break-all text-xs font-semibold text-blue-700">{actionToken}</p>
            </div>
          )}
          <input value={form.name} onChange={(event) => update('name', event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="Nama lengkap" />
          <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="email@perusahaan.com" />
          <select value={form.roleId} onChange={(event) => update('roleId', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold">
            {inviteRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <input value={form.site} onChange={(event) => update('site', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold" placeholder="Site / lokasi" />
          <button disabled={isLoading} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-60">
            {isLoading ? 'Membuat...' : 'Kirim Undangan'}
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">User Status</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[860px] divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3"><span className="font-bold text-slate-900">{user.name}</span><span className="block text-xs text-slate-500">{user.email}</span></td>
                    <td className="px-3 py-3 text-slate-600">
                      <select
                        value={user.roleId}
                        disabled={savingUserId === user.id || !canEditUser(user)}
                        onChange={(event) => handleRoleChange(user, event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <StatusBadge tone={user.accountStatus === 'ACTIVE' ? 'emerald' : user.accountStatus === 'DISABLED' ? 'rose' : 'amber'}>{user.accountStatus || 'ACTIVE'}</StatusBadge>
                        <select
                          value={user.accountStatus || 'ACTIVE'}
                          disabled={savingUserId === user.id || user.accountStatus === 'INVITED' || !canEditUser(user)}
                          onChange={(event) => handleStatusChange(user, event.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => handleResendInvite(user)}
                        disabled={savingUserId === user.id || user.accountStatus !== 'INVITED'}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {savingUserId === user.id ? 'Saving...' : 'Resend Invite'}
                      </button>
                    </td>
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
