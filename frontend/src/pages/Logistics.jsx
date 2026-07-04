import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clock, Copy, ExternalLink, MapPin, RefreshCw, RotateCcw, Truck, User } from 'lucide-react';
import {
  createDeliveryCheckin,
  getLogisticsManifests,
  regenerateLogisticsTrackingToken,
  updateLogisticsManifestStatus,
} from '../services/logisticsApi';
import { useBackendApi } from '../services/apiClient';
import LogisticsLiveMap from '../components/LogisticsLiveMap';
import { AlertMessage, EmptyState, MobileDataCard, PageHeader, SectionHeading, StatusBadge, Surface } from '../components/ui';

const statusOptions = ['Prepared', 'On Delivery', 'Arrived', 'Issue'];

const statusStyles = {
  Prepared: 'bg-slate-100 text-slate-700 border-slate-200',
  'On Delivery': 'bg-blue-50 text-blue-700 border-blue-200',
  Arrived: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Issue: 'bg-rose-50 text-rose-700 border-rose-200',
};

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function DeliveryStatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[status] || statusStyles.Prepared}`}>
      {status}
    </span>
  );
}

function CheckinNotes({ notes }) {
  const value = String(notes || '').trim();
  if (!value) return null;
  return <p className="mt-1 max-w-xs truncate text-xs text-slate-500" title={value}>Notes: {value}</p>;
}

export default function Logistics() {
  const [manifests, setManifests] = useState([]);
  const [selectedManifestId, setSelectedManifestId] = useState('');
  const [statusValue, setStatusValue] = useState('On Delivery');
  const [checkinStatus, setCheckinStatus] = useState('On Delivery');
  const [locationText, setLocationText] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [trackingLinkCopied, setTrackingLinkCopied] = useState(false);
  const [trackingLinkError, setTrackingLinkError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const useApi = useBackendApi;

  const filteredManifests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return manifests;
    return manifests.filter((manifest) => [
      manifest.manifestNumber,
      manifest.projectName,
      manifest.driverName,
      manifest.driverPhone,
      manifest.vehiclePlate,
      manifest.deliveryStatus,
      manifest.origin,
      manifest.destination,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [manifests, searchTerm]);

  const selectedManifest = useMemo(
    () => filteredManifests.find((manifest) => manifest.id === selectedManifestId) || filteredManifests[0] || manifests[0],
    [filteredManifests, manifests, selectedManifestId],
  );
  const driverTrackingPath = selectedManifest ? `/driver/tracking/${encodeURIComponent(selectedManifest.id)}?token=${encodeURIComponent(selectedManifest.trackingToken || '')}` : '';
  const driverTrackingUrl = useMemo(() => {
    if (!driverTrackingPath) {
      return '';
    }

    if (typeof window === 'undefined') {
      return driverTrackingPath;
    }

    return new URL(driverTrackingPath, window.location.origin).toString();
  }, [driverTrackingPath]);

  const loadManifests = useCallback(async function loadManifests() {
    setIsLoading(true);
    setError('');

    if (!useApi) {
      setManifests([]);
      setSelectedManifestId('');
      setMessage('Data logistik belum tersedia saat ini.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await getLogisticsManifests();
      setManifests(response.data || []);
      setSelectedManifestId((current) => current || response.data?.[0]?.id || '');
    } catch (err) {
      if (err.code === 'NETWORK_ERROR') {
        setError('Layanan logistik sedang tidak dapat dihubungi. Silakan coba beberapa saat lagi.');
      } else if (err.status === 503) {
        setError('Data logistik belum dapat diproses saat ini. Silakan coba beberapa saat lagi.');
      } else {
        setError(err.message || 'Manifest pengiriman belum dapat dimuat. Silakan coba beberapa saat lagi.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [useApi]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadManifests();
  }, [loadManifests]);


  async function handleStatusUpdate(event) {
    event.preventDefault();
    if (!useApi || !selectedManifest) return;

    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      await updateLogisticsManifestStatus(selectedManifest.id, statusValue);
      await loadManifests();
      setMessage('Status pengiriman berhasil diperbarui.');
    } catch (err) {
      setError(err.message || 'Failed to update delivery status.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCheckinSubmit(event) {
    event.preventDefault();
    if (!useApi || !selectedManifest) return;

    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      await createDeliveryCheckin(selectedManifest.id, {
        status: checkinStatus,
        locationText,
        notes,
      });
      setLocationText('');
      setNotes('');
      await loadManifests();
      setMessage('Check-in pengiriman berhasil disimpan.');
    } catch (err) {
      setError(err.message || 'Failed to save check-in.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleOpenTrackingPage() {
    if (!driverTrackingUrl) return;
    window.open(driverTrackingUrl, '_blank', 'noopener,noreferrer');
  }


  async function handleRegenerateTrackingToken() {
    if (!selectedManifest) return;
    const confirmed = window.confirm('Regenerate driver tracking link? Existing copied links for this manifest will stop working.');
    if (!confirmed) return;

    setIsSaving(true);
    setMessage('');
    setError('');
    setTrackingLinkCopied(false);

    try {
      const response = await regenerateLogisticsTrackingToken(selectedManifest.id);
      setManifests((current) => current.map((manifest) => (
        manifest.id === response.data.id ? response.data : manifest
      )));
      setMessage('Driver tracking link regenerated. Copy and share the new link.');
    } catch (err) {
      setError(err?.message || 'Tracking link could not be regenerated.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopyTrackingLink() {
    if (!driverTrackingUrl) return;

    setTrackingLinkError('');
    setTrackingLinkCopied(false);

    try {
      await navigator.clipboard.writeText(driverTrackingUrl);
      setTrackingLinkCopied(true);
    } catch {
      setTrackingLinkError('Tracking link could not be copied. Select the URL and copy it manually.');
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        eyebrow="Delivery control"
        title="Logistics Manifest"
        description="Pantau manifest, kendaraan, rute, status pengiriman, dan manual check-in CV Mugi Jaya."
        meta={
          <>
            <StatusBadge tone={useApi ? 'emerald' : 'amber'}>
              {useApi ? 'Backend data enabled' : 'Demo data unavailable'}
            </StatusBadge>
            <StatusBadge tone="blue">{filteredManifests.length}/{manifests.length} manifests</StatusBadge>
          </>
        }
        actions={
          <button
            type="button"
            onClick={loadManifests}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={isLoading ? 'animate-spin' : ''} size={16} />
            {isLoading ? 'Loading...' : useApi ? 'Retry' : 'Refresh'}
          </button>
        }
      />

      <input
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Search manifest, driver, status, destination..."
        aria-label="Search logistics manifests"
      />

      {message && <AlertMessage type="success" title="Logistics updated">{message}</AlertMessage>}
      {error && <AlertMessage type="error" title="Logistics data issue">{error}</AlertMessage>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Surface padding="p-0">
            <div className="p-5">
              <SectionHeading
                icon={Truck}
                title="Shipment Manifests"
                description="Manifest number, driver, vehicle, route, latest check-in, and delivery status."
              />
            </div>

            <div className="space-y-3 px-4 pb-4 md:hidden">
              {isLoading ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">Loading logistics data...</p>
              ) : filteredManifests.length === 0 ? (
                <EmptyState
                  icon={Truck}
                  title={useApi ? 'No manifests found yet.' : 'Logistics data is unavailable.'}
                  description={useApi ? 'Shipment manifests will appear after logistics data is seeded.' : 'Refresh after backend logistics data is enabled.'}
                />
              ) : filteredManifests.map((manifest) => (
                <button
                  key={manifest.id}
                  type="button"
                  onClick={() => {
                    setSelectedManifestId(manifest.id);
                    setStatusValue(manifest.deliveryStatus);
                    setCheckinStatus(manifest.deliveryStatus);
                    setTrackingLinkCopied(false);
                    setTrackingLinkError('');
                  }}
                  className="w-full text-left"
                >
                  <MobileDataCard
                    title={manifest.manifestNumber}
                    subtitle={`${manifest.driverName} - ${manifest.vehiclePlate}`}
                    meta={<DeliveryStatusBadge status={manifest.deliveryStatus} />}
                  >
                    <p className="text-xs leading-5 text-slate-500">{manifest.origin} to {manifest.destination}</p>
                    <p className="text-xs font-semibold text-slate-600">Latest: {manifest.latestCheckin?.locationText || '-'}</p>
                    <CheckinNotes notes={manifest.latestCheckin?.notes} />
                  </MobileDataCard>
                </button>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Manifest</th>
                    <th className="px-5 py-3">Driver / Vehicle</th>
                    <th className="px-5 py-3">Route</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Latest Check-in</th>
                    <th className="px-5 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td className="px-5 py-6 text-sm font-semibold text-slate-500" colSpan="6">Loading logistics data...</td></tr>
                  ) : filteredManifests.length === 0 ? (
                    <tr>
                      <td className="px-5 py-5" colSpan="6">
                        <EmptyState
                          icon={Truck}
                          title={useApi ? 'No manifests found yet.' : 'Logistics data is unavailable.'}
                          description={useApi ? 'Shipment manifests will appear after logistics data is seeded.' : 'Refresh after backend logistics data is enabled.'}
                        />
                      </td>
                    </tr>
                  ) : filteredManifests.map((manifest) => (
                    <tr
                      key={manifest.id}
                      onClick={() => {
                        setSelectedManifestId(manifest.id);
                        setStatusValue(manifest.deliveryStatus);
                        setCheckinStatus(manifest.deliveryStatus);
                        setTrackingLinkCopied(false);
                        setTrackingLinkError('');
                      }}
                      className={`cursor-pointer hover:bg-blue-50/60 ${selectedManifest?.id === manifest.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800">{manifest.manifestNumber}</p>
                        <p className="text-xs text-slate-500">{manifest.projectName || 'No project'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-700">{manifest.driverName}</p>
                        <p className="text-xs text-slate-500">{manifest.vehiclePlate} · {manifest.vehicleType || '-'}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <p>{manifest.origin}</p>
                        <p className="text-xs text-slate-400">to {manifest.destination}</p>
                      </td>
                      <td className="px-5 py-4"><DeliveryStatusBadge status={manifest.deliveryStatus} /></td>
                      <td className="px-5 py-4 text-slate-600">
                        <p>{manifest.latestCheckin?.locationText || '-'}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(manifest.latestCheckin?.checkedInAt)}</p>
                        <CheckinNotes notes={manifest.latestCheckin?.notes} />
                      </td>
                      <td className="px-5 py-4 text-slate-500">{formatDateTime(manifest.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>

          <LogisticsLiveMap selectedManifest={selectedManifest} />
        </div>

        <aside className="space-y-4">
          <Surface>
            <SectionHeading title="Selected Manifest" description="Detail manifest yang sedang dipilih untuk update status dan check-in." />
            {selectedManifest ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Truck className="mt-0.5 text-blue-600" size={18} />
                    <div>
                      <p className="font-bold text-slate-900">{selectedManifest.manifestNumber}</p>
                      <p className="text-slate-500">{selectedManifest.projectName}</p>
                    </div>
                  </div>
                  <DeliveryStatusBadge status={selectedManifest.deliveryStatus} />
                </div>
                <div className="flex items-start gap-3"><User className="mt-0.5 text-slate-500" size={18} /><div><p className="font-semibold text-slate-800">{selectedManifest.driverName}</p><p className="text-slate-500">{selectedManifest.driverPhone || '-'} | {selectedManifest.vehiclePlate}</p></div></div>
                <div className="flex items-start gap-3"><MapPin className="mt-0.5 text-slate-500" size={18} /><div><p className="text-slate-800">{selectedManifest.origin}</p><p className="text-slate-500">{selectedManifest.destination}</p></div></div>
                <div className="flex items-start gap-3"><Clock className="mt-0.5 text-slate-500" size={18} /><div><p>Departure: {formatDateTime(selectedManifest.departureTime)}</p><p className="text-slate-500">Arrival: {formatDateTime(selectedManifest.arrivalTime)}</p></div></div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Latest Check-in</p>
                  <p className="mt-1 font-semibold text-slate-800">{selectedManifest.latestCheckin?.locationText || '-'}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(selectedManifest.latestCheckin?.checkedInAt)}</p>
                  <CheckinNotes notes={selectedManifest.latestCheckin?.notes} />
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState title="No manifest selected." description="Select a manifest to update delivery progress." />
              </div>
            )}
          </Surface>

          <Surface>
            <SectionHeading title="Driver Tracking Link" description="Use this manifest-specific link for driver GPS tracking." />
            {selectedManifest ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="driver-tracking-link" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    URL
                  </label>
                  <input
                    id="driver-tracking-link"
                    value={driverTrackingUrl}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    type="button"
                    onClick={handleOpenTrackingPage}
                    disabled={!driverTrackingUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <ExternalLink size={16} />
                    Open Tracking Page
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTrackingLink}
                    disabled={!driverTrackingUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {trackingLinkCopied ? <Check size={16} /> : <Copy size={16} />}
                    {trackingLinkCopied ? 'Copied' : 'Copy Tracking Link'}
                  </button>

                  <button
                    type="button"
                    onClick={handleRegenerateTrackingToken}
                    disabled={!driverTrackingUrl || isSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw size={16} />
                    Regenerate Link
                  </button>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold leading-5 text-violet-800">
                  Open this link on the driver's device. For classroom demos, click <span className="font-black">Start Demo Route</span> on the driver page if real GPS permission is unavailable.
                </div>
                {trackingLinkError && (
                  <p className="text-sm font-semibold leading-5 text-rose-700">{trackingLinkError}</p>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState title="No manifest selected." description="Select a manifest to generate a driver tracking link." />
              </div>
            )}
          </Surface>

          <form onSubmit={handleStatusUpdate} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-bold text-slate-800">Update Delivery Status</h3>
            <label htmlFor="delivery-status" className="block text-sm font-semibold text-slate-600">Delivery status</label>
            <select id="delivery-status" value={statusValue} onChange={(event) => setStatusValue(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button type="submit" disabled={!useApi || !selectedManifest || isSaving} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {isSaving ? 'Saving status...' : 'Save Status'}
            </button>
          </form>

          <form onSubmit={handleCheckinSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-slate-800"><AlertCircle size={18} /> Manual Check-in</h3>
            <div className="space-y-3">
              <label htmlFor="checkin-manifest" className="block text-sm font-semibold text-slate-600">Manifest</label>
              <select id="checkin-manifest" value={selectedManifest?.id || ''} onChange={(event) => {
                  const manifest = manifests.find((item) => item.id === event.target.value);
                  setSelectedManifestId(event.target.value);
                  setStatusValue(manifest?.deliveryStatus || 'Prepared');
                  setCheckinStatus(manifest?.deliveryStatus || 'Prepared');
                  setTrackingLinkCopied(false);
                  setTrackingLinkError('');
                }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {filteredManifests.map((manifest) => <option key={manifest.id} value={manifest.id}>{manifest.manifestNumber}</option>)}
              </select>
              <label htmlFor="checkin-status" className="block text-sm font-semibold text-slate-600">Check-in status</label>
              <select id="checkin-status" value={checkinStatus} onChange={(event) => setCheckinStatus(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <label htmlFor="checkin-location" className="block text-sm font-semibold text-slate-600">Location text</label>
              <input id="checkin-location" value={locationText} onChange={(event) => setLocationText(event.target.value)} required placeholder="e.g. Rest Area KM 57" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <label htmlFor="checkin-notes" className="block text-sm font-semibold text-slate-600">Notes</label>
              <textarea id="checkin-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" placeholder="Manual delivery notes" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={!useApi || !selectedManifest || isSaving} className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {isSaving ? 'Saving check-in...' : 'Submit Check-in'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}


