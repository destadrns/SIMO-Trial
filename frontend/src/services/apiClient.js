export const useBackendApi =
  String(import.meta.env.VITE_USE_BACKEND_API || 'true').toLowerCase() === 'true';

const TOKEN_KEY = 'simo-mugi-jaya-token';

const apiHostUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001')
  .replace(/\/$/, '')
  .replace(/\/api$/, '');

function normalizeApiPath(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanPath.startsWith('/api/') ? cleanPath : `/api${cleanPath}`;
}

export async function apiRequest(path, options = {}) {
  const token = window.sessionStorage.getItem(TOKEN_KEY);
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(apiHostUrl + normalizeApiPath(path), {
      ...options,
      headers,
      credentials: 'omit',
    });
  } catch (error) {
    const networkError = new Error('Layanan sedang tidak dapat dihubungi. Silakan coba beberapa saat lagi.');
    networkError.code = 'NETWORK_ERROR';
    networkError.cause = error;
    throw networkError;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }

    const defaultMessage = response.status === 401
      ? 'Sesi Anda sudah berakhir atau tidak valid. Silakan login ulang.'
      : 'Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.';
    const error = new Error(payload?.error?.message || defaultMessage);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    error.isSessionExpired = response.status === 401;
    throw error;
  }

  return payload;
}

export function inviteUser(payload) {
  return apiRequest('/admin/users/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


export function getAdminUsers() {
  return apiRequest('/admin/users');
}

export function changeOwnPassword(payload) {
  return apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resendUserInvite(userId) {
  return apiRequest(`/admin/users/${userId}/resend-invite`, {
    method: 'POST',
  });
}

export function sendUserPasswordReset(userId) {
  return apiRequest(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
  });
}

export function changeUserRole(userId, roleId) {
  return apiRequest(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ roleId }),
  });
}

export function changeUserStatus(userId, status) {
  return apiRequest(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
export function acceptInvite(payload) {
  return apiRequest('/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestPasswordReset(email) {
  return apiRequest('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(payload) {
  return apiRequest('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


export async function apiTextRequest(path, options = {}) {
  const token = window.sessionStorage.getItem(TOKEN_KEY);
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(apiHostUrl + normalizeApiPath(path), { ...options, headers, credentials: 'omit' });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || 'Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.');
    error.status = response.status;
    throw error;
  }
  return { text, headers: response.headers };
}


export async function apiBlobRequest(path, options = {}) {
  const token = window.sessionStorage.getItem(TOKEN_KEY);
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(apiHostUrl + normalizeApiPath(path), { ...options, headers, credentials: 'omit' });
  if (!response.ok) {
    const error = new Error(await response.text() || 'Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.');
    error.status = response.status;
    throw error;
  }
  return { blob: await response.blob(), headers: response.headers };
}
