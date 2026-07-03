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
    }

    const error = new Error(payload?.error?.message || 'Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.');
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }

  return payload;
}
