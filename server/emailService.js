const nodemailer = require('nodemailer');
const { Resend } = require('resend');

require('dotenv').config();

const defaultCompanyEmail = 'verificacion@elitebid.com';
const defaultFrom = `EliteBid <${defaultCompanyEmail}>`;
const defaultSubject = 'Verifica tu cuenta en EliteBid';

function buildVerificationUrl(token) {
  const baseUrl = String(process.env.APP_PUBLIC_URL || `http://127.0.0.1:${process.env.API_PORT || 3001}`).replace(/\/$/, '');
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail({ to, name, token }) {
  const verificationUrl = buildVerificationUrl(token);
  const content = buildVerificationContent({ name, verificationUrl });

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

function buildVerificationContent({ name, verificationUrl }) {
  const firstName = escapeHtml(name || 'tu cuenta');

  return {
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 22px;">Verifica tu cuenta EliteBid</h1>
        <p>Hola ${firstName}, ya creamos tu cuenta como invitado.</p>
        <p>Para ver precios, agregar medios de pago y participar en subastas, verifica tu email.</p>
        <p>
          <a href="${verificationUrl}" style="background: #111827; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block;">
            Verificar cuenta
          </a>
        </p>
        <p>Si el boton no funciona, copia y pega este enlace en el navegador:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      </div>
    `,
    text: [
      `Hola ${name || ''}, ya creamos tu cuenta como invitado en EliteBid.`,
      'Para ver precios, agregar medios de pago y participar en subastas, verifica tu email.',
      `Verificar cuenta: ${verificationUrl}`
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
