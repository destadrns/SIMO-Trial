import { apiRequest } from './apiClient';

export function sendManifestLocation(manifestId, payload, trackingToken = '') {
  return apiRequest(`/logistics/manifests/${encodeURIComponent(manifestId)}/locations`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, trackingToken }),
  });
}

export function getLatestManifestLocation(manifestId, trackingToken = '') {
  const searchParams = new URLSearchParams();
  if (trackingToken) searchParams.set('trackingToken', trackingToken);
  const query = searchParams.toString();
  return apiRequest(`/logistics/manifests/${encodeURIComponent(manifestId)}/locations/latest${query ? `?${query}` : ''}`);
}

export function getManifestLocationHistory(manifestId, limit = 50, trackingToken = '') {
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(limit));
  if (trackingToken) searchParams.set('trackingToken', trackingToken);

  return apiRequest(
    `/logistics/manifests/${encodeURIComponent(manifestId)}/locations/history?${searchParams.toString()}`,
  );
}
