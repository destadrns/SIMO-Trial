export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

export async function sendInviteEmail({ to, name, inviteUrl }) {
  return simulateEmail({ to, name, url: inviteUrl, template: 'account_invite' });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  return simulateEmail({ to, name, url: resetUrl, template: 'password_reset' });
}

function simulateEmail({ to, name, url, template }) {
  void url;
  const smtpConfigured = Boolean(process.env.EMAIL_HOST);
  if (!smtpConfigured) {
    return { delivered: false, mode: 'development-response-only', to, name, template };
  }

  return { delivered: false, mode: 'smtp-not-configured', to, name, template };
}
