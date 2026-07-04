import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { getReportTypes, previewReport, exportReportCsv, exportReportPdf } from '../services/reportsApi';
import {
  ActionButton,
  AlertMessage,
  EmptyState,
  FormField,
  MobileDataCard,
  PageHeader,
  ResponsiveTable,
  SectionHeading,
  StatusBadge,
  Surface,
} from '../components/ui';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function saveCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [period, setPeriod] = useState({ startDate: firstDayOfYear(), endDate: today() });
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    getReportTypes()
      .then((response) => {
        if (!active) return;
        const nextTypes = response.data || [];
        setTypes(nextTypes);
        setSelectedType((current) => current || nextTypes[0]?.id || '');
      })
      .catch((err) => setError(err?.message || 'Report types belum dapat dimuat.'));
    return () => { active = false; };
  }, []);

  const selectedReport = useMemo(
    () => types.find((report) => report.id === selectedType),
    [selectedType, types],
  );

  const summaryEntries = preview ? Object.entries(preview.summary || {}) : [];
  const previewRows = useMemo(() => {
    const rows = preview?.rows || [];
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value || '').toLowerCase().includes(query)));
  }, [preview, searchTerm]);
  const columns = preview?.columns || [];

  const loadPreview = async () => {
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await previewReport(selectedType, period);
      setPreview(response.data);
      setMessage('Preview report berhasil dimuat.');
    } catch (err) {
      setPreview(null);
      setError(err?.message || 'Preview report gagal dimuat.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCsv = async () => {
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await exportReportCsv(selectedType, period);
      saveCsv(response.text, `${selectedType}-${period.startDate}-to-${period.endDate}.csv`);
      setMessage('CSV report berhasil dibuat dan dicatat di audit log.');
    } catch (err) {
      setError(err?.message || 'CSV export gagal dibuat.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadPdf = async () => {
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await exportReportPdf(selectedType, period);
      saveBlob(response.blob, `${selectedType}-${period.startDate}-to-${period.endDate}.pdf`);
      setMessage('PDF report berhasil dibuat dan dicatat di audit log.');
    } catch (err) {
      setError(err?.message || 'PDF export gagal dibuat.');
    } finally {
      setIsLoading(false);
    }
  };

  const tableRows = previewRows.map((row, index) => (
    <tr key={`${preview.type}-${index}`} className="transition-colors hover:bg-slate-50">
      {columns.map((column) => (
        <td key={column} className="px-5 py-4 text-sm text-slate-600">{String(row[column] ?? '-')}</td>
      ))}
    </tr>
  ));

  const mobileCards = previewRows.map((row, index) => (
    <MobileDataCard key={`${preview.type}-card-${index}`} title={row.metric || row.work_item || row.manifest_number || row.project || row.module || `Row ${index + 1}`} subtitle={`Report row ${index + 1}`}>
      <div className="grid gap-2 text-xs">
        {columns.slice(0, 6).map((column) => (
          <p key={column} className="flex justify-between gap-3 border-b border-slate-100 pb-1">
            <span className="font-bold uppercase tracking-wide text-slate-400">{column}</span>
            <span className="break-words text-right font-semibold text-slate-700">{String(row[column] ?? '-')}</span>
          </p>
        ))}
      </div>
    </MobileDataCard>
  ));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Report Center"
        title="Preview & Export Reports"
        description="Generate authorized operational reports with period filters, generated-by metadata, and audited CSV export."
        meta={
          <>
            <StatusBadge tone="blue">{types.length} report types</StatusBadge>
            <StatusBadge tone="emerald">CSV enabled</StatusBadge>
            <StatusBadge tone="emerald">PDF enabled</StatusBadge>
          </>
        }
      />

      {message && <AlertMessage type="success" title="Report ready">{message}</AlertMessage>}
      {error && <AlertMessage type="error" title="Report issue">{error}</AlertMessage>}

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Surface>
          <SectionHeading icon={FileSpreadsheet} title="Report filters" description="Select report type and period before preview/export." />
          <div className="mt-5 space-y-4">
            <FormField id="report-type" label="Report type">
              <select id="report-type" value={selectedType} onChange={(event) => setSelectedType(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {types.map((type) => <option key={type.id} value={type.id}>{type.title}</option>)}
              </select>
            </FormField>
            <FormField id="report-start" label="Start date">
              <input id="report-start" type="date" value={period.startDate} onChange={(event) => setPeriod((current) => ({ ...current, startDate: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FormField>
            <FormField id="report-end" label="End date">
              <input id="report-end" type="date" value={period.endDate} onChange={(event) => setPeriod((current) => ({ ...current, endDate: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </FormField>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <ActionButton icon={Eye} onClick={loadPreview} disabled={!selectedType || isLoading} className="w-full">{isLoading ? 'Loading...' : 'Preview'}</ActionButton>
              <ActionButton icon={Download} tone="secondary" onClick={downloadCsv} disabled={!preview || isLoading} className="w-full">Export CSV</ActionButton>
              <ActionButton icon={Download} tone="secondary" onClick={downloadPdf} disabled={!preview || isLoading} className="w-full">Export PDF</ActionButton>
            </div>
          </div>
        </Surface>

        <Surface padding="p-0" className="overflow-hidden">
          <div className="p-5">
            <SectionHeading
              icon={ShieldCheck}
              title={preview?.title || selectedReport?.title || 'Report preview'}
              description="Preview includes generated by, generated at, period, summary, row count, and first 100 rows."
            />
          </div>

          {!preview ? (
            <div className="px-5 pb-5">
              <EmptyState icon={FileSpreadsheet} title="No report preview yet." description="Choose a report type and period, then click Preview." />
            </div>
          ) : (
            <div className="space-y-5 p-5 pt-0">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatusBadge tone="blue">{preview.period.startDate} to {preview.period.endDate}</StatusBadge>
                <StatusBadge tone="emerald">{preview.rowCount} rows</StatusBadge>
                <StatusBadge tone="slate">By {preview.generatedBy.name}</StatusBadge>
                <StatusBadge tone="slate">{new Date(preview.generatedAt).toLocaleString('id-ID')}</StatusBadge>
              </div>

              <div>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search preview rows..."
                  aria-label="Search report preview"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summaryEntries.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-1 break-words text-sm font-black text-slate-800">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                  </div>
                ))}
              </div>

              {previewRows.length ? (
                <ResponsiveTable headers={columns} mobileCards={mobileCards}>
                  <tbody className="divide-y divide-slate-100">{tableRows}</tbody>
                </ResponsiveTable>
              ) : (
                <EmptyState icon={FileSpreadsheet} title="No report data found for the selected period." description="Try a wider period or another report type." />
              )}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
