import { apiRequest } from './apiClient';

export function getLogisticsManifests() {
  return apiRequest('/logistics/manifests');
}

export function getLogisticsManifest(id) {
  return apiRequest(`/logistics/manifests/${encodeURIComponent(id)}`);
}

export function createLogisticsManifest(payload) {
  return apiRequest('/logistics/manifests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


export function regenerateLogisticsTrackingToken(id) {
  return apiRequest(`/logistics/manifests/${encodeURIComponent(id)}/tracking-token/regenerate`, {
    method: 'POST',
  });
}

export function updateLogisticsManifestStatus(id, status) {
  return apiRequest(`/logistics/manifests/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function createDeliveryCheckin(id, payload) {
  return apiRequest(`/logistics/manifests/${encodeURIComponent(id)}/checkins`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
