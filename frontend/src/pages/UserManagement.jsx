import { useMemo, useState } from 'react';
import { MailPlus, RefreshCw, ShieldCheck, UserCog, Users } from 'lucide-react';
import { changeUserRole, changeUserStatus, getAdminUsers, inviteUser, resendUserInvite } from '../services/apiClient';
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
const compactFieldClass = 'w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const statusOptions = ['ACTIVE', 'SUSPENDED', 'DISABLED'];

function statusTone(status) {
  if (status === 'ACTIVE') return 'emerald';
  if (status === 'INVITED') return 'amber';
  if (status === 'DISABLED' || status === 'SUSPENDED') return 'rose';
  return 'slate';
}

export default function UserManagement() {
  const { activeUser, data, users } = useAppData();
  const roles = useMemo(() => data.roles.filter((role) => role.id !== 'super-admin'), [data.roles]);
  const defaultRole = roles[0]?.id || 'foreman';
  const canManage = activeUser?.roleId === 'super-admin';
  const [managedUsers, setManagedUsers] = useState(users);
  const [form, setForm] = useState({ name: '', email: '', roleId: defaultRole, site: '' });
  const [inviteToken, setInviteToken] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionId, setActionId] = useState('');


  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const refreshUsers = async () => {
    const res = await getAdminUsers();
    setManagedUsers(res.data);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setInviteToken('');
    setIsLoading(true);
    try {
      const res = await inviteUser(form);
      setInviteToken(res.data.delivery?.inviteToken || res.data.delivery?.inviteUrl || 'Invite created.');
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
    setInviteToken(res.data.delivery?.inviteToken || res.data.delivery?.inviteUrl || 'Invite resent.');
    setNotice(`Invite dikirim ulang untuk ${user.email}.`);
  });

  const updateRole = (user, roleId) => runAction(user.id, async () => {
    await changeUserRole(user.id, roleId);
    setNotice(`Role ${user.email} diperbarui.`);
  });

  const updateStatus = (user, status) => runAction(user.id, async () => {
    await changeUserStatus(user.id, status);
    setNotice(`Status ${user.email} menjadi ${status}.`);
  });

  const renderActions = (user) => {
    if (!canManage) return <span className="text-xs font-semibold text-slate-400">Read only</span>;
    const busy = actionId === user.id;

    return (
      <div className="grid min-w-56 gap-2">
        <div className="grid grid-cols-2 gap-2">
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
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <RefreshCw size={14} />
            Resend Invite
          </button>
        )}
      </div>
    );
  };

  const userRows = managedUsers.map((user) => (
    <tr key={user.id} className="transition-colors hover:bg-slate-50/70">
      <td className="px-5 py-4">
        <span className="block font-bold text-slate-900">{user.name}</span>
        <span className="block text-xs text-slate-500">{user.email}</span>
      </td>
      <td className="px-5 py-4 text-sm font-semibold text-slate-600">{user.roleName}</td>
      <td className="px-5 py-4 text-sm text-slate-500">{user.site || '-'}</td>
      <td className="px-5 py-4">
        <StatusBadge tone={statusTone(user.accountStatus || 'ACTIVE')}>{user.accountStatus || 'ACTIVE'}</StatusBadge>
      </td>
      <td className="px-5 py-4">{renderActions(user)}</td>
    </tr>
  ));

  const mobileCards = managedUsers.map((user) => (
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
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">{renderActions(user)}</div>
    </MobileDataCard>
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Super Admin"
        title="Account Lifecycle"
        description="Invite-only user creation with hash-only tokens, clear account status, and audit-ready lifecycle actions."
        meta={
          <>
            <StatusBadge tone="blue">{managedUsers.length} users</StatusBadge>
            <StatusBadge tone="emerald">Invite-only</StatusBadge>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <FormSection
          title="Invite User"
          description="Create an internal account invite. Raw token appears only in local development fallback."
        >
          {error && <AlertMessage type="error" title="Action failed">{error}</AlertMessage>}
          {notice && <AlertMessage type="success" title="Action completed">{notice}</AlertMessage>}
          {inviteToken && (
            <AlertMessage type="success" title="Invite token">
              <span className="block break-all text-xs font-semibold">{inviteToken}</span>
              <span className="mt-1 block text-xs">Production should deliver this by email, not by screen copy.</span>
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

        <Surface padding="p-0" className="overflow-hidden">
          <div className="p-5">
            <SectionHeading
              icon={Users}
              title="User Status"
              description="Super Admin can resend invites, adjust roles, and suspend or reactivate users from this panel."
              action={<StatusBadge tone="slate"><ShieldCheck size={13} className="mr-1" />RBAC protected</StatusBadge>}
            />
          </div>
          {managedUsers.length ? (
            <div className="p-4 pt-0 md:p-0">
              <ResponsiveTable
                headers={['User', 'Role', 'Site', 'Status', <span key="actions" className="inline-flex items-center gap-1"><UserCog size={14} />Actions</span>]}
                mobileCards={mobileCards}
              >
                <tbody className="divide-y divide-slate-100">{userRows}</tbody>
              </ResponsiveTable>
            </div>
          ) : (
            <div className="p-5 pt-0">
              <EmptyState icon={Users} title="No users found." description="Invited and active users will appear here." />
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
