import { useEffect, useMemo, useState } from 'react';
import { Boxes, Building2, Edit3, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { AlertMessage, EmptyState, MobileDataCard, PageHeader, SectionHeading, StatusBadge, Surface } from '../components/ui';
import { getProjects, createProject, updateProject, deleteProject } from '../services/projectsApi';
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../services/warehousesApi';

const emptyProjectForm = {
  code: '',
  name: '',
  clientName: '',
  location: '',
  status: 'Active',
  dueDate: '',
  priority: 'Medium',
};

const emptyWarehouseForm = {
  projectId: '',
  code: '',
  name: '',
  location: '',
  category: '',
  status: 'Active',
};

const projectStatusOptions = ['Active', 'On Hold', 'Completed'];
const priorityOptions = ['Low', 'Medium', 'High', 'Critical'];
const warehouseStatusOptions = ['Active', 'Inactive', 'Maintenance'];

function FormInput({ id, label, value, onChange, required = false, type = 'text', placeholder = '' }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}{required ? ' *' : ''}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

function FormSelect({ id, label, value, onChange, children }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {children}
      </select>
    </label>
  );
}

function ActionButton({ children, tone = 'slate', ...props }) {
  const tones = {
    blue: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300',
    emerald: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300',
    rose: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:text-slate-400',
    slate: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60',
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold shadow-sm transition-colors disabled:cursor-not-allowed ${tones[tone]}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function MasterData() {
  const [activeTab, setActiveTab] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouseForm);
  const [editingProjectId, setEditingProjectId] = useState('');
  const [editingWarehouseId, setEditingWarehouseId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const query = searchTerm.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => !query || [project.code, project.name, project.clientName, project.client, project.location, project.status, project.priority].some((value) => String(value || '').toLowerCase().includes(query)));
  const filteredWarehouses = warehouses.filter((warehouse) => !query || [warehouse.code, warehouse.name, warehouse.location, warehouse.category, warehouse.status, projectsById.get(warehouse.projectId)?.name, projectsById.get(warehouse.projectId)?.code].some((value) => String(value || '').toLowerCase().includes(query)));

  async function loadData() {
    setIsLoading(true);
    setError('');
    try {
      const [projectsResponse, warehousesResponse] = await Promise.all([
        getProjects(),
        getWarehouses(),
      ]);
      setProjects(projectsResponse.data || []);
      setWarehouses(warehousesResponse.data || []);
    } catch (err) {
      setError(err.message || 'Master data belum dapat dimuat.');
    } finally {
      setIsLoading(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadData();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function resetProjectForm() {
    setProjectForm(emptyProjectForm);
    setEditingProjectId('');
  }

  function resetWarehouseForm() {
    setWarehouseForm(emptyWarehouseForm);
    setEditingWarehouseId('');
  }

  async function handleProjectSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      if (editingProjectId) {
        await updateProject(editingProjectId, projectForm);
        setMessage('Project berhasil diperbarui.');
      } else {
        await createProject(projectForm);
        setMessage('Project baru berhasil dibuat.');
      }
      resetProjectForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Project belum dapat disimpan.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleWarehouseSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = { ...warehouseForm, projectId: warehouseForm.projectId || null };
      if (editingWarehouseId) {
        await updateWarehouse(editingWarehouseId, payload);
        setMessage('Warehouse berhasil diperbarui.');
      } else {
        await createWarehouse(payload);
        setMessage('Warehouse baru berhasil dibuat.');
      }
      resetWarehouseForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Warehouse belum dapat disimpan.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteProject(project) {
    if (!window.confirm(`Hapus project ${project.code} - ${project.name}?`)) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      await deleteProject(project.id);
      setMessage('Project berhasil dihapus.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Project belum dapat dihapus.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteWarehouse(warehouse) {
    if (!window.confirm(`Hapus warehouse ${warehouse.code} - ${warehouse.name}?`)) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      await deleteWarehouse(warehouse.id);
      setMessage('Warehouse berhasil dihapus.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Warehouse belum dapat dihapus.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Client-ready operations"
        title="Master Data Control"
        description="Kelola project dan warehouse dari satu command center dengan validasi, role access, dan audit trail."
        meta={
          <>
            <StatusBadge tone="blue">{projects.length} projects</StatusBadge>
            <StatusBadge tone="indigo">{warehouses.length} warehouses</StatusBadge>
            <StatusBadge tone="emerald">CRUD enabled</StatusBadge>
          </>
        }
        actions={
          <ActionButton onClick={loadData} disabled={isLoading || isSaving}>
            <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} />
            Refresh
          </ActionButton>
        }
      />

      {message && <AlertMessage type="success" title="Master data updated">{message}</AlertMessage>}
      {error && <AlertMessage type="error" title="Master data issue">{error}</AlertMessage>}

      <input
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Search project or warehouse code, name, location, status..."
        aria-label="Search master data"
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className={`rounded-lg px-4 py-3 text-sm font-black transition-colors ${activeTab === 'projects' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Project Master
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('warehouses')}
          className={`rounded-lg px-4 py-3 text-sm font-black transition-colors ${activeTab === 'warehouses' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Warehouse Master
        </button>
      </div>

      {activeTab === 'projects' ? (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Surface>
            <SectionHeading icon={Building2} title={editingProjectId ? 'Edit Project' : 'Create Project'} description="Project adalah pusat relasi produksi, QC, dan logistics." />
            <form onSubmit={handleProjectSubmit} className="mt-5 space-y-4">
              <FormInput id="project-code" label="Code" value={projectForm.code} onChange={(value) => setProjectForm((current) => ({ ...current, code: value }))} required placeholder="MJ-PRJ-001" />
              <FormInput id="project-name" label="Project Name" value={projectForm.name} onChange={(value) => setProjectForm((current) => ({ ...current, name: value }))} required placeholder="Pembangunan Gudang Utama" />
              <FormInput id="project-client" label="Client Name" value={projectForm.clientName} onChange={(value) => setProjectForm((current) => ({ ...current, clientName: value }))} required placeholder="PT Klien Nusantara" />
              <FormInput id="project-location" label="Location" value={projectForm.location} onChange={(value) => setProjectForm((current) => ({ ...current, location: value }))} placeholder="Surabaya" />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect id="project-status" label="Status" value={projectForm.status} onChange={(value) => setProjectForm((current) => ({ ...current, status: value }))}>
                  {projectStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </FormSelect>
                <FormSelect id="project-priority" label="Priority" value={projectForm.priority} onChange={(value) => setProjectForm((current) => ({ ...current, priority: value }))}>
                  {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </FormSelect>
              </div>
              <FormInput id="project-due-date" label="Due Date" type="date" value={projectForm.dueDate || ''} onChange={(value) => setProjectForm((current) => ({ ...current, dueDate: value }))} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="submit" disabled={isSaving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Save size={16} />
                  {editingProjectId ? 'Save Project' : 'Create Project'}
                </button>
                {editingProjectId && (
                  <ActionButton onClick={resetProjectForm} disabled={isSaving}>
                    <X size={16} /> Cancel
                  </ActionButton>
                )}
              </div>
            </form>
          </Surface>

          <Surface padding="p-0">
            <div className="p-5">
              <SectionHeading icon={Building2} title="Project Registry" description="Data project yang siap dipakai modul produksi, QC, dan logistics." />
            </div>
            {isLoading ? (
              <div className="p-5 text-sm font-semibold text-slate-500">Loading projects...</div>
            ) : filteredProjects.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState icon={Building2} title="No projects yet." description="Create the first client project to start operations." /></div>
            ) : (
              <>
                <div className="space-y-3 px-4 pb-4 md:hidden">
                  {filteredProjects.map((project) => (
                  <MobileDataCard
                    key={project.id}
                    title={`${project.code} - ${project.name}`}
                    subtitle={`${project.clientName} - ${project.location || '-'}`}
                    meta={<StatusBadge tone={project.status === 'Active' ? 'emerald' : project.status === 'Completed' ? 'blue' : 'amber'}>{project.status}</StatusBadge>}
                    actions={
                      <>
                        <ActionButton onClick={() => { setEditingProjectId(project.id); setProjectForm({ code: project.code, name: project.name, clientName: project.clientName, location: project.location || '', status: project.status, dueDate: project.dueDate || '', priority: project.priority || 'Medium' }); }} disabled={isSaving}><Edit3 size={15} />Edit</ActionButton>
                        <ActionButton tone="rose" onClick={() => handleDeleteProject(project)} disabled={isSaving}><Trash2 size={15} />Delete</ActionButton>
                      </>
                    }
                  >
                    <p className="text-xs font-semibold text-slate-600">Due: {project.dueDate || '-'}</p>
                  </MobileDataCard>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3">Project</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projects.map((project) => (
                      <tr key={project.id} className="hover:bg-blue-50/40">
                        <td className="px-5 py-4"><p className="font-bold text-slate-800">{project.code}</p><p className="text-slate-500">{project.name}</p></td>
                        <td className="px-5 py-4"><p className="font-semibold text-slate-700">{project.clientName}</p><p className="text-slate-500">{project.location || '-'}</p></td>
                        <td className="px-5 py-4"><StatusBadge tone={project.status === 'Active' ? 'emerald' : project.status === 'Completed' ? 'blue' : 'amber'}>{project.status}</StatusBadge></td>
                        <td className="px-5 py-4 text-slate-600">{project.dueDate || '-'}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <ActionButton onClick={() => { setEditingProjectId(project.id); setProjectForm({ code: project.code, name: project.name, clientName: project.clientName, location: project.location || '', status: project.status, dueDate: project.dueDate || '', priority: project.priority || 'Medium' }); }} disabled={isSaving}><Edit3 size={15} />Edit</ActionButton>
                            <ActionButton tone="rose" onClick={() => handleDeleteProject(project)} disabled={isSaving}><Trash2 size={15} />Delete</ActionButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </>
            )}
          </Surface>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Surface>
            <SectionHeading icon={Boxes} title={editingWarehouseId ? 'Edit Warehouse' : 'Create Warehouse'} description="Warehouse menghubungkan area produksi dengan project aktif." />
            <form onSubmit={handleWarehouseSubmit} className="mt-5 space-y-4">
              <FormSelect id="warehouse-project" label="Linked Project" value={warehouseForm.projectId} onChange={(value) => setWarehouseForm((current) => ({ ...current, projectId: value }))}>
                <option value="">No linked project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.code} - {project.name}</option>)}
              </FormSelect>
              <FormInput id="warehouse-code" label="Code" value={warehouseForm.code} onChange={(value) => setWarehouseForm((current) => ({ ...current, code: value }))} required placeholder="WH-A01" />
              <FormInput id="warehouse-name" label="Warehouse Name" value={warehouseForm.name} onChange={(value) => setWarehouseForm((current) => ({ ...current, name: value }))} required placeholder="Area Cutting" />
              <FormInput id="warehouse-location" label="Location" value={warehouseForm.location} onChange={(value) => setWarehouseForm((current) => ({ ...current, location: value }))} placeholder="Workshop Timur" />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput id="warehouse-category" label="Category" value={warehouseForm.category} onChange={(value) => setWarehouseForm((current) => ({ ...current, category: value }))} placeholder="Production" />
                <FormSelect id="warehouse-status" label="Status" value={warehouseForm.status} onChange={(value) => setWarehouseForm((current) => ({ ...current, status: value }))}>
                  {warehouseStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </FormSelect>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="submit" disabled={isSaving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  <Plus size={16} />
                  {editingWarehouseId ? 'Save Warehouse' : 'Create Warehouse'}
                </button>
                {editingWarehouseId && (
                  <ActionButton onClick={resetWarehouseForm} disabled={isSaving}>
                    <X size={16} /> Cancel
                  </ActionButton>
                )}
              </div>
            </form>
          </Surface>

          <Surface padding="p-0">
            <div className="p-5">
              <SectionHeading icon={Boxes} title="Warehouse Registry" description="Area produksi dan gudang yang bisa dipakai work item." />
            </div>
            {isLoading ? (
              <div className="p-5 text-sm font-semibold text-slate-500">Loading warehouses...</div>
            ) : filteredWarehouses.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState icon={Boxes} title="No warehouses yet." description="Create a warehouse to start production tracking." /></div>
            ) : (
              <>
                <div className="space-y-3 px-4 pb-4 md:hidden">
                  {filteredWarehouses.map((warehouse) => {
                  const project = projectsById.get(warehouse.projectId);
                  return (
                    <MobileDataCard
                      key={warehouse.id}
                      title={`${warehouse.code} - ${warehouse.name}`}
                      subtitle={project?.code ? `${project.code} - ${project.name}` : 'No linked project'}
                      meta={<StatusBadge tone={warehouse.status === 'Active' ? 'emerald' : warehouse.status === 'Maintenance' ? 'amber' : 'slate'}>{warehouse.status}</StatusBadge>}
                      actions={
                        <>
                          <ActionButton onClick={() => { setEditingWarehouseId(warehouse.id); setWarehouseForm({ projectId: warehouse.projectId || '', code: warehouse.code, name: warehouse.name, location: warehouse.location || '', category: warehouse.category || '', status: warehouse.status || 'Active' }); }} disabled={isSaving}><Edit3 size={15} />Edit</ActionButton>
                          <ActionButton tone="rose" onClick={() => handleDeleteWarehouse(warehouse)} disabled={isSaving}><Trash2 size={15} />Delete</ActionButton>
                        </>
                      }
                    >
                      <p className="text-xs font-semibold text-slate-600">{warehouse.location || '-'} - {warehouse.category || '-'}</p>
                    </MobileDataCard>
                  );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3">Warehouse</th><th className="px-5 py-3">Project</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {warehouses.map((warehouse) => {
                      const project = projectsById.get(warehouse.projectId);
                      return (
                        <tr key={warehouse.id} className="hover:bg-blue-50/40">
                          <td className="px-5 py-4"><p className="font-bold text-slate-800">{warehouse.code}</p><p className="text-slate-500">{warehouse.name}</p></td>
                          <td className="px-5 py-4"><p className="font-semibold text-slate-700">{project?.code || '-'}</p><p className="text-slate-500">{project?.name || 'No linked project'}</p></td>
                          <td className="px-5 py-4"><p className="font-semibold text-slate-700">{warehouse.location || '-'}</p><p className="text-slate-500">{warehouse.category || '-'}</p></td>
                          <td className="px-5 py-4"><StatusBadge tone={warehouse.status === 'Active' ? 'emerald' : warehouse.status === 'Maintenance' ? 'amber' : 'slate'}>{warehouse.status}</StatusBadge></td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <ActionButton onClick={() => { setEditingWarehouseId(warehouse.id); setWarehouseForm({ projectId: warehouse.projectId || '', code: warehouse.code, name: warehouse.name, location: warehouse.location || '', category: warehouse.category || '', status: warehouse.status || 'Active' }); }} disabled={isSaving}><Edit3 size={15} />Edit</ActionButton>
                              <ActionButton tone="rose" onClick={() => handleDeleteWarehouse(warehouse)} disabled={isSaving}><Trash2 size={15} />Delete</ActionButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
