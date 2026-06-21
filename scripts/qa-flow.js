const mysql = require('mysql2/promise');

require('dotenv').config();

process.env.SMTP_HOST = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
process.env.RESEND_API_KEY = '';
process.env.SMTP_TIMEOUT_MS = process.env.QA_SMTP_TIMEOUT_MS || '1000';
process.env.MAIL_RESPONSE_TIMEOUT_MS = process.env.QA_SMTP_TIMEOUT_MS || '1000';

const app = require('../server');
const { getPool } = require('../server/db');
const { initDatabase } = require('../server/initDatabase');
const { hashPassword } = require('../server/passwordHash');

const PORT = Number(process.env.QA_API_PORT || 3999);
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const RUN_ID = Date.now();
const PASSWORD = 'QaFlow!2203';
const RESET_PASSWORD = 'QaFlow!3304';
const QA_GUARANTEE_AMOUNT = 10000000;
const OTP = '654321';
const RESET_OTP = '987654';

let server;

function logOk(label) {
  console.log(`OK ${label}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function expectReject(label, fn, expectedText = '') {
  try {
    await fn();
  } catch (error) {
    if (expectedText && !String(error.message).toLowerCase().includes(expectedText.toLowerCase())) {
      throw new Error(`${label}: rechazo inesperado "${error.message}"`);
    }
    logOk(label);
    return;
  }

  throw new Error(`${label}: se esperaba rechazo`);
}

async function createDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'elitebid',
    multipleStatements: true
  });
}

async function setOtp(db, email, code = OTP, minutes = 15) {
  const hash = await hashPassword(code);
  await db.query(
    'UPDATE usuarios SET verification_code_hash = ?, verification_code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE email = ?',
    [hash, minutes, email]
  );
}

async function setPasswordResetCode(db, email, code = RESET_OTP, minutes = 15) {
  const hash = await hashPassword(code);
  await db.query(
    'UPDATE usuarios SET password_reset_code_hash = ?, password_reset_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE email = ?',
    [hash, minutes, email]
  );
}

async function registerGuest(db, index, overrides = {}) {
  const documentType = overrides.documentType || 'dni';
  const email = `qa.robust.${RUN_ID}.${index}@example.com`;
  const body = {
    email,
    firstName: overrides.firstName || 'qa',
    lastName: overrides.lastName || 'robustez',
    documentType,
    documentNumber: documentType === 'dni' ? String(RUN_ID).slice(-7) + index : `AR${RUN_ID}${index}`.slice(0, 12),
    documentFrontUri: 'file:///qa/document-front.jpg',
    ...(documentType === 'dni' ? { documentBackUri: 'file:///qa/document-back.jpg' } : {}),
    ...overrides
  };

  const user = await request('/auth/register-guest', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  await setOtp(db, email);

  return { ...user, email };
}

async function verifyGuest(db, guest) {
  await setOtp(db, guest.email);
  const verified = await request('/auth/complete-verification', {
    method: 'POST',
    token: guest.sessionToken,
    body: JSON.stringify({
      email: guest.email,
      code: OTP,
      password: PASSWORD,
      confirmPassword: PASSWORD
    })
  });

  if (verified.rol !== 'cliente' || verified.estado !== 'activo') {
    throw new Error('La verificacion no activo la cuenta');
  }

  return verified;
}

function guestRegistrationPayload(index, overrides = {}) {
  const documentType = overrides.documentType || 'dni';
  const documentNumber =
    overrides.documentNumber ||
    (documentType === 'dni' ? `72${String(RUN_ID).slice(-5)}${String(index).padStart(3, '0')}` : `ARQA${RUN_ID}${index}`.slice(0, 14));

  return {
    email: `qa.robust.${RUN_ID}.auth.${index}@example.com`,
    firstName: 'qa',
    lastName: 'registro',
    documentType,
    documentNumber,
    documentFrontUri: 'file:///qa/document-front.jpg',
    ...(documentType === 'dni' ? { documentBackUri: 'file:///qa/document-back.jpg' } : {}),
    ...overrides
  };
}

async function registerGuestPayload(db, index, overrides = {}) {
  const body = guestRegistrationPayload(index, overrides);
  const user = await request('/auth/register-guest', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  await setOtp(db, user.email || body.email);
  return { ...body, ...user, rawEmail: body.email, email: user.email || body.email };
}

async function assertStoredUser(db, email, expected = {}) {
  const [rows] = await db.query(
    `SELECT u.email, u.nombre AS firstName, u.rol, u.estado,
      p.nombre AS fullName, p.documento AS documentNumber, p.tipo_documento AS documentType,
      d.frente_uri AS frontUri, d.dorso_uri AS backUri
     FROM usuarios u
     JOIN personas p ON p.identificador = u.cliente_id
     LEFT JOIN documentos_identidad d ON d.persona_id = p.identificador
     WHERE lower(u.email) = ?
     LIMIT 1`,
    [email.toLowerCase()]
  );
  if (!rows.length) throw new Error(`No se encontro usuario ${email}`);
  const row = rows[0];

  for (const [key, value] of Object.entries(expected)) {
    if (String(row[key]) !== String(value)) {
      throw new Error(`${email}: ${key} esperado "${value}", obtenido "${row[key]}"`);
    }
  }

  return row;
}

async function runAuthRegistrationMatrix(db) {
  await expectReject('auth 01 registro sin email rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(101, { email: '' }))
    }), 'correo');
  await expectReject('auth 02 registro email invalido rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(102, { email: 'correo-invalido' }))
    }), 'correo valido');
  await expectReject('auth 03 registro sin nombre rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(103, { firstName: '' }))
    }), 'nombre');
  await expectReject('auth 04 registro nombre con numeros rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(104, { firstName: 'Juan123' }))
    }), 'nombre valido');
  await expectReject('auth 05 registro sin apellido rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(105, { lastName: '' }))
    }), 'apellido');
  await expectReject('auth 06 registro apellido con simbolos rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(106, { lastName: 'Perez@' }))
    }), 'apellido valido');
  await expectReject('auth 07 registro sin documento rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(107, { documentNumber: '' }))
    }), 'documento');
  await expectReject('auth 08 registro dni corto rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(108, { documentNumber: '123' }))
    }), 'documento valido');
  await expectReject('auth 09 registro dni largo rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(109, { documentNumber: '1234567890123' }))
    }), 'documento valido');
  await expectReject('auth 10 registro dni sin frente rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(110, { documentFrontUri: '' }))
    }), 'frente');
  await expectReject('auth 11 registro dni sin dorso rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(111, { documentBackUri: '' }))
    }), 'dorso');
  await expectReject('auth 12 registro uri javascript rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(112, { documentFrontUri: 'javascript:alert(1)' }))
    }), 'frente');
  await expectReject('auth 13 pasaporte corto rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(113, { documentType: 'pasaporte', documentNumber: 'AB12' }))
    }), 'pasaporte valido');
  await expectReject('auth 14 tipo desconocido cae a dni y exige dorso', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify({
        ...guestRegistrationPayload(114, { documentType: 'cedula' }),
        documentBackUri: ''
      })
    }), 'dorso');

  const normalizedGuest = await registerGuestPayload(db, 115, {
    email: `  QA.Robust.${RUN_ID}.AUTH.115@Example.COM  `,
    firstName: 'santiago',
    lastName: 'santiago',
    documentNumber: '12.345.675'
  });
  const normalizedStored = await assertStoredUser(db, normalizedGuest.email, {
    email: `qa.robust.${RUN_ID}.auth.115@example.com`,
    firstName: 'Santiago',
    fullName: 'Santiago Santiago',
    documentNumber: '12345675',
    documentType: 'dni',
    rol: 'invitado',
    estado: 'pendiente'
  });
  if (normalizedStored.frontUri !== 'file:///qa/document-front.jpg' || normalizedStored.backUri !== 'file:///qa/document-back.jpg') {
    throw new Error('DNI valido no guardo frente y dorso correctamente');
  }
  logOk('auth 15 registro normaliza email nombre apellido y dni');

  const passportGuest = await registerGuestPayload(db, 116, {
    documentType: 'pasaporte',
    documentNumber: ' ar-qa 9988 ',
    documentBackUri: ''
  });
  const passportStored = await assertStoredUser(db, passportGuest.email, {
    documentNumber: 'ARQA9988',
    documentType: 'pasaporte'
  });
  if (passportStored.frontUri !== passportStored.backUri) {
    throw new Error('Pasaporte valido no reutilizo la foto frontal como dorso interno');
  }
  logOk('auth 16 pasaporte valido acepta solo frente');

  await expectReject('auth 17 email duplicado rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(117, { email: normalizedGuest.email }))
    }), 'correo ya esta registrado');
  await expectReject('auth 18 documento duplicado rechazado', () =>
    request('/auth/register-guest', {
      method: 'POST',
      body: JSON.stringify(guestRegistrationPayload(118, { documentNumber: '12345675' }))
    }), 'documento');
  await expectReject('auth 19 login vacio rechazado', () =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: '', password: '' })
    }), 'correo y clave');
  await expectReject('auth 20 login email inexistente rechazado', () =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: `qa.robust.${RUN_ID}.noexiste@example.com`, password: PASSWORD })
    }), 'incorrectos');
  await expectReject('auth 21 invitado con codigo incorrecto rechazado', () =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, password: '000000' })
    }), 'codigo');

  const pendingLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ` QA.ROBUST.${RUN_ID}.AUTH.115@EXAMPLE.COM `, password: OTP })
  });
  if (pendingLogin.rol !== 'invitado' || pendingLogin.estado !== 'pendiente' || !pendingLogin.sessionToken) {
    throw new Error('Login de invitado con OTP vigente no devolvio sesion pendiente');
  }
  logOk('auth 22 invitado puede loguear con otp vigente y email normalizado');

  await expectReject('auth 23 completar verificacion email invalido rechazado', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'mal', code: OTP, password: PASSWORD, confirmPassword: PASSWORD })
    }), 'correo');
  await expectReject('auth 24 completar verificacion codigo corto rechazado', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: '123', password: PASSWORD, confirmPassword: PASSWORD })
    }), 'codigo');
  await expectReject('auth 25 completar verificacion codigo incorrecto rechazado', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: '123456', password: PASSWORD, confirmPassword: PASSWORD })
    }), 'codigo ingresado');
  await expectReject('auth 26 password corta rechazada', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: 'A1!', confirmPassword: 'A1!' })
    }), 'clave');
  await expectReject('auth 27 password sin numero rechazada', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: 'Clave!!!!', confirmPassword: 'Clave!!!!' })
    }), 'clave');
  await expectReject('auth 28 password sin letra rechazada', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: '1234567!', confirmPassword: '1234567!' })
    }), 'clave');
  await expectReject('auth 29 password sin simbolo rechazada', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: 'Clave1234', confirmPassword: 'Clave1234' })
    }), 'clave');
  await expectReject('auth 30 password con espacios rechazada', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: 'Clave 123!', confirmPassword: 'Clave 123!' })
    }), 'espacios');
  await expectReject('auth 31 password confirmacion distinta rechazada', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: PASSWORD, confirmPassword: 'Otra!2203' })
    }), 'coinciden');

  const verifiedNormalized = await request('/auth/complete-verification', {
    method: 'POST',
    token: pendingLogin.sessionToken,
    body: JSON.stringify({
      email: normalizedGuest.email,
      code: OTP,
      password: PASSWORD,
      confirmPassword: PASSWORD
    })
  });
  if (verifiedNormalized.rol !== 'cliente' || verifiedNormalized.estado !== 'activo') {
    throw new Error('Verificacion valida no activo la cuenta normalizada');
  }
  logOk('auth 32 completar verificacion valida activa cliente');

  await expectReject('auth 33 no permite verificar dos veces', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, code: OTP, password: PASSWORD, confirmPassword: PASSWORD })
    }), 'pendiente');
  await expectReject('auth 34 login cliente con clave incorrecta rechazado', () =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, password: 'Mal!2203' })
    }), 'incorrectos');

  const activeLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ` ${normalizedGuest.email.toUpperCase()} `, password: PASSWORD })
  });
  if (activeLogin.rol !== 'cliente' || activeLogin.estado !== 'activo' || !activeLogin.sessionToken) {
    throw new Error('Login cliente activo no devolvio sesion');
  }
  logOk('auth 35 login cliente activo con email normalizado');

  const expiredGuest = await registerGuestPayload(db, 119);
  await db.query(
    'UPDATE usuarios SET verification_code_hash = ?, verification_code_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE email = ?',
    [await hashPassword(OTP), expiredGuest.email]
  );
  await expectReject('auth 36 otp vencido rechaza login invitado', () =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: expiredGuest.email, password: OTP })
    }), 'vencio');
  await expectReject('auth 37 otp vencido rechaza completar verificacion', () =>
    request('/auth/complete-verification', {
      method: 'POST',
      body: JSON.stringify({ email: expiredGuest.email, code: OTP, password: PASSWORD, confirmPassword: PASSWORD })
    }), 'vencio');

  await request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email: expiredGuest.email })
  });
  const [resentByEmail] = await db.query(
    'SELECT verification_code_expires_at > UTC_TIMESTAMP() AS activeCode FROM usuarios WHERE email = ?',
    [expiredGuest.email]
  );
  if (!Number(resentByEmail[0]?.activeCode)) throw new Error('Reenvio por email no genero codigo vigente');
  logOk('auth 38 reenvio por email renueva otp');

  const resendByDocumentGuest = await registerGuestPayload(db, 120, { documentNumber: '76.543.219' });
  await request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ documentNumber: '76.543.219' })
  });
  const [resentByDocument] = await db.query(
    'SELECT verification_code_expires_at > UTC_TIMESTAMP() AS activeCode FROM usuarios WHERE email = ?',
    [resendByDocumentGuest.email]
  );
  if (!Number(resentByDocument[0]?.activeCode)) throw new Error('Reenvio por documento no genero codigo vigente');
  logOk('auth 39 reenvio por documento funciona');

  await expectReject('auth 40 reenvio cuenta inexistente rechazado', () =>
    request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: `qa.robust.${RUN_ID}.faltante@example.com` })
    }), 'no encontramos');
  await expectReject('auth 41 reenvio cuenta ya activa rechazado', () =>
    request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email })
    }), 'no encontramos');
  await expectReject('auth 42 reset email inexistente rechazado', () =>
    request('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({
        email: `qa.robust.${RUN_ID}.faltante@example.com`
      })
    }), 'no encontramos');
  await expectReject('auth 43 reset sin codigo solicitado rechazado', () =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: normalizedGuest.email,
        code: RESET_OTP,
        password: RESET_PASSWORD,
        confirmPassword: RESET_PASSWORD
      })
    }), 'solicita');

  const resetRequest = await request('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: normalizedGuest.email })
  });
  if (!resetRequest.ok) throw new Error('Solicitud de reset no devolvio ok');
  await setPasswordResetCode(db, normalizedGuest.email);
  logOk('auth 44 reset solicita codigo por mail');

  await expectReject('auth 45 reset codigo incorrecto rechazado', () =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: normalizedGuest.email,
        code: '111111',
        password: RESET_PASSWORD,
        confirmPassword: RESET_PASSWORD
      })
    }), 'codigo');
  await expectReject('auth 46 reset password confirmacion distinta rechazado', () =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: normalizedGuest.email,
        code: RESET_OTP,
        password: RESET_PASSWORD,
        confirmPassword: 'Otra!3304'
      })
    }), 'coinciden');

  await request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizedGuest.email,
      code: RESET_OTP,
      password: RESET_PASSWORD,
      confirmPassword: RESET_PASSWORD
    })
  });
  await expectReject('auth 47 reset invalida clave anterior', () =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedGuest.email, password: PASSWORD })
    }), 'incorrectos');
  const resetLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: normalizedGuest.email, password: RESET_PASSWORD })
  });
  if (resetLogin.rol !== 'cliente' || resetLogin.estado !== 'activo') {
    throw new Error('Login con clave reseteada no funciono');
  }
  logOk('auth 48 reset permite login con clave nueva');

  const documentLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ documentNumber: '12.345.675', password: RESET_PASSWORD })
  });
  if (documentLogin.rol !== 'cliente' || documentLogin.estado !== 'activo') {
    throw new Error('Login por documento no funciono');
  }
  logOk('auth 49 login por documento compatible con pdf');

  const sessionState = await request('/auth/estado', { token: documentLogin.sessionToken });
  if (!sessionState || sessionState.rol !== 'cliente') {
    throw new Error('/auth/estado no devolvio sesion activa');
  }
  logOk('auth 50 estado de sesion compatible con pdf');

  const phaseOne = await request('/auth/registro/fase1', {
    method: 'POST',
    body: JSON.stringify(guestRegistrationPayload(121, {
      email: `qa.robust.${RUN_ID}.fase1@example.com`,
      nombre: 'lucia',
      apellido: 'fase',
      tipoDocumento: 'dni',
      dni: '77.654.321',
      documentos: ['file:///qa/document-front.jpg', 'file:///qa/document-back.jpg']
    }))
  });
  if (!phaseOne.registrationId || phaseOne.estado !== 'pendiente') {
    throw new Error('Registro fase1 PDF no devolvio estado pendiente');
  }
  const phaseTwo = await request('/auth/registro/fase2', {
    method: 'POST',
    body: JSON.stringify({
      registrationId: phaseOne.registrationId,
      password: PASSWORD,
      confirmPassword: PASSWORD
    })
  });
  if (phaseTwo.rol !== 'cliente' || phaseTwo.estado !== 'activo') {
    throw new Error('Registro fase2 PDF no activo cliente');
  }
  logOk('auth 51 registro fase1/fase2 compatible con pdf');
}

async function cleanup(db, touched = {}) {
  if (touched.itemId && touched.previousBid != null) {
    await restoreTouchedItem(db, {
      itemId: touched.itemId,
      previousBid: touched.previousBid,
      previousSubastado: touched.previousSubastado
    });
  }
  for (const item of touched.extraItems || []) {
    await restoreTouchedItem(db, item);
  }
  if (touched.auctionId && touched.previousAuctionStatus) {
    await db.query('UPDATE subastas SET estado = ? WHERE identificador = ?', [
      touched.previousAuctionStatus,
      touched.auctionId
    ]);
  }
  for (const auction of touched.extraAuctions || []) {
    await db.query('UPDATE subastas SET estado = ? WHERE identificador = ?', [
      auction.previousAuctionStatus,
      auction.auctionId
    ]);
  }

  const [rows] = await db.query(
    "SELECT id, cliente_id AS clienteId FROM usuarios WHERE email LIKE 'qa.robust.%@example.com'"
  );

  for (const row of rows) {
    const [generatedAuctions] = await db.query(
      `SELECT subasta_generada AS auctionId
       FROM solicitudes_lotes
       WHERE cliente = ? AND subasta_generada IS NOT NULL`,
      [row.clienteId]
    );
    for (const generated of generatedAuctions) {
      await db.query(
        `DELETE f FROM fotos f
         JOIN productos p ON p.identificador = f.producto
         JOIN items_catalogo i ON i.producto = p.identificador
         JOIN catalogos c ON c.identificador = i.catalogo
         WHERE c.subasta = ?`,
        [generated.auctionId]
      );
      await db.query(
        `DELETE i FROM items_catalogo i
         JOIN catalogos c ON c.identificador = i.catalogo
         WHERE c.subasta = ?`,
        [generated.auctionId]
      );
      await db.query('DELETE FROM catalogos WHERE subasta = ?', [generated.auctionId]);
      await db.query(
        `DELETE p FROM productos p
         LEFT JOIN items_catalogo i ON i.producto = p.identificador
         WHERE p.duenio = ? AND i.identificador IS NULL`,
        [row.clienteId]
      );
      await db.query('DELETE FROM subastas WHERE identificador = ?', [generated.auctionId]);
    }
    await db.query(
      'DELETE fl FROM fotos_lote fl JOIN solicitudes_lotes sl ON sl.identificador = fl.solicitud WHERE sl.cliente = ?',
      [row.clienteId]
    );
    await db.query('DELETE FROM solicitudes_lotes WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM registro_de_subasta WHERE cliente = ?', [row.clienteId]);
    await db.query(
      'DELETE pf FROM penalidad_falta_fondos pf JOIN penalidades p ON p.identificador = pf.penalidad WHERE p.cliente = ?',
      [row.clienteId]
    );
    await db.query('DELETE FROM penalidades WHERE cliente = ?', [row.clienteId]);
    await db.query(
      'DELETE p FROM pujos p JOIN asistentes a ON a.identificador = p.asistente WHERE a.cliente = ?',
      [row.clienteId]
    );
    await db.query('DELETE FROM favoritos WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM asistentes WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM medios_pago WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM sesiones WHERE usuario_id = ?', [row.id]);
    await db.query('DELETE FROM usuarios WHERE id = ?', [row.id]);
    await db.query('DELETE FROM documentos_identidad WHERE persona_id = ?', [row.clienteId]);
    await db.query('DELETE FROM duenios WHERE identificador = ?', [row.clienteId]);
    await db.query('DELETE FROM clientes WHERE identificador = ?', [row.clienteId]);
    await db.query('DELETE FROM personas WHERE identificador = ?', [row.clienteId]);
  }

  await resetAutoIncrement(db, 'usuarios', 'id');
  await resetAutoIncrement(db, 'personas', 'identificador');
  await resetAutoIncrement(db, 'documentos_identidad', 'identificador');
}

async function restoreTouchedItem(db, touchedItem) {
  await db.query(
    `UPDATE items_catalogo
     SET puja_actual = ?, subastado = COALESCE(?, subastado),
       timer_inicio = NULL, timer_vencimiento = NULL,
       cierre_estado = COALESCE(?, 'esperando_puja'), cierre_motivo = ?
     WHERE identificador = ?`,
    [
      touchedItem.previousBid,
      touchedItem.previousSubastado ?? null,
      touchedItem.previousClosureStatus ?? null,
      touchedItem.previousClosureReason ?? null,
      touchedItem.itemId
    ]
  );
}

async function resetAutoIncrement(db, table, primaryKey) {
  const [rows] = await db.query(`SELECT COALESCE(MAX(${primaryKey}), 0) + 1 AS nextId FROM ${table}`);
  const nextId = Math.max(1, Number(rows[0]?.nextId || 1));
  await db.query(`ALTER TABLE ${table} AUTO_INCREMENT = ${nextId}`);
}

function validLotPayload() {
  return {
    title: 'Lote QA Robustez',
    lotKind: 'unico',
    itemType: 'Antiguedad',
    quantity: 1,
    estimatedValue: 900000,
    composition: '',
    description: 'Lote de prueba automatizada para validar carga de ventas.',
    condition: 'Muy buen estado general, con marcas leves de uso.',
    history: 'Pieza familiar con historia documentada.',
    legalOrigin: 'Factura y declaracion jurada disponibles.',
    payoutBank: 'Banco QA',
    payoutAccountHolder: 'Qa Robustez',
    payoutReference: 'qa.robustez',
    ownershipDeclaration: true,
    returnChargeAccepted: true,
    photoUris: Array.from({ length: 6 }, (_, index) => `file:///qa/lote-${index + 1}.jpg`)
  };
}

