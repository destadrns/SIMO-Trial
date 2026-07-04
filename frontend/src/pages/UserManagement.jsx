import { useMemo, useState } from 'react';
import { KeyRound, MailPlus, RefreshCw, ShieldCheck, UserCog, Users } from 'lucide-react';
import { changeOwnPassword, changeUserRole, changeUserStatus, getAdminUsers, inviteUser, resendUserInvite, sendUserPasswordReset } from '../services/apiClient';
import { useAppData } from '../context/AppDataCore';
import {
  ActionButton,
  AlertMessage,
  EmptyState,
  FormField,
  FormSection,
  MobileDataCard,
  PageHeader,
  ResponsiveTable,
  SectionHeading,
  StatusBadge,
  Surface,
} from '../components/ui';

const fieldClass = 'w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const compactFieldClass = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400';
const statusOptions = ['ACTIVE', 'SUSPENDED', 'DISABLED'];
const passwordRules = [
  { label: 'Minimal 8 karakter', test: (value) => value.length >= 8 },
  { label: 'Huruf besar', test: (value) => /[A-Z]/.test(value) },
  { label: 'Huruf kecil', test: (value) => /[a-z]/.test(value) },
  { label: 'Angka', test: (value) => /\d/.test(value) },
  { label: 'Karakter khusus', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

function PasswordChecklist({ password }) {
  return (
    <ul className="mt-2 grid gap-1 text-xs font-semibold sm:grid-cols-2">
      {passwordRules.map((rule) => {
        const passed = rule.test(password);
        return <li key={rule.label} className={passed ? 'text-emerald-600' : 'text-slate-400'}>{passed ? 'OK' : '-'} {rule.label}</li>;
      })}
    </ul>
  );
}

function statusTone(status) {
  if (status === 'ACTIVE') return 'emerald';
  if (status === 'INVITED') return 'amber';
  if (status === 'DISABLED' || status === 'SUSPENDED') return 'rose';
  return 'slate';
}

function shortDate(value) {
  return value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}

function activityTime(user) {
  return new Date(user.lastActivityAt || user.passwordChangedAt || user.invitedAt || user.activatedAt || user.disabledAt || user.createdAt || 0).getTime();
}

export default function UserManagement() {
  const { activeUser, data, users } = useAppData();
  const roles = useMemo(() => data.roles.filter((role) => role.id !== 'super-admin'), [data.roles]);
  const defaultRole = roles[0]?.id || 'foreman';
  const canManage = activeUser?.roleId === 'super-admin';
  const [managedUsers, setManagedUsers] = useState(users);
  const [form, setForm] = useState({ name: '', email: '', roleId: defaultRole, site: '' });
  const [inviteToken, setInviteToken] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);


  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updatePasswordForm = (field, value) => setPasswordForm((current) => ({ ...current, [field]: value }));

  const showDelivery = (delivery, fallbackEmail) => {
    const recipient = delivery?.to || fallbackEmail;
    setDeliveryEmail(recipient || '');
    setInviteToken(delivery?.inviteUrl || delivery?.inviteToken || '');
    setNotice(delivery?.delivered
      ? `Undangan dikirim ke ${recipient}.`
      : `SMTP belum aktif. Undangan untuk ${recipient} belum dapat dikirim melalui email.`);
  };

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const source = query
      ? managedUsers.filter((user) => [user.name, user.email, user.roleName, user.accountStatus || 'ACTIVE', user.site].some((value) => String(value || '').toLowerCase().includes(query)))
      : managedUsers;
    return [...source].sort((first, second) => activityTime(second) - activityTime(first) || String(first.name).localeCompare(String(second.name)));
  }, [managedUsers, searchTerm]);

  const refreshUsers = async () => {
    const res = await getAdminUsers();
    setManagedUsers(res.data);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setInviteToken('');
    setDeliveryEmail('');
    setIsLoading(true);
    try {
      const res = await inviteUser(form);
      showDelivery(res.data.delivery, form.email);
      setManagedUsers((current) => [res.data.user, ...current.filter((user) => user.id !== res.data.user.id)]);
      setForm({ name: '', email: '', roleId: defaultRole, site: '' });
    } catch (err) {
      setError(err?.message || 'Undangan gagal dibuat.');
    } finally {
      setIsLoading(false);
    }
  };

  const runAction = async (userId, action) => {
    setError('');
    setNotice('');
    setInviteToken('');
    setDeliveryEmail('');
    setActionId(userId);
    try {
      await action();
      await refreshUsers();
    } catch (err) {
      setError(err?.message || 'Aksi user gagal diproses.');
    } finally {
      setActionId('');
    }
  };

  const resendInvite = (user) => runAction(user.id, async () => {
    const res = await resendUserInvite(user.id);
    showDelivery(res.data.delivery, user.email);
  });

  const resetUserPassword = (user) => {
    if (!window.confirm(`Kirim instruksi reset password ke email user ini?\n\n${user.email}`)) return;
    runAction(user.id, async () => {
      const res = await sendUserPasswordReset(user.id);
      setDeliveryEmail(res.data.delivery?.to || user.email);
      setInviteToken(res.data.delivery?.resetUrl || '');
      setNotice(res.data.message || `Instruksi reset password sudah dikirim ke ${user.email}.`);
    });
  };

  const updateRole = (user, roleId) => runAction(user.id, async () => {
    await changeUserRole(user.id, roleId);
    setNotice(`Role ${user.email} diperbarui.`);
  });

  const updateStatus = (user, status) => runAction(user.id, async () => {
    await changeUserStatus(user.id, status);
    setNotice(`Status ${user.email} menjadi ${status}.`);
  });

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Konfirmasi password baru tidak sama.');
      return;
    }
    if (!passwordRules.every((rule) => rule.test(passwordForm.newPassword))) {
      setPasswordError('Password baru belum memenuhi semua syarat keamanan.');
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await changeOwnPassword(passwordForm);
      setPasswordNotice(res.data.message || 'Password berhasil diubah. Silakan login ulang.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err?.message || 'Password gagal diubah.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const renderActions = (user) => {
    if (!canManage) return <span className="text-xs font-semibold text-slate-400">Read only</span>;
    const busy = actionId === user.id;

    return (
      <div className="flex min-w-[360px] flex-wrap items-center gap-2 xl:flex-nowrap">
        <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-2">
          <select
            aria-label={`Change role for ${user.email}`}
            value={user.roleId}
            disabled={busy}
            onChange={(event) => updateRole(user, event.target.value)}
            className={compactFieldClass}
          >
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <select
            aria-label={`Change status for ${user.email}`}
            value={user.accountStatus || 'ACTIVE'}
            disabled={busy}
            onChange={(event) => updateStatus(user, event.target.value)}
            className={compactFieldClass}
          >
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        {user.accountStatus === 'INVITED' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => resendInvite(user)}
            className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <RefreshCw size={14} />
            Resend Invite
          </button>
        )}
        {user.accountStatus === 'ACTIVE' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => resetUserPassword(user)}
            className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            <KeyRound size={14} />
            Reset Password
          </button>
        )}
      </div>
    );
  };

  const userRows = filteredUsers.map((user) => (
    <tr key={user.id} className="align-middle transition-colors hover:bg-slate-50/70">
      <td className="min-w-[240px] px-5 py-4">
        <span className="block truncate font-bold text-slate-900" title={user.name}>{user.name}</span>
        <span className="block truncate text-xs font-semibold text-slate-500" title={user.email}>{user.email}</span>
        <span className="mt-1 block text-[11px] font-semibold text-blue-500">Last activity: {shortDate(user.lastActivityAt)}</span>
        <span className="mt-1 block text-[11px] font-semibold text-slate-400">Password changed: {shortDate(user.passwordChangedAt)}</span>
      </td>
      <td className="min-w-[150px] px-5 py-4 text-sm font-semibold text-slate-600">{user.roleName}</td>
      <td className="min-w-[120px] px-5 py-4 text-sm text-slate-500">{user.site || '-'}</td>
      <td className="min-w-[120px] px-5 py-4">
        <StatusBadge tone={statusTone(user.accountStatus || 'ACTIVE')}>{user.accountStatus || 'ACTIVE'}</StatusBadge>
      </td>
      <td className="min-w-[430px] px-5 py-4">{renderActions(user)}</td>
    </tr>
  ));

  const mobileCards = filteredUsers.map((user) => (
    <MobileDataCard
      key={user.id}
      title={user.name}
      subtitle={user.email}
      meta={<StatusBadge tone={statusTone(user.accountStatus || 'ACTIVE')}>{user.accountStatus || 'ACTIVE'}</StatusBadge>}
    >
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Role</span>
          <span className="mt-1 block font-semibold text-slate-700">{user.roleName}</span>
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Site</span>
          <span className="mt-1 block font-semibold text-slate-700">{user.site || '-'}</span>
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Password changed</span>
          <span className="mt-1 block font-semibold text-slate-700">{shortDate(user.passwordChangedAt)}</span>
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Last activity</span>
          <span className="mt-1 block font-semibold text-slate-700">{shortDate(user.lastActivityAt)}</span>
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Invited</span>
          <span className="mt-1 block font-semibold text-slate-700">{shortDate(user.invitedAt)}</span>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4 [&_div]:min-w-0 [&_div]:w-full">{renderActions(user)}</div>
    </MobileDataCard>
  ));

  return (
    <div className="w-full space-y-6">
      <PageHeader
        eyebrow="Account Management"
        title="Account Lifecycle"
        description="Kelola akun sendiri, invite user perusahaan, status akses, dan role dari satu halaman."
        meta={
          <>
            <StatusBadge tone="blue">{filteredUsers.length}/{managedUsers.length} users</StatusBadge>
            <StatusBadge tone="emerald">Invite-only</StatusBadge>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <FormSection
          title="Invite Company User"
          description="User akan menerima email undangan untuk membuat password."
        >
          {error && <AlertMessage type="error" title="Action failed">{error}</AlertMessage>}
          {notice && <AlertMessage type="success" title="Action completed">{notice}</AlertMessage>}
          {inviteToken && (
            <AlertMessage type="info" title="Development-only preview">
              <span className="block text-xs font-semibold">Email tujuan: {deliveryEmail || '-'}</span>
              <span className="block break-all text-xs font-semibold">{inviteToken}</span>
              <span className="mt-1 block text-xs">Preview hanya muncul jika `ENABLE_DEV_TOKEN_PREVIEW=true` dan bukan production.</span>
            </AlertMessage>
          )}

          <form onSubmit={submit} className="space-y-4">
            <FormField id="invite-name" label="Full name">
              <input id="invite-name" value={form.name} onChange={(event) => update('name', event.target.value)} required className={fieldClass} placeholder="Nama lengkap" />
            </FormField>
            <FormField id="invite-email" label="Email">
              <input id="invite-email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required className={fieldClass} placeholder="email@perusahaan.com" />
            </FormField>
            <FormField id="invite-role" label="Role">
              <select id="invite-role" value={form.roleId} onChange={(event) => update('roleId', event.target.value)} className={fieldClass}>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </FormField>
            <FormField id="invite-site" label="Site / division" helper="Optional, used for operational context.">
              <input id="invite-site" value={form.site} onChange={(event) => update('site', event.target.value)} className={fieldClass} placeholder="Site / lokasi" />
            </FormField>
            <ActionButton type="submit" icon={MailPlus} disabled={isLoading || !canManage} className="w-full">
              {isLoading ? 'Membuat undangan...' : 'Kirim Undangan'}
            </ActionButton>
          </form>
        </FormSection>

        {canManage && (
          <FormSection title="My Account" description="Change my password. Sesi lama dicabut setelah berhasil.">
            {passwordError && <AlertMessage type="error" title="Password gagal diubah">{passwordError}</AlertMessage>}
            {passwordNotice && <AlertMessage type="success" title="Password diperbarui">{passwordNotice}</AlertMessage>}
            <form onSubmit={submitPasswordChange} className="space-y-4">
              <FormField id="current-password" label="Current Password">
                <input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => updatePasswordForm('currentPassword', event.target.value)} required className={fieldClass} placeholder="Password saat ini" autoComplete="current-password" />
              </FormField>
              <FormField id="new-super-password" label="New Password">
                <input id="new-super-password" type="password" value={passwordForm.newPassword} onChange={(event) => updatePasswordForm('newPassword', event.target.value)} required className={fieldClass} placeholder="Password baru" autoComplete="new-password" />
                <PasswordChecklist password={passwordForm.newPassword} />
              </FormField>
              <FormField id="confirm-super-password" label="Confirm New Password">
                <input id="confirm-super-password" type="password" value={passwordForm.confirmPassword} onChange={(event) => updatePasswordForm('confirmPassword', event.target.value)} required className={fieldClass} placeholder="Ulangi password baru" autoComplete="new-password" />
              </FormField>
              <ActionButton type="submit" icon={KeyRound} disabled={isChangingPassword} className="w-full">
                {isChangingPassword ? 'Menyimpan password...' : 'Update Password'}
              </ActionButton>
            </form>
          </FormSection>
        )}

      </div>

      <Surface padding="p-0" className="w-full overflow-hidden">
          <div className="p-5">
            <SectionHeading
              icon={Users}
              title="User Status"
              description="Lihat email user, role, status invite/login, dan aksi akses perusahaan."
              action={<StatusBadge tone="slate"><ShieldCheck size={13} className="mr-1" />RBAC protected</StatusBadge>}
            />
            <div className="mt-4">
              <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className={fieldClass} placeholder="Search name, email, role, status, or site..." aria-label="Search users" />
            </div>
          </div>
          {filteredUsers.length ? (
            <div className="overflow-x-auto p-4 pt-0 md:p-0">
              <ResponsiveTable
                headers={['User', 'Role', 'Site', 'Status', <span key="actions" className="inline-flex items-center gap-1"><UserCog size={14} />Actions</span>]}
                mobileCards={mobileCards}
              >
                <tbody className="divide-y divide-slate-100">{userRows}</tbody>
              </ResponsiveTable>
            </div>
          ) : (
            <div className="p-5 pt-0">
              <EmptyState icon={Users} title="No users found." description={searchTerm ? "No users match your search." : "Invited and active users will appear here."} />
            </div>
          )}
        </Surface>
    </div>
  );
}
