import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Clock,
  Compass,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  Play,
  Radio,
  Square,
  Truck,
  WifiOff,
} from 'lucide-react';
import { sendManifestLocation } from '../services/trackingApi';

const TRACKING_INTERVAL_MS = 10000;
const DEMO_ROUTE_INTERVAL_MS = 3000;

const DEMO_ROUTE_POINTS = [
  { latitude: -7.2575, longitude: 112.7521, accuracy: 8, speed: 6.4, heading: 235 },
  { latitude: -7.2638, longitude: 112.7442, accuracy: 9, speed: 7.1, heading: 226 },
  { latitude: -7.2711, longitude: 112.7368, accuracy: 7, speed: 8.2, heading: 219 },
  { latitude: -7.2796, longitude: 112.7293, accuracy: 10, speed: 7.8, heading: 214 },
  { latitude: -7.2879, longitude: 112.7224, accuracy: 8, speed: 6.9, heading: 211 },
  { latitude: -7.2962, longitude: 112.7161, accuracy: 6, speed: 5.8, heading: 208 },
];

const geoOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

function normalizePosition(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
    speed: position.coords.speed ?? null,
    heading: position.coords.heading ?? null,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
  };
}

function formatCoordinate(value) {
  return typeof value === 'number' ? value.toFixed(7) : '-';
}

function formatMetric(value, suffix) {
  return typeof value === 'number' ? `${value.toFixed(1)} ${suffix}` : '-';
}

