import { useMemo, useState } from 'react';
import { MailPlus, ShieldCheck, Users } from 'lucide-react';
import { inviteUser } from '../services/apiClient';
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

function statusTone(status) {
  if (status === 'ACTIVE') return 'emerald';
  if (status === 'INVITED') return 'amber';
  if (status === 'DISABLED' || status === 'SUSPENDED') return 'rose';
  return 'slate';
}

export default function UserManagement() {
  const { data, users } = useAppData();
  const roles = useMemo(() => data.roles.filter((role) => role.id !== 'super-admin'), [data.roles]);
  const defaultRole = roles[0]?.id || 'foreman';
  const [form, setForm] = useState({ name: '', email: '', roleId: defaultRole, site: '' });
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
      setInviteToken(res.data.delivery?.inviteToken || res.data.delivery?.inviteUrl || 'Invite created.');
      setForm({ name: '', email: '', roleId: defaultRole, site: '' });
    } catch (err) {
      setError(err?.message || 'Undangan gagal dibuat.');
    } finally {
      setIsLoading(false);
    }
  };

  const userRows = users.map((user) => (
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
    </tr>
  ));

  const mobileCards = users.map((user) => (
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
            <StatusBadge tone="blue">{users.length} users</StatusBadge>
            <StatusBadge tone="emerald">Invite-only</StatusBadge>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <FormSection
          title="Invite User"
          description="Create an internal account invite. Raw token appears only in local development fallback."
        >
          {error && <AlertMessage type="error" title="Invite failed">{error}</AlertMessage>}
          {inviteToken && (
            <AlertMessage type="success" title="Invite created">
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
            <ActionButton type="submit" icon={MailPlus} disabled={isLoading} className="w-full">
              {isLoading ? 'Membuat undangan...' : 'Kirim Undangan'}
            </ActionButton>
          </form>
        </FormSection>

        <Surface padding="p-0" className="overflow-hidden">
          <div className="p-5">
            <SectionHeading
              icon={Users}
              title="User Status"
              description="Mobile view uses cards so role, site, and status stay readable without horizontal scrolling."
              action={<StatusBadge tone="slate"><ShieldCheck size={13} className="mr-1" />RBAC protected</StatusBadge>}
            />
          </div>
          {users.length ? (
            <div className="p-4 pt-0 md:p-0">
              <ResponsiveTable
                headers={['User', 'Role', 'Site', 'Status']}
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
