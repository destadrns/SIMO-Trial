const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'simo_session';
const SESSION_MAX_AGE_SECONDS = Number(process.env.SESSION_COOKIE_MAX_AGE_SECONDS || 24 * 60 * 60);

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function secureCookieEnabled() {
  return String(process.env.SESSION_COOKIE_SECURE || isProduction()).toLowerCase() === 'true';
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookieEnabled(),
    sameSite: process.env.SESSION_COOKIE_SAMESITE || (isProduction() ? 'strict' : 'lax'),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
}

export function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const prefix = `${name}=`;
  const cookie = cookies.map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
}
