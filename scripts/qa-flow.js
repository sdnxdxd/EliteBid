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
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        identifier: `qa.robust.${RUN_ID}.faltante@example.com`,
        password: RESET_PASSWORD,
        confirmPassword: RESET_PASSWORD
      })
    }), 'no encontramos');
  await expectReject('auth 43 reset password confirmacion distinta rechazado', () =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        identifier: normalizedGuest.email,
        password: RESET_PASSWORD,
        confirmPassword: 'Otra!3304'
      })
    }), 'coinciden');

  await request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      identifier: normalizedGuest.email,
      password: RESET_PASSWORD,
      confirmPassword: RESET_PASSWORD
    })
  });
  await expectReject('auth 44 reset invalida clave anterior', () =>
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
  logOk('auth 45 reset permite login con clave nueva');
}

async function cleanup(db, touched = {}) {
  if (touched.itemId && touched.previousBid != null) {
    await db.query(
      `UPDATE items_catalogo
       SET puja_actual = ?, subastado = COALESCE(?, subastado),
         timer_inicio = NULL, timer_vencimiento = NULL,
         cierre_estado = 'esperando_puja', cierre_motivo = NULL
       WHERE identificador = ?`,
      [
      touched.previousBid,
      touched.previousSubastado ?? null,
      touched.itemId
      ]
    );
  }
  if (touched.auctionId && touched.previousAuctionStatus) {
    await db.query('UPDATE subastas SET estado = ? WHERE identificador = ?', [
      touched.previousAuctionStatus,
      touched.auctionId
    ]);
  }

  const [rows] = await db.query(
    "SELECT id, cliente_id AS clienteId FROM usuarios WHERE email LIKE 'qa.robust.%@example.com'"
  );

  for (const row of rows) {
    await db.query(
      'DELETE fl FROM fotos_lote fl JOIN solicitudes_lotes sl ON sl.identificador = fl.solicitud WHERE sl.cliente = ?',
      [row.clienteId]
    );
    await db.query('DELETE FROM solicitudes_lotes WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM registro_de_subasta WHERE cliente = ?', [row.clienteId]);
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
    await db.query('DELETE FROM clientes WHERE identificador = ?', [row.clienteId]);
    await db.query('DELETE FROM personas WHERE identificador = ?', [row.clienteId]);
  }
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
    logOk('clienteId sin sesion no revela precios');

    await expectReject('perfil sin sesion bloqueado', () =>
      request(`/users/${userA.clienteId}/profile`), 'sesion');
    await expectReject('sesion ajena no opera otra cuenta', () =>
      request(`/users/${userA.clienteId}/payments`, { token: userB.sessionToken }), 'permisos');

    await expectReject('reset con clave debil rechazado', () =>
      request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier: userB.email,
          password: 'simple',
          confirmPassword: 'simple'
        })
      }), 'clave');
    await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        identifier: userB.email,
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

    const auctions = await request(`/auctions?clienteId=${userA.clienteId}`, { token: userA.sessionToken });
    const activeCommon = auctions.find((auction) => auction.status === 'abierta' && auction.category === 'comun');
    if (!activeCommon) throw new Error('No hay subasta comun abierta para QA');

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
    touched.itemId = room.itemId;
    touched.auctionId = activeCommon.id;
    touched.previousBid = activeCommon.currentBid;
    const [itemRows] = await db.query('SELECT subastado FROM items_catalogo WHERE identificador = ?', [room.itemId]);
    touched.previousSubastado = itemRows[0]?.subastado;
    const [auctionRows] = await db.query('SELECT estado FROM subastas WHERE identificador = ?', [activeCommon.id]);
    touched.previousAuctionStatus = auctionRows[0]?.estado;
    logOk('entrada valida a sala');

    await expectReject('puja baja rechazada', () =>
      request(`/auctions/${activeCommon.id}/bids`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({ clienteId: userA.clienteId, amount: Number(activeCommon.currentBid) + 1 })
      }), 'al menos');

    const validAmount = Number(activeCommon.currentBid) + Math.ceil(Number(activeCommon.basePrice) * 0.02);
    const bid = await request(`/auctions/${activeCommon.id}/bids`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({ clienteId: userA.clienteId, amount: validAmount })
    });
    if (Number(bid.auction.currentBid) !== validAmount) throw new Error('La puja valida no actualizo la subasta');
    logOk('puja valida actualiza subasta');

    await expectReject('lider activo no puede ofertar otra vez', () =>
      request(`/auctions/${activeCommon.id}/bids`, {
        method: 'POST',
        token: userA.sessionToken,
        body: JSON.stringify({
          clienteId: userA.clienteId,
          amount: validAmount + Math.ceil(Number(activeCommon.basePrice) * 0.02)
        })
      }), 'vas primero');

    const rivalAmount = validAmount + Math.ceil(Number(activeCommon.basePrice) * 0.02);
    const rivalBid = await request(`/auctions/${activeCommon.id}/bids`, {
      method: 'POST',
      token: userB.sessionToken,
      body: JSON.stringify({ clienteId: userB.clienteId, amount: rivalAmount })
    });
    if (Number(rivalBid.auction.currentBid) !== rivalAmount) {
      throw new Error('La puja rival no actualizo la subasta');
    }
    logOk('versus usuario B supera a usuario A');

    const outbidNotifications = await request('/notificaciones', { token: userA.sessionToken });
    if (!outbidNotifications.some((notification) => String(notification.id).startsWith('outbid-'))) {
      throw new Error('Usuario A no recibio notificacion de sobrepuja');
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
    await request(`/auctions/${activeCommon.id}?clienteId=${userA.clienteId}`, { token: userA.sessionToken });
    const purchases = await request(`/users/${userA.clienteId}/purchases`, { token: userA.sessionToken });
    const pendingPurchase = purchases.find((purchase) => Number(purchase.id) === Number(comebackBid.bid.id));
    if (!pendingPurchase || pendingPurchase.paymentStatus !== 'pendiente') {
      throw new Error('La puja ganadora no aparecio como compra pendiente');
    }
    const settled = await request(`/users/${userA.clienteId}/purchases/${comebackBid.bid.id}/settle`, {
      method: 'POST',
      token: userA.sessionToken
    });
    if (!settled.some((purchase) => Number(purchase.id) === Number(comebackBid.bid.id) && purchase.paymentStatus === 'pagada')) {
      throw new Error('La compra no quedo pagada');
    }
    logOk('compra ganadora se registra como pagada');
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