function formatDateTime(value) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
        <Icon size={18} />
      </div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function DriverTracking() {
  const { manifestId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const trackingToken = searchParams.get('token') || '';
  const [tracking, setTracking] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [currentPosition, setCurrentPosition] = useState(null);
  const [lastSentAt, setLastSentAt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const intervalRef = useRef(null);
  const demoIntervalRef = useRef(null);
  const demoRouteIndexRef = useRef(0);
  const watchIdRef = useRef(null);
  const lastPositionRef = useRef(null);
  const trackingRef = useRef(false);
  const demoModeRef = useRef(false);
  const sendInFlightRef = useRef(false);

  const status = useMemo(() => {
    if (demoMode && isSending) return { label: 'Demo route sending', className: 'border-violet-200 bg-violet-50 text-violet-700' };
    if (demoMode) return { label: 'Demo route active', className: 'border-violet-200 bg-violet-50 text-violet-700' };
    if (tracking && isSending) return { label: 'Sending location', className: 'border-blue-200 bg-blue-50 text-blue-700' };
    if (tracking && currentPosition) return { label: 'Tracking active', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    if (tracking) return { label: 'Waiting for GPS', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    return { label: 'Stopped', className: 'border-slate-200 bg-slate-100 text-slate-700' };
  }, [currentPosition, demoMode, isSending, tracking]);

  const stopTracking = useCallback(() => {
    trackingRef.current = false;
    demoModeRef.current = false;
    setTracking(false);
    setDemoMode(false);

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (demoIntervalRef.current) {
      window.clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }

    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const updatePosition = useCallback((position) => {
    const nextPosition = normalizePosition(position);
    lastPositionRef.current = nextPosition;
    setCurrentPosition(nextPosition);
    setPermissionError('');
    return nextPosition;
  }, []);

  const sendPosition = useCallback(async (position) => {
    if (!position || sendInFlightRef.current) {
      return;
    }

    sendInFlightRef.current = true;
    setIsSending(true);
    setSendError('');

    try {
      await sendManifestLocation(manifestId, {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        speed: position.speed,
        heading: position.heading,
        source: 'driver_geolocation',
      }, trackingToken);
      setLastSentAt(new Date().toISOString());
    } catch (error) {
      if (error?.code === 'NETWORK_ERROR') {
        setSendError('Backend is unavailable. Please make sure the backend server is running.');
      } else {
        setSendError(error?.message || 'Location could not be sent. Please try again.');
      }
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  }, [manifestId, trackingToken]);

  const handleGeoError = useCallback((error) => {
    if (error?.code === error?.PERMISSION_DENIED) {
      setPermissionError('Location permission was denied. Please allow location access to start tracking.');
    } else {
      setPermissionError(error?.message || 'Location could not be read. Please check GPS and browser permissions.');
    }

    stopTracking();
  }, [stopTracking]);

  const startTracking = useCallback(() => {
    if (trackingRef.current || demoModeRef.current) {
      return;
    }

    if (!('geolocation' in navigator)) {
      setPermissionError('Geolocation is not supported by this browser. Use Demo Route for classroom presentation.');
      return;
    }

    setPermissionError('');
    setSendError('');
    setTracking(true);
    trackingRef.current = true;

    const captureAndSend = (position) => {
      const nextPosition = updatePosition(position);
      void sendPosition(nextPosition);
    };

    navigator.geolocation.getCurrentPosition(captureAndSend, handleGeoError, geoOptions);

    watchIdRef.current = navigator.geolocation.watchPosition(
      updatePosition,
      handleGeoError,
      geoOptions,
    );

    intervalRef.current = window.setInterval(() => {
      if (lastPositionRef.current) {
        void sendPosition(lastPositionRef.current);
        return;
      }

      navigator.geolocation.getCurrentPosition(captureAndSend, handleGeoError, geoOptions);
    }, TRACKING_INTERVAL_MS);
  }, [handleGeoError, sendPosition, updatePosition]);

  const startDemoRoute = useCallback(() => {
    if (trackingRef.current || demoModeRef.current) {
      return;
    }

    setPermissionError('');
    setSendError('');
    setDemoMode(true);
    demoModeRef.current = true;
    demoRouteIndexRef.current = 0;

    const sendDemoPoint = () => {
      const point = DEMO_ROUTE_POINTS[demoRouteIndexRef.current];

      if (!point) {
        stopTracking();
        return;
      }

      const nextPosition = {
        ...point,
        capturedAt: new Date().toISOString(),
      };

      lastPositionRef.current = nextPosition;
      setCurrentPosition(nextPosition);
      void sendPosition(nextPosition);
      demoRouteIndexRef.current += 1;
    };

    sendDemoPoint();
    demoIntervalRef.current = window.setInterval(sendDemoPoint, DEMO_ROUTE_INTERVAL_MS);
  }, [sendPosition, stopTracking]);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 font-sans text-slate-800 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg font-black text-white">
                  S
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">SIMO Mugi Jaya</p>
                  <h1 className="truncate text-2xl font-bold text-slate-950">Driver GPS Tracking</h1>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <Truck className="mt-0.5 flex-shrink-0 text-slate-500" size={18} />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivery Manifest</p>
                  <p className="break-all text-sm font-bold text-slate-900">{manifestId}</p>
                </div>
              </div>
            </div>

            <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-bold ${status.className}`}>
              <Radio size={16} />
              {status.label}
            </span>
          </div>
        </header>

        {(permissionError || sendError) && (
          <section className="space-y-3">
            {permissionError && (
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 flex-shrink-0 text-rose-600" size={18} />
                <p className="font-semibold leading-5">{permissionError}</p>
              </div>
            )}
            {sendError && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <WifiOff className="mt-0.5 flex-shrink-0 text-amber-600" size={18} />
                <p className="font-semibold leading-5">{sendError}</p>
              </div>
            )}
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile icon={MapPin} label="Latitude" value={formatCoordinate(currentPosition?.latitude)} />
          <StatTile icon={Navigation} label="Longitude" value={formatCoordinate(currentPosition?.longitude)} />
          <StatTile icon={LocateFixed} label="Accuracy" value={formatMetric(currentPosition?.accuracy, 'm')} />
          <StatTile icon={Gauge} label="Speed" value={formatMetric(currentPosition?.speed, 'm/s')} />
          <StatTile icon={Compass} label="Heading" value={formatMetric(currentPosition?.heading, 'deg')} />
          <StatTile icon={Clock} label="Last Sent" value={formatDateTime(lastSentAt)} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={startTracking}
              disabled={tracking || demoMode}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Play size={18} />
              Start GPS Tracking
            </button>
            <button
              type="button"
              onClick={startDemoRoute}
              disabled={tracking || demoMode}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Navigation size={18} />
              Start Demo Route
            </button>
            <button
              type="button"
              onClick={stopTracking}
              disabled={!tracking && !demoMode}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <Square size={18} />
              Stop
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">
              {isSending ? 'Sending now' : 'Ready'}
            </span>
            <span className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-700">
              Demo route is safe for classroom presentation when real GPS is unavailable.
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

