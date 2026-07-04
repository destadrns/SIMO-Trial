import { useState } from 'react';
import { Activity, Building2, CheckCircle2, ClipboardList, PackageCheck, ShieldCheck } from 'lucide-react';
import { useAppData } from '../context/AppDataCore';
import { EmptyState, MetricCard, PageHeader, SectionHeading, StatusBadge, Surface } from '../components/ui';

const toneByPercentage = (percentage) => {
  if (percentage >= 80) {
    return {
      bar: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }

  if (percentage >= 50) {
    return {
      bar: 'bg-blue-600',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-600',
    };
  }

  return {
    bar: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  };
};

const ProgressBar = ({ percentage }) => {
  const tone = toneByPercentage(percentage);

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${percentage}%` }}></div>
    </div>
  );
};

const ProgressRow = ({ title, subtitle, total, completed, percentage, rightLabel }) => {
  const tone = toneByPercentage(percentage);

  return (
    <div className="border-b border-slate-100 py-4 last:border-b-0">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="truncate font-semibold text-slate-800">{title}</h4>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <span className={`rounded border px-2 py-1 text-xs font-bold ${tone.badge}`}>
          {percentage}%
        </span>
      </div>
      <ProgressBar percentage={percentage} />
      <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500">
        <span>
          {completed}/{total} done
        </span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data, isLoading, isOffline, metrics } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const query = searchTerm.trim().toLowerCase();
  const projectProgress = metrics.projectProgress.filter((project) => !query || [project.code, project.name, project.client, project.priority].some((value) => String(value || '').toLowerCase().includes(query)));
  const warehouseProgress = metrics.warehouseProgress.filter((warehouse) => !query || [warehouse.code, warehouse.name, warehouse.category, warehouse.projectCodes?.join(' ')].some((value) => String(value || '').toLowerCase().includes(query)));
  const qcQueue = data.workItems.filter((item) => item.status === 'Done' && !item.readyToShip).filter((item) => !query || [item.materialName, item.qcStatus, data.projects.find((entry) => entry.id === item.projectId)?.code, data.warehouses.find((entry) => entry.id === item.warehouseId)?.code].some((value) => String(value || '').toLowerCase().includes(query)));
  const todayLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Production monitoring"
        title="Production Dashboard"
        description="Snapshot operasional SIMO Mugi Jaya untuk progres produksi, kesiapan pengiriman, dan antrean QC."
        meta={
          <>
            <StatusBadge tone="blue">{todayLabel}</StatusBadge>
            <StatusBadge tone={isOffline ? 'amber' : 'emerald'}>
              {isOffline ? 'Offline fallback' : 'Backend connected'}
            </StatusBadge>
            {isLoading && <StatusBadge tone="amber">Loading data...</StatusBadge>}
          </>
        }
      />

      <input
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Search projects, warehouses, or blocked QC items..."
        aria-label="Search dashboard"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Projects"
          value={metrics.totalProjects}
          caption={`${metrics.totalWarehouses} warehouses assigned`}
          icon={Activity}
          tone="blue"
        />
        <MetricCard
          label="Total Work Items"
          value={metrics.totalWorkItems}
          caption={`${metrics.completedWorkItems} completed`}
          icon={ClipboardList}
          tone="indigo"
        />
        <MetricCard
          label="Production Progress"
          value={`${metrics.progressPercentage}%`}
          caption="Based on completed work items"
          icon={CheckCircle2}
          tone="emerald"
        />
        <MetricCard
          label="Ready To Ship"
          value={metrics.readyToShipItems}
          caption={`${metrics.pendingQcItems} completed items blocked by QC`}
          icon={PackageCheck}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Surface>
          <SectionHeading
            icon={Activity}
            title="Project Progress"
            description="Progress produksi per proyek untuk narasi demo."
            action={<span className="text-sm font-semibold text-slate-500">{metrics.totalProjects} projects</span>}
          />

          <div className="mt-2">
            {projectProgress.length > 0 ? projectProgress.map((project) => (
              <ProgressRow
                key={project.id}
                title={`${project.code} - ${project.name}`}
                subtitle={`${project.client} | Due ${project.dueDate}`}
                total={project.totalWorkItems}
                completed={project.completedWorkItems}
                percentage={project.progressPercentage}
                rightLabel={project.priority}
              />
            )) : (
              <EmptyState title="No project data found yet." description="Project progress will appear after project and work item data is available." />
            )}
          </div>
        </Surface>

        <Surface>
          <SectionHeading
            icon={Building2}
            title="Warehouse Progress"
            description="Ringkasan penyelesaian pekerjaan per area warehouse."
            action={<span className="text-sm font-semibold text-slate-500">{metrics.totalWarehouses} warehouses</span>}
          />

          <div className="mt-2">
            {warehouseProgress.length > 0 ? warehouseProgress.map((warehouse) => (
              <ProgressRow
                key={warehouse.id}
                title={`${warehouse.code} - ${warehouse.name}`}
                subtitle={warehouse.category}
                total={warehouse.totalWorkItems}
                completed={warehouse.completedWorkItems}
                percentage={warehouse.progressPercentage}
                rightLabel={warehouse.projectCodes.join(', ') || 'No project'}
              />
            )) : (
              <EmptyState title="No warehouse data found yet." description="Warehouse progress will appear after production data is available." />
            )}
          </div>
        </Surface>
      </div>

      <Surface>
        <SectionHeading
          icon={ShieldCheck}
          title="QC Shipping Gate"
          description="Completed materials require Passed QC before shipping."
          action={<StatusBadge tone={qcQueue.length ? 'rose' : 'emerald'}>{qcQueue.length} blocked</StatusBadge>}
        />

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {qcQueue.length > 0 ? qcQueue.map((item) => {
            const project = data.projects.find((entry) => entry.id === item.projectId);
            const warehouse = data.warehouses.find((entry) => entry.id === item.warehouseId);

            return (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-800">{item.materialName}</h3>
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                    {item.qcStatus}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{project?.code} | {warehouse?.code}</p>
              </div>
            );
          }) : (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState
                icon={PackageCheck}
                title="All completed materials are clear."
                description="Items blocked by QC will appear here during the demo."
              />
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}
