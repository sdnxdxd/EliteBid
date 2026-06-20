const nodemailer = require('nodemailer');
const { Resend } = require('resend');

require('dotenv').config();

const defaultCompanyEmail = 'verificacion@elitebid.com';
const defaultFrom = `EliteBid <${defaultCompanyEmail}>`;
const defaultSubject = 'Tu codigo de verificacion EliteBid';
const defaultPasswordResetSubject = 'Tu codigo para recuperar la clave EliteBid';
const defaultAccountStatusSubject = 'Validacion de cuenta EliteBid';

function buildVerificationUrl(token) {
  const baseUrl = String(process.env.APP_PUBLIC_URL || `http://127.0.0.1:${process.env.API_PORT || 3001}`).replace(/\/$/, '');
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail({ to, name, token }) {
  const content = buildVerificationContent({ name, code: token });
  return sendMail({
    content,
    fallbackLog: `MAIL_USER/MAIL_PASSWORD o RESEND_API_KEY no configurados. Verificacion pendiente para ${to}: ${token}`,
    subject: process.env.MAIL_VERIFICATION_SUBJECT || defaultSubject,
    to
  });
}

async function sendAccountReviewEmail({ accepted = true, to, name }) {
  const content = buildAccountReviewContent({ accepted, name });
  return sendMail({
    content,
    fallbackLog: `MAIL_USER/MAIL_PASSWORD o RESEND_API_KEY no configurados. Validacion de cuenta pendiente para ${to}`,
    subject: process.env.MAIL_ACCOUNT_STATUS_SUBJECT || defaultAccountStatusSubject,
    to
  });
}

async function sendPasswordResetEmail({ to, name, token }) {
  const content = buildPasswordResetContent({ name, code: token });
  return sendMail({
    content,
    fallbackLog: `MAIL_USER/MAIL_PASSWORD o RESEND_API_KEY no configurados. Recuperacion pendiente para ${to}: ${token}`,
    subject: process.env.MAIL_PASSWORD_RESET_SUBJECT || defaultPasswordResetSubject,
    to
  });
}

async function sendMail({ to, subject, content, fallbackLog }) {
  if (hasSmtpConfig()) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
      },
      connectionTimeout: Number(process.env.SMTP_TIMEOUT_MS || 20000),
      greetingTimeout: Number(process.env.SMTP_TIMEOUT_MS || 20000),
      socketTimeout: Number(process.env.SMTP_TIMEOUT_MS || 20000)
    });

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || `EliteBid <${process.env.MAIL_USER}>`,
      to,
      subject,
      html: content.html,
      text: content.text
    });

    return { sent: true, skipped: false, provider: 'smtp', id: info.messageId };
  }

  if (process.env.RESEND_API_KEY) {
    return sendWithResend({ to, subject, content });
  }

  console.warn(fallbackLog);
  return { sent: false, skipped: true, reason: 'missing_email_provider' };
}

async function sendWithResend({ to, subject, content }) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || defaultFrom,
    to,
    subject,
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
        <p>Hola ${firstName}, este codigo confirma que el email te pertenece.</p>
        <p>Usalo en EliteBid para verificar tu correo y crear tu contrasena definitiva.</p>
        <p style="font-size: 30px; font-weight: 800; letter-spacing: 6px; margin: 24px 0;">${safeCode}</p>
        <p>El codigo vence en 15 minutos. Si no lo pediste, podes ignorar este mensaje.</p>
      </div>
    `,
    text: [
      `Hola ${name || ''}, este codigo confirma que el email te pertenece.`,
      'Usalo en EliteBid para verificar tu correo y crear tu contrasena definitiva.',
      `Codigo: ${code}`,
      'El codigo vence en 15 minutos.'
    ].join('\n\n')
  };
}

function buildAccountReviewContent({ accepted, name }) {
  const firstName = escapeHtml(name || 'tu cuenta');
  const title = accepted ? 'Cuenta aceptada por EliteBid' : 'Cuenta no aceptada por EliteBid';
  const message = accepted
    ? 'La empresa valido tus datos iniciales. En otro mail vas a recibir un codigo para verificar tu correo y crear tu clave.'
    : 'La empresa no pudo aceptar tus datos iniciales. Si crees que es un error, comunicate con EliteBid.';

  return {
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 22px;">${title}</h1>
        <p>Hola ${firstName},</p>
        <p>${message}</p>
      </div>
    `,
    text: [
      `Hola ${name || ''},`,
      title,
      message
    ].join('\n\n')
  };
}

function buildPasswordResetContent({ name, code }) {
  const firstName = escapeHtml(name || 'tu cuenta');
  const safeCode = escapeHtml(code);

  return {
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 22px;">Recuperacion de clave EliteBid</h1>
        <p>Hola ${firstName}, recibimos una solicitud para cambiar tu contrasena.</p>
        <p>Usa este codigo en EliteBid para confirmar el cambio y crear una nueva clave.</p>
        <p style="font-size: 30px; font-weight: 800; letter-spacing: 6px; margin: 24px 0;">${safeCode}</p>
        <p>El codigo vence en 15 minutos. Si no pediste este cambio, ignora este mensaje.</p>
      </div>
    `,
    text: [
      `Hola ${name || ''}, recibimos una solicitud para cambiar tu contrasena en EliteBid.`,
      'Usa este codigo para confirmar el cambio y crear una nueva clave.',
      `Codigo: ${code}`,
      'El codigo vence en 15 minutos. Si no pediste este cambio, ignora este mensaje.'
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
  sendAccountReviewEmail,
  sendPasswordResetEmail,
  sendVerificationEmail
};
