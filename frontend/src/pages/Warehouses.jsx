import { useMemo, useState } from 'react';
import { ClipboardList, Factory, Package, ShieldAlert } from 'lucide-react';
import { useAppData } from '../context/AppDataCore';
import { WORK_STATUS_OPTIONS } from '../data/seedData';
import { AlertMessage, EmptyState, MetricCard, MobileDataCard, PageHeader, ResponsiveTable, SectionHeading, StatusBadge, Surface } from '../components/ui';

const statusStyles = {
  'To-Do': 'border-slate-200 bg-slate-100 text-slate-700',
  'In-Progress': 'border-blue-200 bg-blue-50 text-blue-700',
  Done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const readyStyles = {
  true: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  false: 'border-rose-200 bg-rose-50 text-rose-700',
};

const qcStatusStyles = {
  Pending: 'border-amber-200 bg-amber-50 text-amber-700',
  'Passed QC': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Rework: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default function Warehouses() {
  const {
    data,
    permissions,
    metrics,
    projectsById,
    warehousesById,
    updateWorkItemStatus,
  } = useAppData();
  const [projectFilter, setProjectFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [savingItemId, setSavingItemId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const workItems = useMemo(
    () =>
      data.workItems
        .map((item) => ({
          ...item,
          project: projectsById.get(item.projectId),
          warehouse: warehousesById.get(item.warehouseId),
        }))
        .filter((item) => projectFilter === 'all' || item.projectId === projectFilter)
        .filter((item) => {
          const query = searchTerm.trim().toLowerCase();
          if (!query) return true;
          return [item.materialName, item.taskName, item.status, item.qcStatus, item.project?.code, item.project?.name, item.warehouse?.code, item.warehouse?.name].some((value) => String(value || '').toLowerCase().includes(query));
        }),
    [data.workItems, projectFilter, projectsById, searchTerm, warehousesById],
  );

  const blockedItems = data.workItems.filter((item) => item.status === 'Done' && !item.readyToShip);

  const handleStatusChange = async (item, nextStatus) => {
    if (item.status === nextStatus) {
      return;
    }

    setSavingItemId(item.id);
    setMessage('');
    setError('');

    try {
      await updateWorkItemStatus(item.id, nextStatus);
      setMessage(`${item.materialName} updated from ${item.status} to ${nextStatus}.`);
    } catch (err) {
      setError(err?.message || 'Status work item belum dapat diperbarui. Silakan coba lagi.');
    } finally {
      setSavingItemId('');
    }
  };


  const renderStatusSelect = (item, compact = false) => (
    <div>
      <select
        aria-label={`Status for ${item.materialName}`}
        value={item.status}
        disabled={!permissions.canUpdateProduction || savingItemId === item.id}
        onChange={(event) => handleStatusChange(item, event.target.value)}
        className={`${compact ? 'w-full' : 'w-[150px]'} rounded-lg border px-3 py-2 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-70 ${statusStyles[item.status]}`}
      >
        {WORK_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      {savingItemId === item.id && <p className="mt-1 text-xs font-semibold text-blue-600">Saving...</p>}
    </div>
  );

  const renderQcBadge = (item) => (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-bold ${qcStatusStyles[item.qcStatus]}`}>
      {item.qcStatus}
    </span>
  );

  const renderReadyBadge = (item) => (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-bold ${readyStyles[item.readyToShip]}`}>
      {item.readyToShip ? 'Ready' : 'Not Ready'}
    </span>
  );

  const tableRows = workItems.map((item) => (
    <tr key={item.id} className="transition-colors hover:bg-blue-50/40">
      <td className="px-5 py-4">
        <p className="font-semibold text-slate-800">{item.project?.code}</p>
        <p className="text-sm text-slate-500">{item.project?.name}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold text-slate-800">{item.warehouse?.code}</p>
        <p className="text-sm text-slate-500">{item.warehouse?.name}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold text-slate-800">{item.materialName}</p>
        <p className="text-sm text-slate-500">{item.taskName}</p>
      </td>
      <td className="px-5 py-4 text-sm font-semibold text-slate-700">{item.quantity} {item.unit}</td>
      <td className="px-5 py-4">{renderStatusSelect(item)}</td>
      <td className="px-5 py-4">{renderQcBadge(item)}</td>
      <td className="px-5 py-4">{renderReadyBadge(item)}</td>
    </tr>
  ));

  const mobileCards = workItems.map((item) => (
    <MobileDataCard
      key={item.id}
      title={item.materialName}
      subtitle={`${item.project?.code || '-'} - ${item.warehouse?.code || '-'}`}
      meta={renderReadyBadge(item)}
    >
      <p className="text-xs leading-5 text-slate-500">{item.taskName}</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">Qty</span>
          <span className="mt-1 block font-semibold text-slate-700">{item.quantity} {item.unit}</span>
        </div>
        <div>
          <span className="block font-bold uppercase tracking-wide text-slate-400">QC</span>
          <span className="mt-1 block">{renderQcBadge(item)}</span>
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Production Status</span>
        {renderStatusSelect(item, true)}
      </div>
    </MobileDataCard>
  ));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Warehouse execution"
        title="Production Work Items"
        description="Update status pekerjaan produksi per warehouse dan pantau material yang masih tertahan QC."
        meta={
          <StatusBadge tone={permissions.canUpdateProduction ? 'emerald' : 'slate'}>
            {permissions.canUpdateProduction ? 'Status updates enabled' : 'Monitoring view'}
          </StatusBadge>
        }
      />

      {message && <AlertMessage type="success" title="Status updated">{message}</AlertMessage>}
      {error && <AlertMessage type="error" title="Update failed">{error}</AlertMessage>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Factory}
          label="Warehouses"
          value={metrics.totalWarehouses}
          caption="Production areas"
          tone="blue"
        />
        <MetricCard
          icon={ClipboardList}
          label="Work Items"
          value={metrics.totalWorkItems}
          caption="Tracked tasks"
          tone="indigo"
        />
        <MetricCard
          icon={Package}
          label="Completed"
          value={metrics.completedWorkItems}
          caption="Production done"
          tone="emerald"
        />
        <MetricCard
          icon={ShieldAlert}
          label="Blocked By QC"
          value={blockedItems.length}
          caption="Done but not ready"
          tone="rose"
        />
      </div>

      <Surface padding="p-0">
        <div className="p-5">
          <SectionHeading
            icon={ClipboardList}
            title="Work Status Board"
            description="Every status change is recorded in Audit Logs."
            action={
              <select
                aria-label="Filter project"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 md:w-[260px]"
              >
                <option value="all">All projects</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </option>
                ))}
              </select>
            }
          />
          <div className="mt-4">
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search material, task, project, warehouse, status..." aria-label="Search work items" />
          </div>
        </div>

        {workItems.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={ClipboardList}
              title="No work items found."
              description="Try another project filter or seed production data before the demo."
            />
          </div>
        ) : (
          <div className="p-4 pt-0 md:p-0">
            <ResponsiveTable
              headers={['Project', 'Warehouse', 'Material', 'Qty', 'Status', 'QC', 'Shipping']}
              mobileCards={mobileCards}
            >
              <tbody className="divide-y divide-slate-100">{tableRows}</tbody>
            </ResponsiveTable>
          </div>
        )}
      </Surface>
    </div>
  );
}
