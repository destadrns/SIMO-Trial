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
  const token = window.localStorage.getItem(TOKEN_KEY);
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
      window.localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent('simo-auth-token-cleared'));
    }

    const error = new Error(payload?.error?.message || 'Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.');
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
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

export function resendInvite(userId) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/resend-invite`, {
    method: 'POST',
  });
}

export function changeUserRole(userId, roleId) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ roleId }),
  });
}

export function changeUserStatus(userId, status) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/status`, {
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
