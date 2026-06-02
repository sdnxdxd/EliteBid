const nodemailer = require('nodemailer');
const { Resend } = require('resend');

require('dotenv').config();

const defaultCompanyEmail = 'verificacion@elitebid.com';
const defaultFrom = `EliteBid <${defaultCompanyEmail}>`;
const defaultSubject = 'Tu codigo de verificacion EliteBid';

function buildVerificationUrl(token) {
  const baseUrl = String(process.env.APP_PUBLIC_URL || `http://127.0.0.1:${process.env.API_PORT || 3001}`).replace(/\/$/, '');
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail({ to, name, token }) {
  const content = buildVerificationContent({ name, code: token });

  if (hasSmtpConfig()) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
      },
      connectionTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000),
      greetingTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000),
      socketTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000)
    });

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || `EliteBid <${process.env.MAIL_USER}>`,
      to,
      subject: process.env.MAIL_VERIFICATION_SUBJECT || defaultSubject,
      html: content.html,
      text: content.text
    });

    return { sent: true, skipped: false, provider: 'smtp', id: info.messageId };
  }

  if (process.env.RESEND_API_KEY) {
    return sendWithResend({ to, content });
  }

  console.warn(`MAIL_USER/MAIL_PASSWORD o RESEND_API_KEY no configurados. Verificacion pendiente para ${to}: ${token}`);
  return { sent: false, skipped: true, reason: 'missing_email_provider' };
}

async function sendWithResend({ to, content }) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || defaultFrom,
    to,
    subject: process.env.MAIL_VERIFICATION_SUBJECT || defaultSubject,
    html: content.html,
    text: content.text
  });

  if (error) {
    throw new Error(error.message || 'Resend no pudo enviar el email.');
  }

  return { sent: true, skipped: false, provider: 'resend', id: data?.id };
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_USER && process.env.MAIL_PASSWORD);
}

function buildVerificationContent({ name, code }) {
  const firstName = escapeHtml(name || 'tu cuenta');
  const safeCode = escapeHtml(code);

  return {
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 22px;">Codigo de verificacion EliteBid</h1>
        <p>Hola ${firstName}, ya creamos tu cuenta como invitado.</p>
        <p>Usa este codigo de un solo uso en EliteBid para crear tu contrasena definitiva y verificar la cuenta.</p>
        <p style="font-size: 30px; font-weight: 800; letter-spacing: 6px; margin: 24px 0;">${safeCode}</p>
        <p>El codigo vence en 15 minutos. Si no lo pediste, podes ignorar este mensaje.</p>
      </div>
    `,
    text: [
      `Hola ${name || ''}, ya creamos tu cuenta como invitado en EliteBid.`,
      'Usa este codigo de un solo uso para crear tu contrasena definitiva y verificar la cuenta.',
      `Codigo: ${code}`,
      'El codigo vence en 15 minutos.'
    ].join('\n\n')
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  buildVerificationUrl,
  sendVerificationEmail
};
