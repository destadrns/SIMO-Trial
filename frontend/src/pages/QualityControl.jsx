import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, FileImage, PackageCheck, Ruler, ShieldCheck, Upload } from 'lucide-react';
import { useAppData } from '../context/AppDataCore';
import { QC_STATUS_OPTIONS } from '../data/seedData';
import { AlertMessage, EmptyState, MetricCard, PageHeader, SectionHeading, StatusBadge, Surface } from '../components/ui';

const qcStyles = {
  Pending: 'border-amber-200 bg-amber-50 text-amber-700',
  'Passed QC': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Rework: 'border-rose-200 bg-rose-50 text-rose-700',
};

const statusHelp = {
  Pending: 'Waiting for final inspection result.',
  'Passed QC': 'Material can move to shipping preparation.',
  Rework: 'Material remains blocked until corrected.',
};

const TOKEN_KEY = 'simo-mugi-jaya-token';
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const apiHostUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api')
  .replace(/\/$/, '')
  .replace(/\/api$/, '');

function isImageEvidence(reference) {
  const value = String(reference || '').toLowerCase();
  return value.startsWith('http') || /\.(jpe?g|png|webp)$/.test(value);
}


function buildFormFromItem(item) {
  return {
    projectId: item?.projectId || '',
    warehouseId: item?.warehouseId || '',
    workItemId: item?.id || '',
    materialName: item?.materialName || '',
    length: '',
    width: '',
    thickness: '',
    qcStatus: 'Pending',
    notes: '',
    evidencePhoto: '',
  };
}

const FieldLabel = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wide text-slate-500">{children}</label>
);

