import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionCookieOptions } from '../utils/sessionCookie.js';
import { readCookie } from '../utils/sessionCookie.js';
import { getEmailConfig, sendInviteEmail } from '../utils/email.js';
import { validateEvidenceFile } from '../utils/evidenceStorage.js';

test('production session cookie uses HttpOnly, Secure, and strict SameSite when configured', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecure = process.env.SESSION_COOKIE_SECURE;
  const previousSameSite = process.env.SESSION_COOKIE_SAMESITE;
  process.env.NODE_ENV = 'production';
  delete process.env.SESSION_COOKIE_SECURE;
  delete process.env.SESSION_COOKIE_SAMESITE;

  const options = sessionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'strict');

  process.env.NODE_ENV = previousNodeEnv;
  if (previousSecure == null) delete process.env.SESSION_COOKIE_SECURE; else process.env.SESSION_COOKIE_SECURE = previousSecure;
  if (previousSameSite == null) delete process.env.SESSION_COOKIE_SAMESITE; else process.env.SESSION_COOKIE_SAMESITE = previousSameSite;
});

test('cookie parser reads selected cookie only', () => {
  assert.equal(readCookie({ headers: { cookie: 'foo=bar; simo_session=abc123' } }, 'simo_session'), 'abc123');
});

test('production email without SMTP fails closed', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousHost = process.env.EMAIL_HOST;
  process.env.NODE_ENV = 'production';
  delete process.env.EMAIL_HOST;
  await assert.rejects(
    sendInviteEmail({ to: 'ops@example.com', name: 'Ops', inviteUrl: 'https://example.com/accept?token=raw' }),
    /EMAIL_HOST is required/,
  );
  process.env.NODE_ENV = previousNodeEnv;
  if (previousHost == null) delete process.env.EMAIL_HOST; else process.env.EMAIL_HOST = previousHost;
});

test('SMTP credentials are required when host is configured', () => {
  const previousHost = process.env.EMAIL_HOST;
  const previousUser = process.env.EMAIL_USER;
  const previousPass = process.env.EMAIL_PASS;
  process.env.EMAIL_HOST = 'smtp.example.com';
  process.env.EMAIL_USER = '';
  process.env.EMAIL_PASS = '';

  assert.throws(() => getEmailConfig(), /EMAIL_USER and EMAIL_PASS are required/);

  if (previousHost == null) delete process.env.EMAIL_HOST; else process.env.EMAIL_HOST = previousHost;
  if (previousUser == null) delete process.env.EMAIL_USER; else process.env.EMAIL_USER = previousUser;
  if (previousPass == null) delete process.env.EMAIL_PASS; else process.env.EMAIL_PASS = previousPass;
});

test('evidence validation rejects spoofed image uploads', () => {
  assert.throws(() => validateEvidenceFile({ originalname: 'evidence.png', mimetype: 'image/png', buffer: Buffer.from('not-image') }), /valid JPG, PNG, or WEBP/);
});