function validCollectionPayload() {
  const first = validLotPayload();
  return {
    ...first,
    title: 'Coleccion QA de Diseno',
    items: [
      {
        title: 'Silla QA de autor',
        itemType: 'Diseno',
        quantity: 1,
        estimatedValue: 120000,
        description: 'Silla de autor con estructura original.',
        condition: 'Estado muy bueno con marcas menores.',
        history: 'Pieza adquirida en galeria local.',
        photoUris: Array.from({ length: 6 }, (_, index) => `file:///qa/coleccion-silla-${index + 1}.jpg`)
      },
      {
        title: 'Lampara QA industrial',
        itemType: 'Diseno',
        quantity: 1,
        estimatedValue: 90000,
        description: 'Lampara industrial restaurada.',
        condition: 'Funcionamiento probado y restauracion documentada.',
        history: 'Objeto familiar con factura disponible.',
        photoUris: Array.from({ length: 6 }, (_, index) => `file:///qa/coleccion-lampara-${index + 1}.jpg`)
      }
    ]
  };
}

function futureDate(days = 20) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}

function todaySlashDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${now.getFullYear()}`;
}

async function main() {
  await initDatabase();
  server = app.listen(PORT, '127.0.0.1');
  const db = await createDb();
  const touched = {};
  await cleanup(db);

  try {
    await request('/health');
    logOk('api health');

    await runAuthRegistrationMatrix(db);

    await expectReject('dni exige frente y dorso', () =>
      request('/auth/register-guest', {
        method: 'POST',
        body: JSON.stringify({
          email: `qa.robust.${RUN_ID}.missing-back@example.com`,
          firstName: 'qa',
          lastName: 'sin dorso',
          documentType: 'dni',
          documentNumber: String(RUN_ID).slice(-8),
          documentFrontUri: 'file:///qa/document-front.jpg'
        })
      }), 'dorso');

    const pendingPassport = await registerGuest(db, 1, { documentType: 'pasaporte' });
    if (pendingPassport.rol !== 'invitado' || pendingPassport.estado !== 'pendiente') {
      throw new Error('Pasaporte no quedo como invitado pendiente');
    }
    logOk('pasaporte acepta una sola foto');

    await expectReject('invitado no ve subasta activa', async () => {
      const [activeRows] = await db.query("SELECT identificador AS id FROM subastas WHERE estado = 'abierta' LIMIT 1");
      if (!activeRows.length) throw new Error('No hay subasta activa para probar invitado');
      await request(`/auctions/${activeRows[0].id}?clienteId=${pendingPassport.clienteId}`, {
        token: pendingPassport.sessionToken
      });
    }, 'invitado');

    await db.query(
      'UPDATE usuarios SET verification_code_hash = ?, verification_code_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE email = ?',
      [await hashPassword('111111'), pendingPassport.email]
    );
    await expectReject('codigo vencido no permite login', () =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: pendingPassport.email, password: '111111' })
      }), 'vencio');

    await request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: pendingPassport.email })
    });
    const [resendRows] = await db.query(
      'SELECT id FROM usuarios WHERE email = ? AND verification_code_expires_at > UTC_TIMESTAMP()',
      [pendingPassport.email]
    );
    if (!resendRows.length) throw new Error('El reenvio no dejo un codigo vigente');
    logOk('reenvio de OTP sin sesion');

    const userA = await verifyGuest(db, await registerGuest(db, 2));
    let userB = await verifyGuest(db, await registerGuest(db, 3));
    logOk('verificacion de dos cuentas cliente');

    const publicCatalog = await request(`/auctions?clienteId=${userA.clienteId}`);
    if (publicCatalog.some((auction) => auction.basePrice !== null || auction.status !== 'programada')) {
      throw new Error('Catalogo publico filtro mal precios o estados');
    }
    const publicUpcoming = publicCatalog[0];
    if (!publicUpcoming) throw new Error('No hay subastas futuras publicas para QA');
    const publicDetail = await request(`/auctions/${publicUpcoming.id}`);
    if (!Array.isArray(publicDetail.catalog) || publicDetail.catalog.length < 2) {
      throw new Error('El catalogo publico no expone la lista de productos');
    }
    if (publicDetail.catalog.some((item) => item.basePrice !== null || item.currentBid !== null || item.commission !== null)) {
      throw new Error('El catalogo publico revelo precios reservados');
    }
    logOk('clienteId sin sesion no revela precios');

    await expectReject('perfil sin sesion bloqueado', () =>
      request(`/users/${userA.clienteId}/profile`), 'sesion');
    await expectReject('sesion ajena no opera otra cuenta', () =>
      request(`/users/${userA.clienteId}/payments`, { token: userB.sessionToken }), 'permisos');

    await expectReject('reset con clave debil rechazado', () =>
      request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: userB.email,
          code: RESET_OTP,
          password: 'simple',
          confirmPassword: 'simple'
        })
      }), 'clave');
    await request('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: userB.email })
    });
    await setPasswordResetCode(db, userB.email);
    await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: userB.email,
        code: RESET_OTP,
        password: RESET_PASSWORD,
        confirmPassword: RESET_PASSWORD
      })
    });
    await expectReject('login con clave anterior rechazado tras reset', () =>
      request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: userB.email, password: PASSWORD })
      }), 'incorrectos');
    userB = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: userB.email, password: RESET_PASSWORD })
    });
    logOk('reset password invalida sesiones y acepta clave nueva');

    const pdfProfile = await request('/usuarios/me', { token: userA.sessionToken });
    if (!pdfProfile.email || pdfProfile.categoria == null) throw new Error('/usuarios/me no devolvio perfil legacy');
    logOk('pdf usuarios/me devuelve perfil');

    const pdfProfileUpdate = await request('/usuarios/me', {
      method: 'PUT',
      token: userA.sessionToken,
      body: JSON.stringify({
        email: userA.email,
        direccion: 'Av Siempre Viva 742'
      })
    });
    if (!pdfProfileUpdate.email) throw new Error('PUT /usuarios/me no devolvio perfil actualizado');
    logOk('pdf usuarios/me permite actualizar datos editables');

    const pdfStats = await request('/usuarios/me/estadisticas', { token: userA.sessionToken });
    if (pdfStats.currentCategory == null) throw new Error('/usuarios/me/estadisticas no devolvio categoria');
    logOk('pdf estadisticas compatible');

    const pdfActivity = await request('/usuarios/me/actividad-reciente', { token: userA.sessionToken });
    if (!Array.isArray(pdfActivity)) throw new Error('/usuarios/me/actividad-reciente no devolvio lista');
    logOk('pdf actividad reciente compatible');

    await expectReject('pago invalido rechazado', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'tarjeta',
          amount: 100000,
          cardHolder: 'qa robustez',
          cardNumber: '4111111111111111',
          expiry: '12/30',
          cvv: '12'
        })
      }), 'cvv');
    await expectReject('tarjeta con demasiados numeros rechazada', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'tarjeta',
          amount: 100000,
          cardHolder: 'qa robustez',
          cardNumber: '41111111111111111199',
          expiry: '12/30',
          cvv: '123'
        })
      }), 'tarjeta');
    await expectReject('cheque con fecha futura rechazado', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'cheque',
          amount: 100000,
          bank: 'Banco QA',
          checkNumber: '123456',
          issueDate: '31/12/2099',
          checkImageUri: 'file:///qa/cheque.jpg'
        })
      }), 'futura');
    await expectReject('cheque con numero en cero rechazado', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'cheque',
          amount: 100000,
          bank: 'Banco QA',
          checkNumber: '000000',
          issueDate: todaySlashDate(),
          checkImageUri: 'file:///qa/cheque.jpg'
        })
      }), 'ceros');
    await expectReject('cheque con fecha inexistente rechazado', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'cheque',
          amount: 100000,
          bank: 'Banco QA',
          checkNumber: '123456',
          issueDate: '31/02/2026',
          checkImageUri: 'file:///qa/cheque.jpg'
        })
      }), 'fecha');
    await expectReject('cheque con banco invalido rechazado', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'cheque',
          amount: 100000,
          bank: '12345',
          checkNumber: '123456',
          issueDate: todaySlashDate(),
          checkImageUri: 'file:///qa/cheque.jpg'
        })
      }), 'banco');
    await expectReject('cuenta con banco invalido rechazada', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'cuenta',
          amount: 100000,
          bank: '@@@',
          accountType: 'Caja de ahorro',
          cbu: '1234567890123456789012',
          alias: 'qa.banco.demo'
        })
      }), 'banco');
    await expectReject('moneda de pago invalida rechazada', () =>
      request(`/users/${userA.clienteId}/payments`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          type: 'tarjeta',
          currency: 'EUR',
          amount: 100000,
          cardHolder: 'qa robustez',
          cardNumber: '4111111111111111',
          expiry: '12/30',
          cvv: '123'
        })
      }), 'moneda');

    await request(`/users/${userA.clienteId}/payments`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: QA_GUARANTEE_AMOUNT,
        cardHolder: 'qa robustez',
        cardNumber: '4111111111111111',
        expiry: '12/30',
        cvv: '123'
      })
    });
    logOk('pago valido agregado');
    await request(`/users/${userA.clienteId}/payments`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({
        type: 'cuenta',
        currency: 'USD',
        amount: 250000,
        bank: 'Banco Exterior QA',
        accountType: 'Cuenta internacional',
        cbu: '1234567890123456789012',
        alias: 'qa.usd.demo'
      })
    });
    const usdPaymentRows = await request(`/users/${userA.clienteId}/payments`, { token: userA.sessionToken });
    if (!usdPaymentRows.some((payment) => payment.type === 'cuenta' && payment.currency === 'USD')) {
      throw new Error('El pago USD no quedo persistido');
    }
    logOk('pago USD valido agregado');
    await request(`/users/${userA.clienteId}/payments`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({
        type: 'cheque',
        amount: QA_GUARANTEE_AMOUNT,
        bank: 'Banco QA',
        checkNumber: '123456',
        issueDate: todaySlashDate(),
        checkImageUri: 'file:///qa/cheque.jpg'
      })
    });
    const userAPayments = await request(`/users/${userA.clienteId}/payments`, { token: userA.sessionToken });
    if (!userAPayments.some((payment) => payment.type === 'cheque' && payment.verified === 'si')) {
      throw new Error('El cheque valido no quedo verificado');
    }
    logOk('cheque valido queda verificado');
    const pdfPayments = await request('/usuarios/me/medios-de-pago', { token: userA.sessionToken });
    if (!Array.isArray(pdfPayments) || pdfPayments.length < 2) throw new Error('/usuarios/me/medios-de-pago no listo pagos');
    await request(`/usuarios/me/medios-de-pago/${pdfPayments[0].id}`, {
      method: 'PATCH',
      token: userA.sessionToken,
      body: JSON.stringify({ verificado: true })
    });
    logOk('pdf patch medio de pago compatible');
    await request(`/users/${userB.clienteId}/payments`, {
      method: 'POST',
      token: userB.sessionToken,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: QA_GUARANTEE_AMOUNT,
        cardHolder: 'qa rival',
        cardNumber: '4111111111111111',
        expiry: '12/30',
        cvv: '123'
      })
    });
    logOk('segundo usuario con pago valido');

    const userGold = await verifyGuest(db, await registerGuest(db, 4));
    await db.query("UPDATE clientes SET categoria = 'oro' WHERE identificador = ?", [userGold.clienteId]);
    await request(`/users/${userGold.clienteId}/payments`, {
      method: 'POST',
      token: userGold.sessionToken,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: 100000000,
        cardHolder: 'qa oro',
        cardNumber: '4111111111111111',
        expiry: '12/30',
        cvv: '123'
      })
    });
    const [goldAuctionRows] = await db.query(
      `SELECT s.identificador AS auctionId, s.estado AS auctionStatus, i.identificador AS itemId,
        i.puja_actual AS currentBid, i.subastado AS subastado
       FROM subastas s
       JOIN catalogos c ON c.subasta = s.identificador
       JOIN items_catalogo i ON i.catalogo = c.identificador
       WHERE s.categoria = 'oro'
       ORDER BY s.identificador ASC, i.orden_lote ASC
       LIMIT 1`
    );
    const goldAuctionSeed = goldAuctionRows[0];
    if (!goldAuctionSeed) throw new Error('No hay subasta oro para QA');
    touched.extraAuctions = touched.extraAuctions || [];
    touched.extraAuctions.push({
      auctionId: goldAuctionSeed.auctionId,
      previousAuctionStatus: goldAuctionSeed.auctionStatus
    });
    touched.extraItems = touched.extraItems || [];
    touched.extraItems.push({
      itemId: goldAuctionSeed.itemId,
      previousBid: goldAuctionSeed.currentBid,
      previousSubastado: goldAuctionSeed.subastado
    });
    await db.query("UPDATE subastas SET estado = 'abierta' WHERE identificador = ?", [goldAuctionSeed.auctionId]);
    await db.query(
      `UPDATE items_catalogo
       SET puja_actual = 0, subastado = 'no', timer_inicio = NULL, timer_vencimiento = NULL,
         cierre_estado = 'esperando_puja', cierre_motivo = NULL
       WHERE identificador = ?`,
      [goldAuctionSeed.itemId]
    );
    const goldAuctions = await request(`/auctions?clienteId=${userGold.clienteId}`, { token: userGold.sessionToken });
    const activeGold = goldAuctions.find((auction) => Number(auction.id) === Number(goldAuctionSeed.auctionId));
    if (!activeGold || activeGold.status !== 'abierta') throw new Error('No se pudo preparar subasta oro abierta para QA');
    const goldDetail = await request(`/auctions/${activeGold.id}`, { token: userGold.sessionToken });
    const goldHighAmount = Number(goldDetail.currentBid) + Math.ceil(Number(goldDetail.basePrice) * 0.25);
    const goldBid = await request(`/auctions/${activeGold.id}/bids`, {
      method: 'POST',
      token: userGold.sessionToken,
      body: JSON.stringify({ clienteId: userGold.clienteId, amount: goldHighAmount })
    });
    if (Number(goldBid.auction.currentBid) !== goldHighAmount) {
      throw new Error('La subasta oro no acepto una puja superior al 20 porciento');
    }
    logOk('puja oro superior al 20 porciento aceptada');

    const notifications = await request('/notificaciones', { token: userA.sessionToken });
    if (!Array.isArray(notifications) || notifications.length === 0) {
      throw new Error('Las notificaciones no devolvieron datos');
    }
    const action = await request(`/notificaciones/${notifications[0].id}/accion`, {
      method: 'POST',
      token: userA.sessionToken
    });
    if (!action.ok || !action.target) throw new Error('La accion de notificacion no devolvio target');
    logOk('notificaciones accionables');
    await request(`/notificaciones/${notifications[0].id}/leer`, { method: 'PATCH', token: userA.sessionToken });
    await request('/notificaciones/leer-todas', { method: 'PATCH', token: userA.sessionToken });
    logOk('pdf notificaciones leidas compatible');

    await expectReject('lote sin fotos suficientes rechazado', () =>
      request(`/users/${userA.clienteId}/lots`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({ ...validLotPayload(), photoUris: [] })
      }), 'fotos');
    const lots = await request(`/users/${userA.clienteId}/lots`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify(validLotPayload())
    });
    if (!Array.isArray(lots) || !lots.some((lot) => lot.title === 'Lote QA Robustez')) {
      throw new Error('El lote valido no quedo guardado');
    }
    logOk('lote valido queda pendiente');
    const createdLot = lots.find((lot) => lot.title === 'Lote QA Robustez');
    const pdfSaleDetail = await request(`/solicitudes-venta/${createdLot.id}`, { token: userA.sessionToken });
    if (String(pdfSaleDetail.id) !== String(createdLot.id)) throw new Error('/solicitudes-venta/{id} no devolvio detalle');
    await expectReject('revision lote fecha pasada rechazada', () =>
      request(`/solicitudes-venta/${createdLot.id}/revision/aceptar`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          auctionDate: '2020-01-01',
          auctionLocation: 'Sala QA',
          auctionTime: '19:30',
          basePrice: 100000,
          commission: 12000,
          insuranceCompany: 'Aseguradora QA',
          insurancePolicy: 'POL-QA-001',
          storageLocation: 'Deposito QA'
        })
      }), 'futura');
    const reviewedLot = await request(`/solicitudes-venta/${createdLot.id}/revision/aceptar`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({
        auctionDate: futureDate(),
        auctionLocation: 'Sala QA Retiro',
        auctionTime: '19:30',
        basePrice: 100000,
        commission: 12000,
        insuranceCompany: 'Aseguradora QA',
        insurancePolicy: 'POL-QA-001',
        storageLocation: 'Deposito QA Norte'
      })
    });
    if (reviewedLot.estado !== 'a_confirmar' || reviewedLot.polizaSeguro !== 'POL-QA-001') {
      throw new Error('La revision aceptada no dejo el lote a confirmar con seguro');
    }
    const acceptedLot = await request(`/solicitudes-venta/${createdLot.id}/aceptar-condiciones`, { method: 'POST', token: userA.sessionToken });
    if (acceptedLot.estado !== 'en_subasta' || !acceptedLot.generatedAuctionId) {
      throw new Error('Aceptar condiciones no publico el lote como subasta');
    }
    const generatedAuction = await request(`/auctions/${acceptedLot.generatedAuctionId}`, { token: userA.sessionToken });
    if (generatedAuction.status !== 'programada' || !Array.isArray(generatedAuction.catalog) || generatedAuction.catalog.length !== 1) {
      throw new Error('La subasta generada no quedo programada con catalogo');
    }
    if ((generatedAuction.catalog[0].photoUrls || []).length < 6) {
      throw new Error('La subasta generada no conservo las fotos del producto');
    }
    const acceptedAgain = await request(`/solicitudes-venta/${createdLot.id}/aceptar-condiciones`, { method: 'POST', token: userA.sessionToken });
    if (Number(acceptedAgain.generatedAuctionId) !== Number(acceptedLot.generatedAuctionId)) {
      throw new Error('Aceptar condiciones dos veces genero otra subasta');
    }
    const pdfGoods = await request('/mis-bienes', { token: userA.sessionToken });
    if (!Array.isArray(pdfGoods) || !pdfGoods.some((lot) => Number(lot.id) === Number(createdLot.id))) {
      throw new Error('/mis-bienes no devolvio el lote publicado');
    }
    const insurance = await request(`/mis-bienes/${createdLot.id}/seguro`, { token: userA.sessionToken });
    if (insurance.poliza !== 'POL-QA-001' || insurance.estado !== 'vigente') throw new Error('/mis-bienes/{id}/seguro no devolvio poliza vigente');
    const location = await request(`/mis-bienes/${createdLot.id}/ubicacion`, { token: userA.sessionToken });
    if (location.ubicacion !== 'Deposito Qa Norte') throw new Error('/mis-bienes/{id}/ubicacion no devolvio deposito');
    await expectReject('lote publicado no se puede rechazar despues', () =>
      request(`/solicitudes-venta/${createdLot.id}/rechazar-condiciones`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({ motivo: 'QA rechazo tardio' })
      }), 'a confirmar');
    logOk('aceptar condiciones genera subasta con catalogo');

    const rejectionRows = await request(`/users/${userA.clienteId}/lots`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ ...validLotPayload(), title: 'Lote QA Rechazo Condiciones' })
    });
    const rejectionLot = rejectionRows.find((lot) => lot.title === 'Lote QA Rechazo Condiciones');
    await request(`/solicitudes-venta/${rejectionLot.id}/revision/aceptar`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({
        auctionDate: futureDate(25),
        auctionLocation: 'Sala QA Rechazo',
        auctionTime: '18:15',
        basePrice: 110000,
        commission: 9000,
        insuranceCompany: 'Aseguradora QA',
        insurancePolicy: 'POL-QA-RECHAZO',
        storageLocation: 'Deposito QA Sur'
      })
    });
    const rejectedByUser = await request(`/solicitudes-venta/${rejectionLot.id}/rechazar-condiciones`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ motivo: 'QA rechazo condiciones' })
    });
    if (rejectedByUser.estado !== 'rechazado') throw new Error('Rechazar condiciones no dejo el lote rechazado');

    const collectionRows = await request(`/users/${userA.clienteId}/lots`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify(validCollectionPayload())
    });
    const collectionLot = collectionRows.find((lot) => lot.title === 'Coleccion QA de Diseno');
    if (!collectionLot || collectionLot.lotKind !== 'variado' || collectionLot.items.length !== 2) {
      throw new Error('La coleccion con varios productos no quedo guardada correctamente');
    }
    const rejectedReview = await request(`/solicitudes-venta/${collectionLot.id}/revision/rechazar`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ motivo: 'Origen licito insuficiente para QA' })
    });
    if (rejectedReview.estado !== 'rechazado' || !String(rejectedReview.rejectionReason || '').includes('Origen licito')) {
      throw new Error('La revision rechazada no guardo motivo');
    }
    logOk('pdf solicitudes venta y mis bienes compatibles');

    const [commonAuctionRows] = await db.query(
      `SELECT s.identificador AS auctionId, s.estado AS auctionStatus, i.identificador AS itemId,
        i.puja_actual AS currentBid, i.subastado AS subastado,
        i.cierre_estado AS closureStatus, i.cierre_motivo AS closureReason
       FROM subastas s
       JOIN catalogos c ON c.subasta = s.identificador
       JOIN items_catalogo i ON i.catalogo = c.identificador
       WHERE s.categoria = 'comun'
       ORDER BY s.identificador ASC, i.orden_lote ASC
       LIMIT 1`
    );
    const commonAuctionSeed = commonAuctionRows[0];
    if (!commonAuctionSeed) throw new Error('No hay subasta comun para QA');
    await db.query("UPDATE subastas SET estado = 'abierta' WHERE identificador = ?", [commonAuctionSeed.auctionId]);
    await db.query(
      `UPDATE items_catalogo
       SET puja_actual = 0, subastado = 'no', timer_inicio = NULL, timer_vencimiento = NULL,
         cierre_estado = 'esperando_puja', cierre_motivo = NULL
       WHERE identificador = ?`,
      [commonAuctionSeed.itemId]
    );

    const auctions = await request(`/auctions?clienteId=${userA.clienteId}`, { token: userA.sessionToken });
    const activeCommon = auctions.find((auction) => Number(auction.id) === Number(commonAuctionSeed.auctionId));
    if (!activeCommon) throw new Error('No hay subasta comun abierta para QA');
    if (Number(activeCommon.currentBid) !== Number(activeCommon.basePrice)) {
      throw new Error('La subasta sin pujas debe mostrar el precio base como puja actual');
    }
    const registeredDetail = await request(`/auctions/${activeCommon.id}`, { token: userA.sessionToken });
    if (!Array.isArray(registeredDetail.catalog) || registeredDetail.catalog.length < 2) {
      throw new Error('La subasta registrada no devolvio catalogo con productos');
    }
    if (registeredDetail.catalog.some((item) => item.basePrice == null)) {
      throw new Error('El usuario registrado no ve precios base del catalogo');
    }
    if (registeredDetail.catalog.some((item) => !Array.isArray(item.photoUrls) || item.photoUrls.length < 6)) {
      throw new Error('El catalogo no devolvio las fotos esperadas por producto');
    }
    logOk('catalogo subasta-productos con precios y fotos');

    await expectReject('entrar a sala sin sesion bloqueado', () =>
      request(`/auctions/${activeCommon.id}/enter`, {
        method: 'POST',
        body: JSON.stringify({ clienteId: userA.clienteId })
      }), 'sesion');
    await expectReject('pujar como otra cuenta bloqueado', () =>
      request(`/auctions/${activeCommon.id}/bids`, {
        method: 'POST',
        token: userB.sessionToken,
        body: JSON.stringify({ clienteId: userA.clienteId, amount: Number(activeCommon.currentBid) + 1 })
      }), 'permisos');

    const room = await request(`/auctions/${activeCommon.id}/enter`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ clienteId: userA.clienteId })
    });
    const pdfRoom = await request(`/subastas/${activeCommon.id}/ingresar`, {
      method: 'POST',
      token: userA.sessionToken
    });
    if (Number(pdfRoom.id) !== Number(activeCommon.id)) throw new Error('/subastas/{id}/ingresar no devolvio sala');
    touched.itemId = room.itemId;
    touched.auctionId = activeCommon.id;
    touched.previousBid = commonAuctionSeed.currentBid;
    touched.previousSubastado = commonAuctionSeed.subastado;
    touched.previousClosureStatus = commonAuctionSeed.closureStatus;
    touched.previousClosureReason = commonAuctionSeed.closureReason;
    touched.previousAuctionStatus = commonAuctionSeed.auctionStatus;
    logOk('entrada valida a sala');
    const pdfCatalog = await request(`/subastas/${activeCommon.id}/catalogo`, { token: userA.sessionToken });
    if (!Array.isArray(pdfCatalog.catalogo) || !pdfCatalog.catalogo.length) throw new Error('/subastas/{id}/catalogo no devolvio items');
    if (pdfCatalog.catalogo.some((item) => !Array.isArray(item.fotos) || item.fotos.length < 6)) {
      throw new Error('/subastas/{id}/catalogo no devolvio fotos del producto');
    }
    const pdfCatalogItem = await request(`/subastas/${activeCommon.id}/catalogo/${room.itemId}`, { token: userA.sessionToken });
    if (String(pdfCatalogItem.id) !== String(room.itemId)) throw new Error('/subastas/{id}/catalogo/{itemId} no devolvio item');
    await request(`/subastas/${activeCommon.id}/salir`, { method: 'POST', token: userA.sessionToken });
    logOk('pdf catalogo sala y salida compatibles');

    await request(`/usuarios/me/favoritos/${room.itemId}`, { method: 'POST', token: userA.sessionToken });
    const pdfFavorites = await request('/usuarios/me/favoritos', { token: userA.sessionToken });
    if (!Array.isArray(pdfFavorites) || !pdfFavorites.some((auction) => Number(auction.id) === Number(activeCommon.id))) {
      throw new Error('/usuarios/me/favoritos no guardo favorito');
    }
    await request(`/usuarios/me/favoritos/${room.itemId}`, { method: 'DELETE', token: userA.sessionToken });
    logOk('pdf favoritos compatible');

    await expectReject('puja baja rechazada', () =>
      request(`/auctions/${activeCommon.id}/bids`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({ clienteId: userA.clienteId, amount: Number(activeCommon.currentBid) + 1 })
      }), 'al menos');
    await expectReject('puja comun mayor al 20 porciento rechazada', () =>
      request(`/auctions/${activeCommon.id}/bids`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          clienteId: userA.clienteId,
          amount: Number(activeCommon.currentBid) + Math.ceil(Number(activeCommon.basePrice) * 0.25)
        })
      }), 'no puede superar');

    const validAmount = Number(activeCommon.currentBid) + Math.ceil(Number(activeCommon.basePrice) * 0.02);
    const bid = await request(`/auctions/${activeCommon.id}/bids`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ clienteId: userA.clienteId, amount: validAmount })
    });
    if (Number(bid.auction.currentBid) !== validAmount) throw new Error('La puja valida no actualizo la subasta');
    if (!bid.auction.lockedPaymentMethodId) throw new Error('La primera puja no fijo el medio de pago de la sala');
    logOk('puja valida actualiza subasta');
    const pdfBids = await request(`/subastas/${activeCommon.id}/items/${room.itemId}/pujas`, { token: userA.sessionToken });
    if (!Array.isArray(pdfBids) || !pdfBids.length) throw new Error('/subastas/{id}/items/{itemId}/pujas no devolvio historial');
    const pdfMyBids = await request('/usuarios/me/pujas', { token: userA.sessionToken });
    if (!Array.isArray(pdfMyBids) || !pdfMyBids.some((item) => Number(item.id) === Number(bid.bid.id))) {
      throw new Error('/usuarios/me/pujas no devolvio historial propio');
    }
    logOk('pdf historial de pujas compatible');

    await expectReject('lider activo no puede ofertar otra vez', () =>
      request(`/auctions/${activeCommon.id}/bids`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          clienteId: userA.clienteId,
          amount: validAmount + Math.ceil(Number(activeCommon.basePrice) * 0.02)
        })
      }), 'vas primero');
    await expectReject('lider activo no puede salir de la sala', () =>
      request(`/subastas/${activeCommon.id}/salir`, {
        method: 'POST',
        token: userA.sessionToken
      }), 'salir');
    const browsingWhileLeading = await request(`/auctions?clienteId=${userA.clienteId}`, { token: userA.sessionToken });
    if (!Array.isArray(browsingWhileLeading) || browsingWhileLeading.length < 2) {
      throw new Error('Usuario lider no pudo seguir viendo otras subastas');
    }
    logOk('lider puede mirar otras subastas mientras espera');

    const rivalAmount = validAmount + Math.ceil(Number(activeCommon.basePrice) * 0.02);
    const rivalBid = await request(`/subastas/${activeCommon.id}/items/${room.itemId}/pujar`, {
      method: 'POST',
      token: userB.sessionToken,
      body: JSON.stringify({ importe: rivalAmount })
    });
    if (Number(rivalBid.lote.pujaActual) !== rivalAmount) {
      throw new Error('La puja rival no actualizo la subasta');
    }
    logOk('versus usuario B supera a usuario A');

    const outbidNotifications = await request('/notificaciones', { token: userA.sessionToken });
    const outbidNotification = outbidNotifications.find((notification) => String(notification.id).startsWith('outbid-'));
    if (!outbidNotification) {
      throw new Error('Usuario A no recibio notificacion de sobrepuja');
    }
    if (outbidNotification.target !== `auction:${activeCommon.id}` || outbidNotification.action !== 'open_auction') {
      throw new Error('La notificacion de sobrepuja no permite volver a la subasta');
    }
    logOk('usuario superado recibe notificacion');

    const refreshedDetail = await request(`/auctions/${activeCommon.id}?clienteId=${userA.clienteId}`, {
      token: userA.sessionToken
    });
    if (Number(refreshedDetail.currentBid) !== rivalAmount) {
      throw new Error('Usuario A no ve la puja rival actualizada');
    }
    logOk('usuario A ve nuevo precio actualizado');

    const comebackAmount = rivalAmount + Math.ceil(Number(activeCommon.basePrice) * 0.02);
    const lockedPaymentId = Number(refreshedDetail.lockedPaymentMethodId);
    const otherPayment = userAPayments.find((payment) => Number(payment.id) !== lockedPaymentId);
    if (otherPayment) {
      await expectReject('no puede cambiar metodo de pago dentro de la subasta', () =>
        request(`/auctions/${activeCommon.id}/bids`, {
          method: 'POST',
          token: userA.sessionToken,
          body: JSON.stringify({
            clienteId: userA.clienteId,
            amount: comebackAmount,
            paymentMethodId: otherPayment.id
          })
        }), 'mismo');
    }
    const beforePaymentRows = await request(`/users/${userA.clienteId}/payments`, { token: userA.sessionToken });
    const beforeLockedPayment = beforePaymentRows.find((payment) => Number(payment.id) === lockedPaymentId);
    const comebackBid = await request(`/auctions/${activeCommon.id}/bids`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ clienteId: userA.clienteId, amount: comebackAmount })
    });
    if (Number(comebackBid.auction.currentBid) !== comebackAmount) {
      throw new Error('Usuario A no pudo volver a superar la oferta');
    }
    logOk('usuario A vuelve a superar la oferta');

    await db.query(
      "UPDATE items_catalogo SET timer_vencimiento = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE identificador = ?",
      [room.itemId]
    );
    const closedDetail = await request(`/auctions/${activeCommon.id}?clienteId=${userA.clienteId}`, { token: userA.sessionToken });
    if (!closedDetail.recentWin || closedDetail.recentWin.paymentStatus !== 'pagada') {
      throw new Error('Al ganar no se informo la adjudicacion pagada para mostrar popup');
    }
    const purchases = await request(`/users/${userA.clienteId}/purchases`, { token: userA.sessionToken });
    const wonPurchase = purchases.find((purchase) => Number(purchase.id) === Number(comebackBid.bid.id));
    if (!wonPurchase || wonPurchase.paymentStatus !== 'pagada') {
      throw new Error('La puja ganadora no quedo pagada automaticamente');
    }
    const afterPaymentRows = await request(`/users/${userA.clienteId}/payments`, { token: userA.sessionToken });
    const afterLockedPayment = afterPaymentRows.find((payment) => Number(payment.id) === lockedPaymentId);
    const expectedDebit = Number(wonPurchase.totalDue || 0);
    if (
      beforeLockedPayment &&
      afterLockedPayment &&
      Math.abs((Number(beforeLockedPayment.amount) - Number(afterLockedPayment.amount)) - expectedDebit) > 0.01
    ) {
      throw new Error('No se desconto la garantia del medio de pago al ganar');
    }
    const settled = await request(`/usuarios/me/compras/${comebackBid.bid.id}/confirmar-pago`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ direccionEnvio: 'Av Demo 1234' })
    });
    if (!settled.some((purchase) => Number(purchase.id) === Number(comebackBid.bid.id) && purchase.paymentStatus === 'pagada')) {
      throw new Error('La compra no quedo pagada');
    }
    const pdfPurchaseDetail = await request(`/usuarios/me/compras/${comebackBid.bid.id}`, { token: userA.sessionToken });
    if (Number(pdfPurchaseDetail.id) !== Number(comebackBid.bid.id)) throw new Error('/usuarios/me/compras/{id} no devolvio detalle');
    await request(`/usuarios/me/compras/${comebackBid.bid.id}/tracking`, { token: userA.sessionToken });
    logOk('compra ganadora se registra como pagada');

    const userPenalty = await verifyGuest(db, await registerGuest(db, 5));
    await request(`/users/${userPenalty.clienteId}/payments`, {
      method: 'POST',
      token: userPenalty.sessionToken,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: 200000,
        cardHolder: 'qa penalidad',
        cardNumber: '4111111111111111',
        expiry: '12/30',
        cvv: '123'
      })
    });
    const [penaltyAuctionRows] = await db.query(
      `SELECT s.identificador AS auctionId, s.estado AS auctionStatus, i.identificador AS itemId,
        i.puja_actual AS currentBid, i.subastado AS subastado
       FROM subastas s
       JOIN catalogos c ON c.subasta = s.identificador
       JOIN items_catalogo i ON i.catalogo = c.identificador
       WHERE s.categoria = 'comun' AND i.identificador <> ?
       ORDER BY s.identificador ASC, i.orden_lote ASC
       LIMIT 1`,
      [room.itemId]
    );
    const penaltyAuctionSeed = penaltyAuctionRows[0];
    if (!penaltyAuctionSeed) throw new Error('No hay lote comun alternativo para QA de penalidad');
    touched.extraAuctions = touched.extraAuctions || [];
    touched.extraAuctions.push({
      auctionId: penaltyAuctionSeed.auctionId,
      previousAuctionStatus: penaltyAuctionSeed.auctionStatus
    });
    touched.extraItems = touched.extraItems || [];
    touched.extraItems.push({
      itemId: penaltyAuctionSeed.itemId,
      previousBid: penaltyAuctionSeed.currentBid,
      previousSubastado: penaltyAuctionSeed.subastado
    });
    await db.query("UPDATE subastas SET estado = 'abierta' WHERE identificador = ?", [penaltyAuctionSeed.auctionId]);
    await db.query(
      `UPDATE items_catalogo
       SET puja_actual = 0, subastado = 'no', timer_inicio = NULL, timer_vencimiento = NULL,
         cierre_estado = 'esperando_puja', cierre_motivo = NULL
       WHERE identificador = ?`,
      [penaltyAuctionSeed.itemId]
    );
    const penaltyAuctionDetail = await request(`/auctions/${penaltyAuctionSeed.auctionId}`, { token: userPenalty.sessionToken });
    const penaltyBidAmount = Number(penaltyAuctionDetail.currentBid) + Math.ceil(Number(penaltyAuctionDetail.basePrice) * 0.02);
    const penaltyBid = await request(`/auctions/${penaltyAuctionSeed.auctionId}/bids`, {
      method: 'POST',
      token: userPenalty.sessionToken,
      body: JSON.stringify({ clienteId: userPenalty.clienteId, amount: penaltyBidAmount })
    });
    await db.query(
      "UPDATE items_catalogo SET timer_vencimiento = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE identificador = ?",
      [penaltyAuctionSeed.itemId]
    );
    await request(`/auctions/${penaltyAuctionSeed.auctionId}?clienteId=${userPenalty.clienteId}`, { token: userPenalty.sessionToken });
    await expectReject('falta de fondos genera multa', () =>
      request(`/usuarios/me/compras/${penaltyBid.bid.id}/confirmar-pago`, {
        method: 'POST',
        token: userPenalty.sessionToken,
        body: JSON.stringify({ direccionEnvio: 'Av Sin Fondos 123' })
      }), 'fondos insuficientes');
    const penalties = await request('/usuarios/me/penalidades', { token: userPenalty.sessionToken });
    const fundsPenalty = penalties.find((penalty) => penalty.type === 'falta_fondos' && penalty.status === 'activa');
    if (!fundsPenalty || Number(fundsPenalty.amount) !== Math.round(penaltyBidAmount * 0.1 * 100) / 100) {
      throw new Error('La multa por falta de fondos no quedo activa con el 10 porciento');
    }
    const restrictedAccount = await request('/usuarios/me/estado-cuenta', { token: userPenalty.sessionToken });
    if (restrictedAccount.estado !== 'restringida') throw new Error('La cuenta con penalidad no quedo restringida');
    await db.query("UPDATE subastas SET estado = 'abierta' WHERE identificador = ?", [activeCommon.id]);
    await db.query(
      `UPDATE items_catalogo
       SET subastado = 'no', timer_inicio = NULL, timer_vencimiento = NULL,
         cierre_estado = 'esperando_puja', cierre_motivo = NULL
       WHERE identificador = ?`,
      [room.itemId]
    );
    await expectReject('penalidad bloquea entrar a otra subasta', () =>
      request(`/auctions/${activeCommon.id}/enter`, {
        method: 'POST',
        token: userPenalty.sessionToken,
        body: JSON.stringify({ clienteId: userPenalty.clienteId })
      }), 'penalidades');
    await expectReject('presentar fondos insuficientes rechazado', () =>
      request(`/usuarios/me/penalidades/${fundsPenalty.id}/presentar-fondos`, {
        method: 'POST',
        token: userPenalty.sessionToken
      }), 'no cubre');
    await request(`/users/${userPenalty.clienteId}/payments`, {
      method: 'POST',
      token: userPenalty.sessionToken,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: 100000000,
        cardHolder: 'qa penalidad fondos',
        cardNumber: '4111111111111111',
        expiry: '12/30',
        cvv: '123'
      })
    });
    let penaltyState = await request(`/usuarios/me/penalidades/${fundsPenalty.id}/pagar`, {
      method: 'POST',
      token: userPenalty.sessionToken
    });
    if (!penaltyState.some((penalty) => Number(penalty.id) === Number(fundsPenalty.id) && penalty.status === 'activa')) {
      throw new Error('Pagar multa sin presentar fondos no debe cerrar la penalidad');
    }
    penaltyState = await request(`/usuarios/me/penalidades/${fundsPenalty.id}/presentar-fondos`, {
      method: 'POST',
      token: userPenalty.sessionToken
    });
    if (!penaltyState.some((penalty) => Number(penalty.id) === Number(fundsPenalty.id) && penalty.status === 'pagada')) {
      throw new Error('Presentar fondos tras pagar multa no cerro la penalidad');
    }
    const recoveredPurchases = await request(`/users/${userPenalty.clienteId}/purchases`, { token: userPenalty.sessionToken });
    if (!recoveredPurchases.some((purchase) => Number(purchase.id) === Number(penaltyBid.bid.id) && purchase.paymentStatus === 'pagada')) {
      throw new Error('La compra con penalidad resuelta no quedo pagada');
    }
    logOk('penalidad falta fondos se resuelve con multa y fondos');

    const pdfAccountState = await request('/usuarios/me/estado-cuenta', { token: userA.sessionToken });
    if (!pdfAccountState.estado) throw new Error('/usuarios/me/estado-cuenta no devolvio estado');
    logOk('pdf estado cuenta compatible');
  } finally {
    await cleanup(db, touched);
    await db.end();
    await getPool().end();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

main().catch(async (error) => {
  console.error(`FAIL ${error.message}`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  process.exit(1);
});