export default function QualityControl() {
  const {
    data,
    permissions,
    projectsById,
    warehousesById,
    submitQcChecklist,
  } = useAppData();

  const [form, setForm] = useState(() => buildFormFromItem(data.workItems[0]));
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState({});

  const filteredWorkItems = useMemo(
    () => data.workItems.filter((item) => item.projectId === form.projectId),
    [data.workItems, form.projectId],
  );

  const selectedWorkItem = data.workItems.find((item) => item.id === form.workItemId);
  const passedCount = data.qcChecklists.filter((item) => item.qcStatus === 'Passed QC').length;
  const reworkCount = data.qcChecklists.filter((item) => item.qcStatus === 'Rework').length;
  const readyItems = data.workItems.filter((item) => item.readyToShip);


  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const evidenceNames = [...new Set(
      data.qcChecklists
        .map((record) => record.evidencePhoto)
        .filter((reference) => reference && !String(reference).startsWith('http') && isImageEvidence(reference)),
    )];
    const objectUrls = [];
    let cancelled = false;

    async function loadEvidence() {
      const entries = await Promise.all(evidenceNames.map(async (name) => {
        try {
          const response = await fetch(`${apiHostUrl}/api/qc-checklists/evidence/${encodeURIComponent(name)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (!response.ok) return [name, ''];
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          return [name, objectUrl];
        } catch {
          return [name, ''];
        }
      }));

      if (!cancelled) {
        setEvidenceUrls(Object.fromEntries(entries.filter(([, url]) => url)));
      }
    }

    loadEvidence();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [data.qcChecklists]);


  const setSelectedItem = (item) => {
    setForm((currentForm) => ({
      ...buildFormFromItem(item),
      length: currentForm.length,
      width: currentForm.width,
      thickness: currentForm.thickness,
      qcStatus: currentForm.qcStatus,
      notes: currentForm.notes,
      evidencePhoto: currentForm.evidencePhoto,
    }));
  };

  const handleProjectChange = (projectId) => {
    const nextItem = data.workItems.find((item) => item.projectId === projectId);
    setSelectedItem(nextItem);
  };

  const handleWorkItemChange = (workItemId) => {
    const nextItem = data.workItems.find((item) => item.id === workItemId);
    setSelectedItem(nextItem);
  };

  const handleChange = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleEvidenceChange = (event) => {
    const nextFile = event.target.files[0] || null;
    setError('');

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!ALLOWED_EVIDENCE_TYPES.has(nextFile.type)) {
      setFile(null);
      event.target.value = '';
      setError('Evidence harus berupa JPG, PNG, atau WEBP.');
      return;
    }

    if (nextFile.size > MAX_EVIDENCE_FILE_SIZE) {
      setFile(null);
      event.target.value = '';
      setError('Evidence maksimal 5 MB.');
      return;
    }

    setFile(nextFile);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!permissions.canSubmitQc) {
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    setError('');

    try {
      await submitQcChecklist({ ...form, file });
      setMessage(`${form.materialName} submitted as ${form.qcStatus}.`);
      setFile(null);
      setForm((currentForm) => ({
        ...currentForm,
        length: '',
        width: '',
        thickness: '',
        qcStatus: 'Pending',
        notes: '',
        evidencePhoto: '',
      }));
    } catch (err) {
      setError(err?.message || 'QC checklist belum dapat disimpan. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Quality control"
        title="Digital QC Checklist"
        description="Catat hasil inspeksi material, unggah evidence, dan tentukan apakah material siap masuk proses pengiriman."
        meta={
          <StatusBadge tone={permissions.canSubmitQc ? 'emerald' : 'slate'}>
            {permissions.canSubmitQc ? 'QC submission enabled' : 'Read-only access'}
          </StatusBadge>
        }
      />

      {message && <AlertMessage type="success" title="Checklist submitted">{message}</AlertMessage>}
      {error && <AlertMessage type="error" title="Submission failed">{error}</AlertMessage>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={ClipboardCheck}
          label="QC Records"
          value={data.qcChecklists.length}
          caption="Inspection history"
          tone="blue"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Passed QC"
          value={passedCount}
          caption="Approved records"
          tone="emerald"
        />
        <MetricCard
          icon={PackageCheck}
          label="Ready To Ship"
          value={readyItems.length}
          caption="Released materials"
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Surface>
          <form onSubmit={handleSubmit}>
            <SectionHeading
              icon={ClipboardCheck}
              title="Checklist Form"
              description="Pilih work item, isi dimensi, status inspeksi, catatan, dan evidence bila tersedia."
            />

          <fieldset disabled={!permissions.canSubmitQc || isSubmitting} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-project">Project</FieldLabel>
              <select
                id="qc-project"
                value={form.projectId}
                onChange={(event) => handleProjectChange(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-work-item">Work Item</FieldLabel>
              <select
                id="qc-work-item"
                value={form.workItemId}
                onChange={(event) => handleWorkItemChange(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {filteredWorkItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.materialName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-warehouse">Warehouse</FieldLabel>
              <input
                id="qc-warehouse"
                value={warehousesById.get(form.warehouseId)?.name || ''}
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-material">Material Name</FieldLabel>
              <input
                id="qc-material"
                value={form.materialName}
                onChange={(event) => handleChange('materialName', event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                required
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-length">Length</FieldLabel>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="qc-length"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.length}
                  onChange={(event) => handleChange('length', event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-width">Width</FieldLabel>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="qc-width"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.width}
                  onChange={(event) => handleChange('width', event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-thickness">Thickness</FieldLabel>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="qc-thickness"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.thickness}
                  onChange={(event) => handleChange('thickness', event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="qc-status">QC Status</FieldLabel>
              <select
                id="qc-status"
                value={form.qcStatus}
                onChange={(event) => handleChange('qcStatus', event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 ${qcStyles[form.qcStatus]}`}
              >
                {QC_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <FieldLabel htmlFor="qc-evidence">Evidence Photo</FieldLabel>
              <div className="relative rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                <Upload className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="qc-evidence"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleEvidenceChange}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Accepted file: image up to 5 MB. {file ? `Selected: ${file.name}` : 'No file selected.'}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <FieldLabel htmlFor="qc-notes">Notes</FieldLabel>
              <textarea
                id="qc-notes"
                value={form.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                required
              />
            </div>
            </fieldset>

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-500">{statusHelp[form.qcStatus]}</p>
            <button
              type="submit"
              disabled={!permissions.canSubmitQc || isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ClipboardCheck size={18} />
              {isSubmitting ? 'Submitting...' : 'Submit Checklist'}
            </button>
            </div>
          </form>
        </Surface>

        <Surface>
          <SectionHeading
            icon={ShieldCheck}
            title="Inspection Status"
            description={`${selectedWorkItem?.materialName || 'No material selected'} | ${projectsById.get(form.projectId)?.code || '-'}`}
          />

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-700">Passed QC</p>
              <p className="text-3xl font-bold text-emerald-800">{passedCount}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-700">Rework</p>
              <p className="text-3xl font-bold text-rose-800">{reworkCount}</p>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="mb-3 font-bold text-slate-800">Ready Materials</h3>
            <div className="space-y-3">
              {readyItems.length > 0 ? readyItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-800">{item.materialName}</p>
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      Ready
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {projectsById.get(item.projectId)?.code} | {warehousesById.get(item.warehouseId)?.code}
                  </p>
                </div>
              )) : (
                <EmptyState
                  icon={PackageCheck}
                  title="No ready materials yet."
                  description="Materials will appear here after Passed QC."
                />
              )}
            </div>
          </div>
        </Surface>
      </div>

      <Surface padding="p-0">
        <div className="p-5">
          <SectionHeading
            icon={FileImage}
            title="QC Checklist History"
            description="Riwayat inspeksi terbaru dengan status, evidence, inspector, dan catatan."
          />
        </div>

        {data.qcChecklists.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={ClipboardCheck}
              title="No QC records yet."
              description="Submitted checklists will appear here."
            />
          </div>
        ) : (
          <>
            <div className="space-y-3 px-5 pb-5 md:hidden">
              {data.qcChecklists.map((record) => (
                <article key={record.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">{record.materialName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{record.createdAt}</p>
                    </div>
                    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold ${qcStyles[record.qcStatus]}`}>
                      {record.qcStatus}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dimension</p>
                      <p className="mt-1 font-semibold text-slate-800">{record.length} x {record.width} x {record.thickness}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Inspector</p>
                      <p className="mt-1 truncate font-semibold text-slate-800">{record.createdBy}</p>
                    </div>
                  </div>
                  {record.notes && <p className="mt-3 text-sm leading-5 text-slate-600">{record.notes}</p>}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-4">Time</th>
                    <th className="px-5 py-4">Material</th>
                    <th className="px-5 py-4">Dimension</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Evidence</th>
                    <th className="px-5 py-4">Inspector</th>
                    <th className="px-5 py-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.qcChecklists.map((record) => (
                    <tr key={record.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-sm font-semibold text-slate-700">{record.createdAt}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-800">{record.materialName}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {record.length} x {record.width} x {record.thickness}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold ${qcStyles[record.qcStatus]}`}>
                          {record.qcStatus}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {record.evidencePhoto ? (
                          isImageEvidence(record.evidencePhoto) && (record.evidencePhoto.startsWith('http') || evidenceUrls[record.evidencePhoto]) ? (
                            <img
                              src={record.evidencePhoto.startsWith('http') ? record.evidencePhoto : evidenceUrls[record.evidencePhoto]}
                              alt="Evidence"
                              className="h-10 w-10 cursor-pointer rounded-lg border border-slate-200 object-cover shadow-sm transition-transform hover:scale-105"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                              onClick={(event) => window.open(event.currentTarget.src, '_blank')}
                            />
                          ) : (
                            <span className="text-xs italic text-slate-400">{record.evidencePhoto}</span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{record.createdBy}</td>
                      <td className="px-5 py-4 text-sm text-slate-500">{record.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Surface>
    </div>
  );
}
