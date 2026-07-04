import { useMemo, useState } from 'react';
import { Activity, Download, FileText, ListFilter, Users } from 'lucide-react';
import { useAppData } from '../context/AppDataCore';
import { AlertMessage, EmptyState, MobileDataCard, PageHeader, ResponsiveTable, SectionHeading, StatusBadge, Surface } from '../components/ui';

const actionStyles = {
  UPDATE: 'bg-amber-100 text-amber-700 border-amber-200',
  INSERT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DELETE: 'bg-rose-100 text-rose-700 border-rose-200',
};

const Badge = ({ type }) => (
  <span className={`rounded-md border px-2.5 py-1 text-[10px] font-bold ${actionStyles[type] || actionStyles.UPDATE}`}>
    {type}
  </span>
);

const auditAreaLabels = {
  Production: 'Production',
  QualityControl: 'Quality Control',
  Logistics: 'Logistics',
  qc_checklists: 'Quality Control',
  work_items: 'Production',
  logistics_manifests: 'Logistics',
  delivery_checkins: 'Logistics',
  users: 'Users',
  roles: 'Roles',
  projects: 'Projects',
  warehouses: 'Warehouses',
};

function getAuditArea(log) {
  return auditAreaLabels[log.module] || auditAreaLabels[log.table] || log.module || log.table || '-';
}

const FilterSelect = ({ label, icon: Icon, value, onChange, children }) => (
  <div>
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</label>
    <div className="relative">
      <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-[180px] rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {children}
      </select>
    </div>
  </div>
);

function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export default function AuditLogs() {
  const { data } = useAppData();
  const [moduleFilter, setModuleFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [exportMessage, setExportMessage] = useState('');

  const roles = useMemo(() => [...new Set(data.auditLogs.map((log) => log.role))], [data.auditLogs]);
  const actions = useMemo(() => [...new Set(data.auditLogs.map((log) => log.action))], [data.auditLogs]);
  const modules = useMemo(() => [...new Set(data.auditLogs.map(getAuditArea))], [data.auditLogs]);

  const logs = useMemo(
    () =>
      data.auditLogs.filter(
        (log) =>
          (moduleFilter === 'all' || getAuditArea(log) === moduleFilter) &&
          (roleFilter === 'all' || log.role === roleFilter) &&
          (actionFilter === 'all' || log.action === actionFilter)
          && (() => {
            const query = searchTerm.trim().toLowerCase();
            if (!query) return true;
            return [log.user, log.role, log.action, log.entityType, log.entityId, log.description, log.createdAt, getAuditArea(log)].some((value) => String(value || '').toLowerCase().includes(query));
          })(),
      ),
    [actionFilter, data.auditLogs, moduleFilter, roleFilter, searchTerm],
  );

  const handleExport = () => {
    const header = [
      'timestamp',
      'user',
      'role',
      'action',
      'area',
      'record_id',
      'previous_value',
      'new_value',
      'description',
    ];
    const rows = logs.map((log) => [
      log.timestamp,
      log.user,
      log.role,
      log.action,
      getAuditArea(log),
      log.recordId,
      log.previousValue,
      log.newValue,
      log.description,
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'simo-audit-logs.csv';
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage(`Exported ${logs.length} audit records to CSV.`);
  };

  const rows = logs.map((log) => (
    <tr key={log.id} className="transition-colors hover:bg-slate-50/70">
      <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-700">{log.timestamp}</td>
      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">{log.user}</td>
      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">{log.role}</td>
      <td className="whitespace-nowrap px-5 py-4"><Badge type={log.action} /></td>
      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">{getAuditArea(log)}</td>
      <td className="px-5 py-4 text-sm text-slate-500">{log.previousValue || '-'}</td>
      <td className="px-5 py-4 text-sm font-semibold text-slate-700">{log.newValue || '-'}</td>
      <td className="px-5 py-4 text-sm text-slate-500">{log.description}</td>
    </tr>
  ));

  const mobileCards = logs.map((log) => (
    <MobileDataCard
      key={log.id}
      title={getAuditArea(log)}
      subtitle={`${log.user} � ${log.role} � ${log.timestamp}`}
      meta={<Badge type={log.action} />}
    >
      <p className="text-sm leading-5 text-slate-700">{log.description}</p>
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Before</span>
          <span className="mt-1 block break-words font-semibold text-slate-600">{log.previousValue || '-'}</span>
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">After</span>
          <span className="mt-1 block break-words font-semibold text-slate-700">{log.newValue || '-'}</span>
        </div>
      </div>
    </MobileDataCard>
  ));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Audit evidence"
        title="Audit Trail & Activity Log"
        description="Review production, QC, and logistics actions with actor, role, before/after values, and detail notes."
        meta={
          <>
            <StatusBadge tone="blue">{data.auditLogs.length} total logs</StatusBadge>
            <StatusBadge tone={logs.length ? 'emerald' : 'amber'}>{logs.length} visible</StatusBadge>
          </>
        }
        actions={
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <Download size={18} />
            Export CSV
          </button>
        }
      />

      {exportMessage && <AlertMessage type="success" title="CSV export ready">{exportMessage}</AlertMessage>}

      <div className="mb-3">
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search actor, action, entity, description, timestamp..."
          aria-label="Search audit logs"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <FilterSelect label="Module" icon={ListFilter} value={moduleFilter} onChange={setModuleFilter}>
          <option value="all">All modules</option>
          {modules.map((moduleName) => (
            <option key={moduleName} value={moduleName}>
              {moduleName}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="User Role" icon={Users} value={roleFilter} onChange={setRoleFilter}>
          <option value="all">All roles</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Action Type" icon={Activity} value={actionFilter} onChange={setActionFilter}>
          <option value="all">All actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </FilterSelect>
      </div>

      <Surface padding="p-0" className="overflow-hidden">
        <div className="p-5">
          <SectionHeading
            icon={FileText}
            title="Audit Records"
            description="Use the filters to support the final demo story across modules and roles."
          />
        </div>

        <div className="p-4 pt-0 md:p-0">
          {logs.length ? (
            <ResponsiveTable
              headers={['Timestamp', 'User', 'Role', 'Action', 'Area', 'Before', 'After', 'Details']}
              mobileCards={mobileCards}
            >
              <tbody className="divide-y divide-slate-100">{rows}</tbody>
            </ResponsiveTable>
          ) : (
            <EmptyState
              icon={FileText}
              title="No audit logs match the selected filters."
              description="Audit records appear after production, QC, logistics, or account lifecycle actions are performed."
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-4">
          <span className="text-sm font-medium text-slate-500">
            Showing {logs.length} of {data.auditLogs.length} entries
          </span>
        </div>
      </Surface>
    </div>
  );
}
