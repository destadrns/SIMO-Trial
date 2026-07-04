import { createEmailTransporter, getEmailConfig } from '../utils/email.js';

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const lastArg = process.argv.at(-1);
  return lastArg && !lastArg.startsWith('-') && lastArg !== process.argv[1] ? lastArg : null;
}

function safeError(error) {
  const message = String(error?.message || error || 'SMTP error');
  return process.env.EMAIL_PASS ? message.replaceAll(String(process.env.EMAIL_PASS), '[redacted]') : message;
}

async function verify() {
  const config = getEmailConfig();
  if (!config) {
    throw new Error('EMAIL_HOST is not configured. Add SMTP settings to backend/.env.');
  }
  const transporter = createEmailTransporter();
  await transporter.verify();
  console.log(`SMTP verified: ${config.host}:${config.port}`);
}

async function sendTest() {
  const to = argValue('--to');
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error('Usage: npm --prefix backend run smtp:test -- --to alamat.testing@email.com');
  }
  await verify();
  const transporter = createEmailTransporter();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'SIMO Mugi Jaya <no-reply@simo.local>',
    to,
    subject: 'SIMO SMTP Test',
    text: 'SMTP SIMO Mugi Jaya berhasil dikonfigurasi. Email ini tidak berisi token atau credential.',
    html: '<p>SMTP SIMO Mugi Jaya berhasil dikonfigurasi.</p><p>Email ini tidak berisi token atau credential.</p>',
  });
  console.log(`SMTP test email sent to ${to}. Message ID: ${info.messageId || 'n/a'}`);
}

try {
  if (process.argv.includes('--send-test')) {
    await sendTest();
  } else {
    await verify();
  }
} catch (error) {
  console.error(`SMTP verification failed: ${safeError(error)}`);
  process.exitCode = 1;
}
