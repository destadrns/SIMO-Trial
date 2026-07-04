import nodemailer from 'nodemailer';

let transporter;

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  return value == null ? fallback : String(value).toLowerCase() === 'true';
}

export function getEmailConfig() {
  const host = String(process.env.EMAIL_HOST || '').trim();
  if (!host) return null;

  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '');
  if (!user || !pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS are required when EMAIL_HOST is configured.');
  }

  const port = Number(process.env.EMAIL_PORT || 587);
  return {
    host,
    port,
    secure: boolEnv('EMAIL_SECURE', port === 465),
    requireTLS: boolEnv('EMAIL_REQUIRE_TLS', false),
    auth: { user, pass },
  };
}

export function createEmailTransporter() {
  const config = getEmailConfig();
  return config ? nodemailer.createTransport(config) : null;
}

function getTransporter() {
  const config = getEmailConfig();
  if (!config) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport(config);
  }
  return transporter;
}

function emailBody({ name, url, template }) {
  const isInvite = template === 'account_invite';
  const action = isInvite ? 'aktivasi akun' : 'reset password';
  const title = isInvite ? 'Undangan Akun SIMO Mugi Jaya' : 'Reset Password SIMO Mugi Jaya';
  const intro = isInvite
    ? 'Anda diundang untuk membuat akun SIMO Mugi Jaya.'
    : 'Kami menerima permintaan reset password akun SIMO Mugi Jaya.';
  return {
    subject: title,
    text: `Halo ${name || 'User'},\n\n${intro}\n\nGunakan link berikut untuk ${action}. Link hanya berlaku sementara:\n${url}\n\nAbaikan email ini atau hubungi admin jika Anda tidak meminta akses ini.`,
    html: `<p>Halo ${name || 'User'},</p><p>${intro}</p><p><a href="${url}">Buka halaman ${action}</a></p><p>Link hanya berlaku sementara. Abaikan email ini atau hubungi admin jika Anda tidak meminta akses ini.</p>`,
  };
}

export async function sendInviteEmail({ to, name, inviteUrl }) {
  return sendAccountEmail({ to, name, url: inviteUrl, template: 'account_invite' });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  return sendAccountEmail({ to, name, url: resetUrl, template: 'password_reset' });
}

async function sendAccountEmail({ to, name, url, template }) {
  const smtp = getTransporter();
  if (!smtp) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_HOST is required in production. Configure SMTP or transactional email before sending account emails.');
    }
    return { delivered: false, mode: 'development-response-only', to, name, template, previewUrl: url };
  }

  const body = emailBody({ name, url, template });
  const info = await smtp.sendMail({
    from: process.env.EMAIL_FROM || 'SIMO Mugi Jaya <no-reply@example.com>',
    to,
    subject: body.subject,
    text: body.text,
    html: body.html,
  });

  return { delivered: true, mode: 'smtp', to, name, template, messageId: info.messageId };
}
