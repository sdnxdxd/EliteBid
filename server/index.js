const cors = require('cors');
const crypto = require('crypto');
const express = require('express');

const { first, query, run } = require('./db');
const { hasEmailProviderConfig, sendAccountReviewEmail, sendPasswordResetEmail, sendVerificationEmail } = require('./emailService');
const { initDatabase } = require('./initDatabase');
const { hashPassword, verifyPassword } = require('./passwordHash');

require('dotenv').config();

const app = express();
const SESSION_DAYS = 7;
const BID_TIMER_SECONDS = 60;
const FIRST_BID_TIMER_SECONDS = 3 * 60;
const COMPANY_CLIENT_ID = 4;
const SHIPPING_COST = 25000;
const BID_RANGE_LIMIT_CATEGORIES = new Set(['comun', 'especial', 'plata']);
const categoryRank = { comun: 1, especial: 2, plata: 3, oro: 4, platino: 5 };
const categoryRequirements = [
  {
    category: 'comun',
    label: 'Comun',
    description: 'Cuenta verificada, admitida por la empresa y sin requisitos de actividad.'
  },
  {
    category: 'especial',
    label: 'Especial',
    minBids: 2,
    maxActivePenalties: 0,
    description: '2 pujas registradas y sin penalidades activas.'
  },
  {
    category: 'plata',
    label: 'Plata',
    minBids: 5,
    minWins: 1,
    maxActivePenalties: 0,
    description: '5 pujas registradas, 1 subasta ganada y sin penalidades activas.'
  },
  {
    category: 'oro',
    label: 'Oro',
    minBids: 10,
    minWins: 2,
    minInvested: 1000000,
    maxActivePenalties: 0,
    description: '10 pujas registradas, 2 subastas ganadas, $1.000.000 invertido y sin penalidades activas.'
  },
  {
    category: 'platino',
    label: 'Platino',
    minBids: 20,
    minWins: 5,
    minInvested: 5000000,
    maxActivePenalties: 0,
    description: '20 pujas registradas, 5 subastas ganadas, $5.000.000 invertido y sin penalidades activas.'
  }
];

app.use(cors());
app.use(express.json({ limit: '30mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await first('SELECT 1 AS ok');
    res.json({ ok: true, emailProviderConfigured: hasEmailProviderConfig() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const rawIdentifier = req.body.identifier ?? req.body.documentNumber ?? req.body.dni ?? email;
  const normalizedEmail = normalizeEmail(rawIdentifier);
  const documentNumber = normalizedEmail ? '' : onlyDigits(rawIdentifier);

  if ((!normalizedEmail && !documentNumber) || !password) throw new Error('Completa tu correo y clave para ingresar.');

  const user = await first(
    `SELECT u.id, u.email, u.password, u.nombre, u.rol, u.estado, u.cliente_id AS clienteId,
      u.verification_code_hash AS verificationCodeHash, u.verification_code_expires_at AS verificationCodeExpiresAt,
      u.verification_code_expires_at <= UTC_TIMESTAMP() AS verificationCodeExpired,
      c.categoria, c.admitido,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     JOIN personas p ON p.identificador = u.cliente_id
     WHERE ${normalizedEmail ? 'lower(u.email) = ?' : 'p.documento = ?'}`,
    [normalizedEmail || documentNumber]
  );

  if (!user) throw new Error('Correo o clave incorrectos.');
  if (user.rol === 'invitado' && user.estado === 'pendiente') {
    await assertPendingGuestCode(user, password);
  } else {
    const passwordResult = await verifyPassword(password, user.password);
    if (!passwordResult.ok) throw new Error('Correo o clave incorrectos.');
    if (passwordResult.needsRehash) {
      await run('UPDATE usuarios SET password = ? WHERE id = ?', [await hashPassword(password), user.id]);
    }
  }

  if (!['activo', 'pendiente'].includes(user.estado) || user.admitido !== 'si') {
    throw new Error('Tu usuario aun no esta habilitado para ingresar.');
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await run('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
  await run('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)', [
    token,
    user.id,
    toMysqlDateTime(expiresAt)
  ]);

  res.json(toSessionUser(user, token));
}));

app.post('/api/auth/register', wrap(async (req, res) => {
  const form = sanitizeRegistration(req.body);

  const existing = await first('SELECT id FROM usuarios WHERE lower(email) = ?', [form.email]);
  if (existing) throw new Error('Ese correo ya esta registrado. Inicia sesion para continuar.');
  await assertUniqueIdentityDocument(form.documentNumber, 'dni');
  const country = await first('SELECT numero FROM paises WHERE numero = ?', [32]);
  if (!country) throw new Error('Selecciona un pais valido.');

  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const personResult = await run(
    `INSERT INTO personas (documento, nombre, direccion, estado, foto_uri)
     VALUES (?, ?, ?, ?, ?)`,
    [form.documentNumber, fullName, form.legalAddress, 'activo', null]
  );
  const personId = personResult.insertId;

  await run('INSERT INTO documentos_identidad (persona_id, frente_uri, dorso_uri) VALUES (?, ?, ?)', [
    personId,
    form.documentFrontUri,
    form.documentBackUri
  ]);
  await run(
    `INSERT INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [personId, 32, 'si', 'comun', 2]
  );
  await run(
    `INSERT INTO usuarios (cliente_id, email, password, nombre, rol, estado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [personId, form.email, await hashPassword(form.password), form.firstName, 'cliente', 'activo']
  );

  const user = await loginForRegister(form.email, form.password);
  res.json(user);
}));

app.post('/api/auth/register-guest', wrap(async (req, res) => {
  const form = sanitizeGuestRegistration(req.body);

  const existing = await first('SELECT id FROM usuarios WHERE lower(email) = ?', [form.email]);
  if (existing) throw new Error('Ese correo ya esta registrado. Inicia sesion para continuar.');
  await assertUniqueIdentityDocument(form.documentNumber, form.documentType);

  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const personResult = await run(
    `INSERT INTO personas (tipo_documento, documento, nombre, direccion, estado, foto_uri)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [form.documentType, form.documentNumber, fullName, form.legalAddress, 'activo', null]
  );
  const personId = personResult.insertId;

  await run('INSERT INTO documentos_identidad (persona_id, frente_uri, dorso_uri) VALUES (?, ?, ?)', [
    personId,
    form.documentFrontUri,
    form.documentBackUri
  ]);
  await run(
    `INSERT INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [personId, 32, 'si', 'comun', 2]
  );

  const verificationCode = createOneTimeCode();
  await run(
    `INSERT INTO usuarios (cliente_id, email, password, nombre, rol, estado, email_verificado, verification_code_hash, verification_code_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      personId,
      form.email,
      await hashPassword(createToken()),
      form.firstName,
      'invitado',
      'pendiente',
      'no',
      await hashPassword(verificationCode),
      toMysqlDateTime(new Date(Date.now() + 15 * 60 * 1000))
    ]
  );

  const user = await first(
    `SELECT u.id, u.email, u.nombre, u.rol, u.estado, u.cliente_id AS clienteId,
      c.categoria, c.admitido, 0 AS paymentCount
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE lower(u.email) = ?`,
    [form.email]
  );
  const token = createToken();
  await run('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)', [
    token,
    user.id,
    toMysqlDateTime(new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000))
  ]);

  const emailResult = queueVerificationForUser({
    email: form.email,
    name: form.firstName,
    token: verificationCode
  });

  res.json({
    ...toSessionUser(user, token),
    accountReviewPending: true,
    verificationPending: true,
    verificationEmailSent: emailResult.sent
  });
}));

app.post(['/api/auth/register/paso1', '/api/auth/registro/fase1'], wrap(async (req, res) => {
  const form = sanitizeGuestRegistration(fromLegacyRegistrationInput(req.body));

  const existing = await first('SELECT id FROM usuarios WHERE lower(email) = ?', [form.email]);
  if (existing) throw new Error('Ese correo ya esta registrado. Inicia sesion para continuar.');
  await assertUniqueIdentityDocument(form.documentNumber, form.documentType);

  const fullName = `${form.firstName} ${form.lastName}`.trim();
  const personResult = await run(
    `INSERT INTO personas (tipo_documento, documento, nombre, direccion, estado, foto_uri)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [form.documentType, form.documentNumber, fullName, form.legalAddress, 'activo', null]
  );
  const personId = personResult.insertId;

  await run('INSERT INTO documentos_identidad (persona_id, frente_uri, dorso_uri) VALUES (?, ?, ?)', [
    personId,
    form.documentFrontUri,
    form.documentBackUri
  ]);
  await run(
    `INSERT INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [personId, 32, 'si', 'comun', 2]
  );

  const verificationCode = createOneTimeCode();
  await run(
    `INSERT INTO usuarios (cliente_id, email, password, nombre, rol, estado, email_verificado, verification_code_hash, verification_code_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      personId,
      form.email,
      await hashPassword(createToken()),
      form.firstName,
      'invitado',
      'pendiente',
      'no',
      await hashPassword(verificationCode),
      toMysqlDateTime(new Date(Date.now() + 15 * 60 * 1000))
    ]
  );

  const user = await first('SELECT id FROM usuarios WHERE lower(email) = ? LIMIT 1', [form.email]);
  const emailResult = queueVerificationForUser({
    email: form.email,
    name: form.firstName,
    token: verificationCode
  });

  res.status(201).json({
    email: form.email,
    estado: 'pendiente',
    accountReviewPending: true,
    registrationId: String(user.id),
    verificationEmailSent: emailResult.sent
  });
}));

app.post(['/api/auth/register/paso2', '/api/auth/registro/fase2'], wrap(async (req, res) => {
  const registrationId = parsePositiveInt(req.body.registrationId, 'Registro previo inexistente.');
  validatePassword(req.body.password, req.body.confirmPassword);
  const user = await first(
    `SELECT u.id, u.email, u.nombre, u.rol, u.estado, u.cliente_id AS clienteId,
      c.categoria, c.admitido,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE u.id = ? AND u.estado = 'pendiente'
     LIMIT 1`,
    [registrationId]
  );

  if (!user) throw new Error('Registro previo inexistente.');
  await run(
    `UPDATE usuarios
     SET password = ?, rol = 'cliente', estado = 'activo', email_verificado = 'si',
       verification_code_hash = NULL, verification_code_expires_at = NULL
     WHERE id = ?`,
    [await hashPassword(req.body.password), user.id]
  );
  const token = createToken();
  await run('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
  await run('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)', [
    token,
    user.id,
    toMysqlDateTime(new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000))
  ]);

  res.json(toSessionUser({ ...user, rol: 'cliente', estado: 'activo' }, token));
}));

app.post('/api/auth/resend-verification', wrap(async (req, res) => {
  const rawIdentifier = normalizeWhitespace(req.body.identifier ?? req.body.email ?? req.body.documentNumber ?? req.body.dni);
  if (!rawIdentifier) throw new Error('Ingresa un email o DNI valido.');
  const email = normalizeEmail(rawIdentifier);
  const documentNumber = email ? '' : normalizeDocument(rawIdentifier);
  if (!email && !documentNumber) throw new Error('Ingresa un email o DNI valido.');

  const user = await first(
    `SELECT u.id, u.email, u.nombre
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     JOIN personas p ON p.identificador = u.cliente_id
     WHERE ${email ? 'lower(u.email) = ?' : 'p.documento = ?'}
       AND u.rol = 'invitado' AND u.email_verificado = 'no' AND u.estado = 'pendiente'
     LIMIT 1`,
    [email || documentNumber]
  );

  if (!user) {
    throw new Error('No encontramos una cuenta invitada pendiente con esos datos.');
  }

  const verificationCode = createOneTimeCode();
  await run(
    'UPDATE usuarios SET verification_code_hash = ?, verification_code_expires_at = ? WHERE id = ?',
    [await hashPassword(verificationCode), toMysqlDateTime(new Date(Date.now() + 15 * 60 * 1000)), user.id]
  );

  const emailResult = await sendVerificationForUser({
    email: user.email,
    name: user.nombre,
    token: verificationCode
  });

  res.json({
    ok: true,
    email: maskEmail(user.email),
    verificationEmailSent: emailResult.sent
  });
}));

app.post('/api/auth/complete-verification', wrap(async (req, res) => {
  const token = bearerToken(req);
  const email = normalizeEmail(req.body.email);
  const code = normalizeOneTimeCode(req.body.code);
  validatePassword(req.body.password, req.body.confirmPassword);

  if (!email || !code) throw new Error('Ingresa el correo y codigo de verificacion.');

  const user = await first(
    `SELECT u.id, u.email, u.nombre, u.rol, u.estado, u.password, u.verification_code_hash AS verificationCodeHash,
      u.verification_code_expires_at AS verificationCodeExpiresAt,
      u.verification_code_expires_at <= UTC_TIMESTAMP() AS verificationCodeExpired,
      u.cliente_id AS clienteId, c.categoria, c.admitido,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE lower(u.email) = ? AND u.rol = 'invitado' AND u.email_verificado = 'no'
     LIMIT 1`,
    [email]
  );

  if (!user) throw new Error('No encontramos una cuenta pendiente con ese correo.');
  if (user.estado !== 'pendiente') throw new Error('La cuenta ya no esta pendiente.');
  if (!user.verificationCodeHash) throw new Error('Solicita un nuevo codigo de verificacion.');
  if (Number(user.verificationCodeExpired)) {
    throw new Error('El codigo vencio. Solicita uno nuevo.');
  }

  const codeResult = await verifyPassword(code, user.verificationCodeHash);
  if (!codeResult.ok) throw new Error('El codigo ingresado no es correcto.');

  await run(
    `UPDATE usuarios
     SET password = ?, email_verificado = 'si', rol = 'cliente', estado = 'activo',
       verification_token = NULL, verification_code_hash = NULL, verification_code_expires_at = NULL
     WHERE id = ?`,
    [await hashPassword(req.body.password), user.id]
  );

  let sessionToken = token || '';
  if (token) {
    const sessionUpdate = await run('UPDATE sesiones SET expira_en = ? WHERE token = ? AND usuario_id = ?', [
      toMysqlDateTime(new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)),
      token,
      user.id
    ]);

    if (!sessionUpdate.affectedRows) {
      sessionToken = '';
    }
  }

  if (!sessionToken) {
    sessionToken = createToken();
    await run('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
    await run('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)', [
      sessionToken,
      user.id,
      toMysqlDateTime(new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000))
    ]);
  }

  res.json(toSessionUser({ ...user, rol: 'cliente', estado: 'activo' }, sessionToken));
}));

app.post(['/api/admin/accounts/:clienteId/review', '/api/cuentas/:clienteId/validacion'], wrap(async (req, res) => {
  await requireAccountReviewer(req);
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cuenta invalida.');
  const reviewValue = req.body.accepted ?? req.body.aceptada ?? req.body.admitida ?? req.body.resultado;
  const accepted = toBoolean(reviewValue) || normalizeWhitespace(reviewValue).toLowerCase() === 'aceptada';
  const rejected = isRejectedReviewValue(reviewValue);
  if (!accepted && !rejected) {
    throw new Error('Indica si la cuenta fue aceptada o rechazada.');
  }

  const user = await first(
    `SELECT u.id, u.email, u.nombre, u.email_verificado AS emailVerified
     FROM usuarios u
     WHERE u.cliente_id = ?
     LIMIT 1`,
    [clienteId]
  );
  if (!user) throw new Error('No encontramos esa cuenta.');

  if (accepted) {
    await run('UPDATE clientes SET admitido = ? WHERE identificador = ?', ['si', clienteId]);
    await run(
      `UPDATE usuarios
       SET estado = CASE WHEN email_verificado = 'si' THEN 'activo' ELSE estado END
       WHERE id = ?`,
      [user.id]
    );
  } else {
    await run('UPDATE clientes SET admitido = ? WHERE identificador = ?', ['no', clienteId]);
    await run('UPDATE usuarios SET estado = ? WHERE id = ?', ['bloqueado', user.id]);
    await run('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
  }

  const reviewEmail = await sendAccountReviewForUser({
    accepted,
    email: user.email,
    name: user.nombre
  });

  res.json({
    accepted,
    accountReviewEmailSent: reviewEmail.sent,
    clienteId,
    ok: true
  });
}));

app.get('/api/auth/verify-email', wrap(async (req, res) => {
  const token = normalizeToken(req.query.token);
  if (!token) return sendVerificationHtml(res, 400, 'Token invalido', 'El enlace de verificacion no es valido.');

  const user = await first(
    `SELECT id, email
     FROM usuarios
     WHERE verification_token = ? AND email_verificado = 'no'
     LIMIT 1`,
    [token]
  );

  if (!user) {
    return sendVerificationHtml(res, 400, 'Token invalido o usado', 'Este enlace ya fue usado o no corresponde a una cuenta pendiente.');
  }

  await run(
    `UPDATE usuarios
     SET email_verificado = 'si', rol = 'cliente', verification_token = NULL
     WHERE id = ?`,
    [user.id]
  );

  sendVerificationHtml(res, 200, 'Cuenta verificada', 'Tu cuenta ya esta verificada. Volve a EliteBid para agregar tu medio de pago.');
}));

app.get(['/api/auth/session', '/api/auth/estado'], wrap(async (req, res) => {
  const token = bearerToken(req);
  if (!token) return res.json(null);

  const session = await first(
    `SELECT s.token AS sessionToken, u.id, u.email, u.nombre, u.rol, u.estado,
      u.cliente_id AS clienteId, c.categoria, c.admitido,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE s.token = ? AND s.expira_en > NOW()
     LIMIT 1`,
    [token]
  );

  if (!session) return res.json(null);
  const pendingGuest = session.rol === 'invitado' && session.estado === 'pendiente';
  if ((session.estado !== 'activo' && !pendingGuest) || session.admitido !== 'si') return res.json(null);
  res.json(session);
}));

app.delete('/api/auth/session', wrap(async (req, res) => {
  const token = bearerToken(req);
  if (token) await run('DELETE FROM sesiones WHERE token = ?', [token]);
  res.json({ ok: true });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = bearerToken(req);
  if (token) await run('DELETE FROM sesiones WHERE token = ?', [token]);
  res.json({ ok: true });
}));

app.post('/api/auth/request-password-reset', wrap(async (req, res) => {
  const email = normalizeEmail(req.body.email ?? req.body.identifier);
  if (!email) throw new Error('Ingresa un correo valido.');

  const user = await first(
    `SELECT u.id, u.email, u.nombre
     FROM usuarios u
     WHERE lower(u.email) = ?
       AND u.rol = 'cliente'
       AND u.estado = 'activo'
       AND u.email_verificado = 'si'
     LIMIT 1`,
    [email]
  );
  if (!user) throw new Error('No encontramos un usuario activo con ese correo.');

  const resetCode = createOneTimeCode();
  await run(
    'UPDATE usuarios SET password_reset_code_hash = ?, password_reset_expires_at = ? WHERE id = ?',
    [await hashPassword(resetCode), toMysqlDateTime(new Date(Date.now() + 15 * 60 * 1000)), user.id]
  );

  const emailResult = await sendPasswordResetForUser({
    email: user.email,
    name: user.nombre,
    token: resetCode
  });

  res.json({
    ok: true,
    email: maskEmail(user.email),
    resetEmailSent: emailResult.sent
  });
}));

app.post('/api/auth/reset-password', wrap(async (req, res) => {
  const { identifier = '', email = '', code: rawCode = '', password, confirmPassword } = req.body;
  const cleanIdentifier = normalizeWhitespace(email || identifier);
  const emailIdentifier = normalizeEmail(cleanIdentifier);
  const code = normalizeOneTimeCode(rawCode);

  if (!emailIdentifier) throw new Error('Ingresa el correo asociado a tu cuenta.');
  if (!code) throw new Error('Ingresa el codigo de recuperacion de 6 digitos.');
  validatePassword(password, confirmPassword);

  const user = await first(
    `SELECT u.id, u.password_reset_code_hash AS resetCodeHash,
      u.password_reset_expires_at AS resetExpiresAt,
      u.password_reset_expires_at <= UTC_TIMESTAMP() AS resetExpired
     FROM usuarios u
     WHERE lower(u.email) = ?
       AND u.rol = 'cliente'
       AND u.estado = 'activo'
       AND u.email_verificado = 'si'
     LIMIT 1`,
    [emailIdentifier]
  );
  if (!user) throw new Error('No encontramos un usuario activo con ese correo.');
  if (!user.resetCodeHash) throw new Error('Solicita un codigo de recuperacion antes de cambiar la clave.');
  if (Number(user.resetExpired)) throw new Error('El codigo de recuperacion vencio. Solicita uno nuevo.');

  const codeResult = await verifyPassword(code, user.resetCodeHash);
  if (!codeResult.ok) throw new Error('El codigo de recuperacion no es correcto.');

  await run(
    'UPDATE usuarios SET password = ?, password_reset_code_hash = NULL, password_reset_expires_at = NULL WHERE id = ?',
    [await hashPassword(password), user.id]
  );
  await run('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
  res.json({ ok: true });
}));

app.get('/api/usuarios/me', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const profile = await getUserProfile(viewer.clienteId);
  res.json(toLegacyUser(profile, viewer));
}));

app.put('/api/usuarios/me', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para modificar tus datos.');
  const currentProfile = await getUserProfile(viewer.clienteId);
  const profile = sanitizeProfile({
    ...req.body,
    userId: currentProfile.userId,
    firstName: req.body.firstName ?? req.body.nombre ?? currentProfile.identityFirstName,
    lastName: req.body.lastName ?? req.body.apellido ?? currentProfile.identityLastName,
    documento: req.body.documento ?? currentProfile.documento,
    email: req.body.email ?? currentProfile.email,
    legalAddress: req.body.legalAddress ?? req.body.domicilioLegal ?? req.body.direccion ?? currentProfile.legalAddress
  });
  await assertImmutableIdentity(viewer.clienteId, profile);

  const duplicate = await first('SELECT id FROM usuarios WHERE lower(email) = ? AND id <> ?', [
    profile.email,
    profile.userId
  ]);
  if (duplicate) throw new Error('Ese correo ya esta usado por otro usuario.');

  await run('UPDATE personas SET direccion = ? WHERE identificador = ?', [profile.legalAddress, viewer.clienteId]);
  await run('UPDATE usuarios SET email = ? WHERE id = ?', [profile.email, profile.userId]);
  res.json(toLegacyUser(await getUserProfile(viewer.clienteId), viewer));
}));

app.get('/api/usuarios/me/medios-de-pago', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserPayments(viewer.clienteId));
}));

app.post('/api/usuarios/me/medios-de-pago', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para agregar medios de pago.');
  const payment = sanitizePayment(fromLegacyPaymentInput(req.body));
  const verified = 'si';
  await run(
    `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [viewer.clienteId, payment.type, JSON.stringify(buildPaymentDetail(payment)), 'ARS', payment.amount, verified]
  );
  await refreshClientCategory(viewer.clienteId);
  res.status(201).json(await getUserPayments(viewer.clienteId));
}));

app.patch('/api/usuarios/me/medios-de-pago/:paymentId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para modificar medios de pago.');
  const paymentId = parsePositiveInt(req.params.paymentId, 'Medio de pago invalido.');
  const payment = await first(
    'SELECT identificador AS id FROM medios_pago WHERE identificador = ? AND cliente = ? LIMIT 1',
    [paymentId, viewer.clienteId]
  );
  if (!payment) throw new Error('No encontramos ese medio de pago.');

  if (req.body.verificado != null || req.body.verified != null) {
    const verified = toBoolean(req.body.verificado ?? req.body.verified) ? 'si' : 'no';
    await run('UPDATE medios_pago SET verificado = ? WHERE identificador = ? AND cliente = ?', [
      verified,
      paymentId,
      viewer.clienteId
    ]);
    await refreshClientCategory(viewer.clienteId);
  }

  res.json(await getUserPayments(viewer.clienteId));
}));

app.get('/api/usuarios/me/compras', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserPurchases(viewer.clienteId));
}));

app.get('/api/usuarios/me/compras/:bidId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const bidId = parsePositiveInt(req.params.bidId, 'Compra invalida.');
  const purchases = await getUserPurchases(viewer.clienteId);
  const purchase = purchases.find((item) => Number(item.id) === bidId);
  if (!purchase) throw new Error('No encontramos esa compra.');
  res.json(purchase);
}));

app.post('/api/usuarios/me/compras/:bidId/confirmar-pago', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const bidId = parsePositiveInt(req.params.bidId, 'Compra invalida.');
  await settlePurchase(viewer.clienteId, bidId);
  if (req.body.direccionEnvio || req.body.deliveryAddress) {
    await savePurchaseDelivery(viewer.clienteId, bidId, req.body.direccionEnvio ?? req.body.deliveryAddress);
  }
  res.json(await getUserPurchases(viewer.clienteId));
}));

app.get('/api/usuarios/me/compras/:bidId/tracking', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const bidId = parsePositiveInt(req.params.bidId, 'Compra invalida.');
  const purchases = await getUserPurchases(viewer.clienteId);
  const purchase = purchases.find((item) => Number(item.id) === bidId);
  if (!purchase) throw new Error('No encontramos esa compra.');
  res.json({
    compraId: bidId,
    estado: purchase.deliveryAddress ? 'preparando_envio' : 'pendiente_direccion',
    ubicacionEstimada: purchase.deliveryAddress ? 'Deposito EliteBid' : null,
    fechaEstimadaEntrega: null,
    direccionEnvio: purchase.deliveryAddress ?? null
  });
}));

app.get('/api/usuarios/me/penalidades', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserPenalties(viewer.clienteId));
}));

app.get('/api/usuarios/me/estado-cuenta', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const penalties = await getUserPenalties(viewer.clienteId);
  const active = penalties.filter((penalty) => ['activa', 'vencida'].includes(penalty.status));
  res.json({
    estado: active.length ? 'restringida' : 'activa',
    penalidadesActivas: active.length
  });
}));

app.post('/api/usuarios/me/penalidades/:penaltyId/pagar', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await settlePenalty(viewer.clienteId, parsePositiveInt(req.params.penaltyId, 'Penalidad invalida.')));
}));

app.post('/api/usuarios/me/penalidades/:penaltyId/presentar-fondos', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const paymentMethodId = req.body.medioPagoId ?? req.body.paymentMethodId;
  res.json(await presentPenaltyFunds(
    viewer.clienteId,
    parsePositiveInt(req.params.penaltyId, 'Penalidad invalida.'),
    paymentMethodId
  ));
}));

app.get('/api/usuarios/me/metricas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserSummary(viewer.clienteId));
}));

app.get('/api/usuarios/me/estadisticas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserSummary(viewer.clienteId));
}));

app.get('/api/usuarios/me/actividad-reciente', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserBids(viewer.clienteId, req.query));
}));

app.get('/api/usuarios/me/pujas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserBids(viewer.clienteId, req.query));
}));

app.get('/api/usuarios/me/favoritos', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  if (await isGuest(viewer.clienteId)) return res.json([]);
  res.json(await getFavoriteAuctions(viewer.clienteId));
}));

app.post('/api/usuarios/me/favoritos/:itemId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para guardar favoritos.');
  const auctionId = await resolveAuctionIdFromItemOrAuction(req.params.itemId);
  await run('INSERT IGNORE INTO favoritos (cliente, subasta) VALUES (?, ?)', [viewer.clienteId, auctionId]);
  res.status(201).json(await getFavoriteAuctions(viewer.clienteId));
}));

app.delete('/api/usuarios/me/favoritos/:itemId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para quitar favoritos.');
  const auctionId = await resolveAuctionIdFromItemOrAuction(req.params.itemId);
  await run('DELETE FROM favoritos WHERE cliente = ? AND subasta = ?', [viewer.clienteId, auctionId]);
  res.json(await getFavoriteAuctions(viewer.clienteId));
}));

app.get('/api/notificaciones', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserNotifications(viewer));
}));

app.post('/api/notificaciones/:notificationId/accion', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const notifications = await getUserNotifications(viewer);
  const notification = notifications.find((item) => item.id === req.params.notificationId);

  if (!notification) throw new Error('No encontramos esa notificacion.');

  res.json({
    ok: true,
    action: notification.action,
    target: notification.target,
    title: notification.title
  });
}));

app.patch('/api/notificaciones/:notificationId/leer', wrap(async (req, res) => {
  await requireAuthenticatedClient(req);
  res.json({ ok: true, id: req.params.notificationId, read: true });
}));

app.patch('/api/notificaciones/leer-todas', wrap(async (req, res) => {
  await requireAuthenticatedClient(req);
  res.json({ ok: true, readAll: true });
}));

app.post('/api/uploads', wrap(async (req, res) => {
  await requireAuthenticatedClient(req);
  const files = Array.isArray(req.body.files) ? req.body.files : [];
  const uploadIds = files.map((_, index) => `upload-${Date.now()}-${index + 1}`);
  res.status(201).json({ files: uploadIds.map((id) => ({ id })), uploadIds });
}));

app.get('/api/solicitudes-venta', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const lots = await getUserLots(viewer.clienteId);
  res.json({ solicitudes: lots.map(toSaleRequestContract) });
}));

app.get('/api/solicitudes-venta/:requestId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const requestId = parsePositiveInt(req.params.requestId, 'Solicitud invalida.');
  const lot = (await getUserLots(viewer.clienteId)).find((item) => Number(item.id) === requestId);
  if (!lot) throw new Error('No encontramos esa solicitud.');
  res.json(toSaleRequestContract(lot));
}));

app.post('/api/solicitudes-venta', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para cargar lotes a subasta.');
  const lot = sanitizeLotSubmission(fromSaleRequestInput(req.body));
  const result = await createLotSubmission(viewer.clienteId, lot);
  const rows = await getUserLots(viewer.clienteId);
  const created = rows.find((row) => row.id === result.insertId);
  res.status(201).json(toSaleRequestContract(created));
}));

app.post('/api/solicitudes-venta/:requestId/aceptar-condiciones', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const requestId = parsePositiveInt(req.params.requestId, 'Solicitud invalida.');
  await run(
    "UPDATE solicitudes_lotes SET estado = 'aceptado', actualizado_en = CURRENT_TIMESTAMP WHERE identificador = ? AND cliente = ?",
    [requestId, viewer.clienteId]
  );
  const lot = (await getUserLots(viewer.clienteId)).find((item) => Number(item.id) === requestId);
  if (!lot) throw new Error('No encontramos esa solicitud.');
  res.json(toSaleRequestContract(lot));
}));

app.post('/api/solicitudes-venta/:requestId/rechazar-condiciones', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const requestId = parsePositiveInt(req.params.requestId, 'Solicitud invalida.');
  await run(
    "UPDATE solicitudes_lotes SET estado = 'rechazado', motivo_rechazo = COALESCE(?, motivo_rechazo), actualizado_en = CURRENT_TIMESTAMP WHERE identificador = ? AND cliente = ?",
    [normalizeWhitespace(req.body.motivo ?? req.body.reason ?? 'Condiciones rechazadas por el usuario.'), requestId, viewer.clienteId]
  );
  const lot = (await getUserLots(viewer.clienteId)).find((item) => Number(item.id) === requestId);
  if (!lot) throw new Error('No encontramos esa solicitud.');
  res.json(toSaleRequestContract(lot));
}));

app.get('/api/mis-bienes', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const lots = await getUserLots(viewer.clienteId);
  res.json(lots.filter((lot) => ['aceptado', 'en_subasta', 'en_inspeccion'].includes(lot.status)).map(toSaleRequestContract));
}));

app.get('/api/mis-bienes/:productId/seguro', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const productId = parsePositiveInt(req.params.productId, 'Producto invalido.');
  const lot = (await getUserLots(viewer.clienteId)).find((item) => Number(item.id) === productId);
  if (!lot) throw new Error('No encontramos ese bien.');
  res.json({
    productoId: productId,
    aseguradora: lot.insuranceCompany ?? null,
    poliza: lot.insurancePolicy ?? null,
    estado: lot.insurancePolicy ? 'vigente' : 'pendiente'
  });
}));

app.get('/api/mis-bienes/:productId/ubicacion', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const productId = parsePositiveInt(req.params.productId, 'Producto invalido.');
  const lot = (await getUserLots(viewer.clienteId)).find((item) => Number(item.id) === productId);
  if (!lot) throw new Error('No encontramos ese bien.');
  res.json({
    productoId: productId,
    ubicacion: lot.storageLocation ?? 'Pendiente de deposito',
    estado: lot.status
  });
}));

app.get('/api/subastas', wrap(async (req, res) => {
  const viewer = await getOptionalAuthenticatedClient(req);
  res.json(await getAuctionRows(viewer));
}));

app.get('/api/subastas/:auctionId/catalogo', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  const catalog = await getAuctionCatalogLots(auctionId, viewer);
  res.json({ catalogo: catalog.map(toCatalogLot) });
}));

app.get('/api/subastas/:auctionId/catalogo/:itemId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  const itemId = parsePositiveInt(req.params.itemId, 'Item invalido.');
  const catalog = await getAuctionCatalogLots(auctionId, viewer);
  const lot = catalog.find((detail) => Number(detail.itemId) === itemId || Number(detail.productId) === itemId);
  if (!lot) throw new Error('No encontramos ese item.');
  res.json(toCatalogLot(lot));
}));

app.get('/api/subastas/:auctionId/stream', wrap(async (req, res) => {
  await requireAuthenticatedClient(req);
  res.json({ status: 'disponible', message: 'El streaming se consulta desde el servicio de la empresa.' });
}));

app.get('/api/subastas/:auctionId', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getAuctionDetail(parsePositiveInt(req.params.auctionId, 'Subasta invalida.'), viewer.clienteId));
}));

app.post('/api/subastas/:auctionId/favoritos', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para guardar favoritos.');
  const existing = await first('SELECT 1 AS found FROM favoritos WHERE cliente = ? AND subasta = ?', [
    viewer.clienteId,
    auctionId
  ]);

  if (existing) {
    await run('DELETE FROM favoritos WHERE cliente = ? AND subasta = ?', [viewer.clienteId, auctionId]);
  } else {
    await run('INSERT INTO favoritos (cliente, subasta) VALUES (?, ?)', [viewer.clienteId, auctionId]);
  }

  res.json({ favorito: !existing });
}));

app.post('/api/subastas/:auctionId/registrar', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para ingresar a una sala.');
  res.json(await enterAuctionRoom(viewer.clienteId, parsePositiveInt(req.params.auctionId, 'Subasta invalida.')));
}));

app.post('/api/subastas/:auctionId/ingresar', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para ingresar a una sala.');
  res.json(await enterAuctionRoom(viewer.clienteId, parsePositiveInt(req.params.auctionId, 'Subasta invalida.')));
}));

app.post('/api/subastas/:auctionId/salir', wrap(async (req, res) => {
  await requireAuthenticatedClient(req);
  res.json({ ok: true, message: 'Salida registrada.' });
}));

app.post('/api/subastas/:auctionId/pujas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const amount = parseMoney(req.body.monto ?? req.body.amount, 'Ingresa un monto valido para pujar.');
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  const paymentMethodId = req.body.medioPagoId ?? req.body.paymentMethodId;

  const bidResult = await placeAuctionBid(viewer.clienteId, auctionId, amount, paymentMethodId);
  res.status(201).json({
    bid: { id: bidResult.bid.id, amount: bidResult.bid.amount, monto: bidResult.bid.amount },
    bounds: bidResult.bounds,
    lote: toCatalogLot(bidResult.auction)
  });
}));

app.post('/api/subastas/:auctionId/items/:itemId/pujar', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const amount = parseMoney(req.body.importe ?? req.body.monto ?? req.body.amount, 'Ingresa un monto valido para pujar.');
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  const itemId = parsePositiveInt(req.params.itemId, 'Item invalido.');
  const detail = await getAuctionDetail(auctionId, viewer.clienteId);
  if (Number(detail.itemId) !== itemId && Number(detail.productId) !== itemId) throw new Error('No encontramos ese item.');
  const bidResult = await placeAuctionBid(viewer.clienteId, auctionId, amount, req.body.medioDePagoId ?? req.body.medioPagoId ?? req.body.paymentMethodId);
  res.status(201).json({
    bid: { id: bidResult.bid.id, amount: bidResult.bid.amount, monto: bidResult.bid.amount },
    bounds: bidResult.bounds,
    lote: toCatalogLot(bidResult.auction)
  });
}));

app.get('/api/subastas/:auctionId/items/:itemId/pujas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const detail = await getAuctionDetail(parsePositiveInt(req.params.auctionId, 'Subasta invalida.'), viewer.clienteId);
  const itemId = parsePositiveInt(req.params.itemId, 'Item invalido.');
  if (Number(detail.itemId) !== itemId && Number(detail.productId) !== itemId) throw new Error('No encontramos ese item.');
  const feed = await getAuctionBidFeed(detail.itemId);
  res.json(feed.slice(0, Number(req.query.limite || 20)));
}));

app.get('/api/auctions/home', wrap(async (_req, res) => {
  const viewer = await getCatalogViewer(_req, _req.query.clienteId);
  const rows = await getAuctionRows(viewer);
  res.json({
    live: rows.filter((auction) => auction.status === 'abierta'),
    upcoming: rows.filter((auction) => auction.status === 'programada')
  });
}));

app.get('/api/auctions', wrap(async (_req, res) => {
  res.json(await getAuctionRows(await getCatalogViewer(_req, _req.query.clienteId)));
}));

app.get('/api/auctions/:auctionId', wrap(async (req, res) => {
  const viewer = await getCatalogViewer(req, req.query.clienteId);
  res.json(await getAuctionDetail(parsePositiveInt(req.params.auctionId, 'Subasta invalida.'), viewer?.clienteId));
}));

app.post('/api/auctions/:auctionId/enter', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.body.clienteId);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para ingresar a una sala.');
  res.json(await enterAuctionRoom(viewer.clienteId, parsePositiveInt(req.params.auctionId, 'Subasta invalida.')));
}));

app.post('/api/auctions/:auctionId/bids', wrap(async (req, res) => {
  const amount = parseMoney(req.body.amount, 'Ingresa un monto valido para pujar.');
  const viewer = await requireMatchingClient(req, req.body.clienteId);
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  const paymentMethodId = req.body.paymentMethodId ?? req.body.medioPagoId;

  const bidResult = await placeAuctionBid(viewer.clienteId, auctionId, amount, paymentMethodId);
  res.json({ auction: bidResult.auction, bid: bidResult.bid });
}));

app.get('/api/users/:clienteId/summary', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  res.json(await getUserSummary(viewer.clienteId));
}));

app.get('/api/users/:clienteId/favorites/ids', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  if (await isGuest(viewer.clienteId)) {
    return res.json([]);
  }
  const rows = await query('SELECT subasta AS auctionId FROM favoritos WHERE cliente = ? ORDER BY creado_en DESC', [
    viewer.clienteId
  ]);
  res.json(rows.map((row) => row.auctionId));
}));

app.get('/api/users/:clienteId/favorites', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  if (await isGuest(viewer.clienteId)) return res.json([]);
  res.json(await getFavoriteAuctions(viewer.clienteId));
}));

app.post('/api/users/:clienteId/favorites/:auctionId/toggle', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para guardar favoritos.');
  const existing = await first('SELECT 1 AS found FROM favoritos WHERE cliente = ? AND subasta = ?', [
    viewer.clienteId,
    auctionId
  ]);

  if (existing) {
    await run('DELETE FROM favoritos WHERE cliente = ? AND subasta = ?', [viewer.clienteId, auctionId]);
  } else {
    await run('INSERT INTO favoritos (cliente, subasta) VALUES (?, ?)', [viewer.clienteId, auctionId]);
  }

  const rows = await query('SELECT subasta AS auctionId FROM favoritos WHERE cliente = ? ORDER BY creado_en DESC', [
    viewer.clienteId
  ]);
  res.json(rows.map((row) => row.auctionId));
}));

app.get('/api/users/:clienteId/purchases', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  if (await isGuest(viewer.clienteId)) return res.json([]);
  res.json(await getUserPurchases(viewer.clienteId));
}));

app.get('/api/users/:clienteId/lots', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  if (await isGuest(viewer.clienteId)) return res.json([]);
  res.json(await getUserLots(viewer.clienteId));
}));

app.post('/api/users/:clienteId/lots', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para cargar lotes a subasta.');
  const lot = sanitizeLotSubmission(req.body);
  await createLotSubmission(viewer.clienteId, lot);
  res.status(201).json(await getUserLots(viewer.clienteId));
}));

app.post('/api/users/:clienteId/purchases/:bidId/settle', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  const bidId = parsePositiveInt(req.params.bidId, 'Puja invalida.');
  await settlePurchase(viewer.clienteId, bidId);
  res.json(await getUserPurchases(viewer.clienteId));
}));

app.put('/api/users/:clienteId/purchases/:bidId/delivery', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  const bidId = parsePositiveInt(req.params.bidId, 'Puja invalida.');
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para cargar direcciones de entrega.');
  const deliveryAddress = normalizeAddress(req.body.deliveryAddress ?? req.body.direccionEntrega);

  const purchase = await first(
    `SELECT r.identificador AS receiptId
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     JOIN productos prod ON prod.identificador = i.producto
     JOIN registro_de_subasta r ON r.cliente = a.cliente AND r.subasta = s.identificador AND r.producto = prod.identificador
     WHERE a.cliente = ? AND p.identificador = ? AND p.ganador = 'si' AND i.cierre_estado = 'finalizada'
     LIMIT 1`,
    [viewer.clienteId, bidId]
  );

  if (!purchase) throw new Error('No encontramos una puja ganada para cargar entrega.');
  await run('UPDATE registro_de_subasta SET direccion_entrega = ? WHERE identificador = ?', [
    deliveryAddress,
    purchase.receiptId
  ]);
  res.json(await getUserPurchases(viewer.clienteId));
}));

app.get('/api/users/:clienteId/payments', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  if (await isGuest(viewer.clienteId)) return res.json([]);
  const rows = await query(
    `SELECT identificador AS id, tipo AS type, detalle AS detail, moneda AS currency,
      monto_garantia AS amount, verificado AS verified
     FROM medios_pago
     WHERE cliente = ?
     ORDER BY identificador DESC`,
    [viewer.clienteId]
  );
  res.json(rows.map((row) => ({ ...row, parsedDetail: parseDetail(row.detail) })));
}));

app.post('/api/users/:clienteId/payments', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para agregar medios de pago.');
  const payment = sanitizePayment(req.body);
  const verified = 'si';
  await run(
    `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [viewer.clienteId, payment.type, JSON.stringify(buildPaymentDetail(payment)), 'ARS', payment.amount, verified]
  );
  await refreshClientCategory(viewer.clienteId);
  const summary = await first('SELECT COUNT(*) AS paymentCount FROM medios_pago WHERE cliente = ?', [viewer.clienteId]);
  res.json(summary?.paymentCount ?? 0);
}));

app.delete('/api/users/:clienteId/payments/:paymentId', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para eliminar medios de pago.');
  await run('DELETE FROM medios_pago WHERE identificador = ? AND cliente = ?', [
    parsePositiveInt(req.params.paymentId, 'Medio de pago invalido.'),
    viewer.clienteId
  ]);
  await refreshClientCategory(viewer.clienteId);
  const summary = await first('SELECT COUNT(*) AS paymentCount FROM medios_pago WHERE cliente = ?', [viewer.clienteId]);
  res.json(summary?.paymentCount ?? 0);
}));

app.get('/api/users/:clienteId/profile', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  const profile = await getUserProfile(viewer.clienteId);
  res.json(profile);
}));

app.put('/api/users/:clienteId/profile', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para modificar tus datos.');
  const profile = sanitizeProfile(req.body);
  await assertImmutableIdentity(viewer.clienteId, profile);

  const duplicate = await first('SELECT id FROM usuarios WHERE lower(email) = ? AND id <> ?', [
    profile.email,
    profile.userId
  ]);
  if (duplicate) throw new Error('Ese correo ya esta usado por otro usuario.');

  await run('UPDATE personas SET direccion = ? WHERE identificador = ?', [profile.legalAddress, viewer.clienteId]);
  await run('UPDATE usuarios SET email = ? WHERE id = ?', [profile.email, profile.userId]);
  res.json({ email: profile.email });
}));

app.put('/api/users/:clienteId/profile/photo', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para modificar tu foto.');
  const photoUri = sanitizeUri(req.body.photoUri, 'Selecciona una foto para actualizar tu perfil.');
  await run('UPDATE personas SET foto_uri = ? WHERE identificador = ?', [
    photoUri,
    viewer.clienteId
  ]);
  res.json({ ok: true });
}));

app.get('/api/users/:clienteId/penalties', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  if (await isGuest(viewer.clienteId)) return res.json([]);
  res.json(await getUserPenalties(viewer.clienteId));
}));

app.post('/api/users/:clienteId/penalties/:penaltyId/settle', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  res.json(await settlePenalty(viewer.clienteId, parsePositiveInt(req.params.penaltyId, 'Penalidad invalida.')));
}));

app.post('/api/users/:clienteId/penalties/:penaltyId/funds', wrap(async (req, res) => {
  const viewer = await requireMatchingClient(req, req.params.clienteId);
  const paymentMethodId = req.body.medioPagoId ?? req.body.paymentMethodId;
  res.json(await presentPenaltyFunds(
    viewer.clienteId,
    parsePositiveInt(req.params.penaltyId, 'Penalidad invalida.'),
    paymentMethodId
  ));
}));

async function settlePurchase(clienteId, bidId) {
  await assertNotGuest(clienteId, 'Verifica tu cuenta para registrar compras.');
  const purchase = await first(
    `SELECT p.identificador AS id, p.importe AS amount, s.identificador AS auctionId,
      prod.identificador AS productId, prod.duenio AS ownerId, i.identificador AS itemId,
      i.comision AS commission, p.medio_pago AS paymentMethodId, r.identificador AS receiptId,
      r.estado_pago AS paymentStatus
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     JOIN productos prod ON prod.identificador = i.producto
     LEFT JOIN registro_de_subasta r ON r.cliente = a.cliente AND r.subasta = s.identificador AND r.producto = prod.identificador
     WHERE a.cliente = ? AND p.identificador = ? AND p.ganador = 'si'
     LIMIT 1`,
    [clienteId, bidId]
  );

  if (!purchase) throw new Error('No encontramos una compra pendiente para esa puja.');
  const totalDue = Number(purchase.amount || 0) + Number(purchase.commission || 0) + SHIPPING_COST;
  const payment = purchase.paymentMethodId
    ? await first(
      `SELECT monto_garantia AS guaranteeAmount
       FROM medios_pago
       WHERE identificador = ? AND cliente = ?
       LIMIT 1`,
      [purchase.paymentMethodId, clienteId]
    )
    : null;
  const availableFunds = Number(payment?.guaranteeAmount || 0);

  if (!payment || availableFunds < totalDue) {
    await registerInsufficientFundsPenalty(clienteId, purchase, totalDue, availableFunds);
    throw new Error(`Fondos insuficientes para confirmar el pago. Se genero una multa del 10% de la oferta (${formatMoney(Number(purchase.amount || 0) * 0.1)}). Debes pagarla y presentar los fondos dentro de las 72 horas.`);
  }

  if (purchase.receiptId) {
    await run('UPDATE registro_de_subasta SET estado_pago = ? WHERE identificador = ?', ['pagada', purchase.receiptId]);
  } else {
    await run(
      `INSERT INTO registro_de_subasta (subasta, duenio, producto, cliente, medio_pago, importe, comision, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchase.auctionId, purchase.ownerId, purchase.productId, clienteId, purchase.paymentMethodId, purchase.amount, purchase.commission, 'pagada']
    );
    await run('UPDATE items_catalogo SET subastado = ? WHERE identificador = ?', ['si', purchase.itemId]);
  }
}

async function registerInsufficientFundsPenalty(clienteId, purchase, totalDue, availableFunds) {
  const penaltyAmount = Math.round(Number(purchase.amount || 0) * 0.1 * 100) / 100;
  const description = `No se acreditaron fondos suficientes al confirmar el pago de ${formatMoney(purchase.amount)}. Debe abonar esta multa antes de participar en otra subasta y presentar los fondos necesarios dentro de las 72 horas. Total requerido: ${formatMoney(totalDue)}. Fondos disponibles declarados: ${formatMoney(availableFunds)}.`;
  let receiptId = purchase.receiptId;

  if (purchase.receiptId) {
    await run('UPDATE registro_de_subasta SET estado_pago = ? WHERE identificador = ?', ['multa', purchase.receiptId]);
  } else {
    const receipt = await run(
      `INSERT INTO registro_de_subasta (subasta, duenio, producto, cliente, medio_pago, importe, comision, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchase.auctionId, purchase.ownerId, purchase.productId, clienteId, purchase.paymentMethodId, purchase.amount, purchase.commission, 'multa']
    );
    receiptId = receipt.insertId;
  }

  const existing = await first(
    `SELECT identificador AS id
     FROM penalidades p
     JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.cliente = ? AND pf.puja = ? AND p.estado IN ('activa', 'vencida')
     LIMIT 1`,
    [clienteId, purchase.id]
  );

  if (!existing) {
    const penalty = await run(
      `INSERT INTO penalidades (cliente, titulo, descripcion, importe, estado, vencimiento)
       VALUES (?, ?, ?, ?, ?, DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 72 HOUR)))`,
      [
        clienteId,
        `Multa por falta de fondos - puja ${purchase.id}`,
        description,
        penaltyAmount,
        'activa'
      ]
    );
    await run(
      `INSERT INTO penalidad_falta_fondos (penalidad, puja, registro, total_requerido, vencimiento_fondos)
       VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 72 HOUR))`,
      [penalty.insertId, purchase.id, receiptId, totalDue]
    );
  } else {
    await run(
      `UPDATE penalidades p
       JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
       SET pf.registro = COALESCE(pf.registro, ?),
         pf.total_requerido = ?,
         p.descripcion = ?,
         p.vencimiento = COALESCE(p.vencimiento, DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 72 HOUR))),
         pf.vencimiento_fondos = COALESCE(pf.vencimiento_fondos, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 72 HOUR))
       WHERE p.identificador = ?`,
      [receiptId, totalDue, description, existing.id]
    );
  }

  await refreshClientCategory(clienteId);
}

async function savePurchaseDelivery(clienteId, bidId, value) {
  const deliveryAddress = normalizeAddress(value);

  const purchase = await first(
    `SELECT r.identificador AS receiptId
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     JOIN productos prod ON prod.identificador = i.producto
     JOIN registro_de_subasta r ON r.cliente = a.cliente AND r.subasta = s.identificador AND r.producto = prod.identificador
     WHERE a.cliente = ? AND p.identificador = ? AND p.ganador = 'si'
     LIMIT 1`,
    [clienteId, bidId]
  );

  if (!purchase) throw new Error('No encontramos una puja ganada para cargar entrega.');
  await run('UPDATE registro_de_subasta SET direccion_entrega = ? WHERE identificador = ?', [
    deliveryAddress,
    purchase.receiptId
  ]);
}

async function settlePenalty(clienteId, penaltyId) {
  await assertNotGuest(clienteId, 'Verifica tu cuenta para resolver penalidades.');
  await expireOverduePenalties(clienteId);
  const penalty = await first(
    `SELECT p.identificador AS id, CASE WHEN pf.penalidad IS NULL THEN 'general' ELSE 'falta_fondos' END AS type,
      p.estado AS status, pf.fondos_presentados AS fundsPresented, pf.multa_pagada_en AS finePaidAt
     FROM penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.identificador = ? AND p.cliente = ?
     LIMIT 1`,
    [penaltyId, clienteId]
  );
  if (!penalty) throw new Error('No encontramos esa penalidad.');
  if (penalty.status === 'vencida') {
    throw new Error('La penalidad vencio y la cuenta quedo bloqueada por falta de presentacion de fondos.');
  }
  if (penalty.status !== 'activa') {
    throw new Error('Esa penalidad ya esta solucionada.');
  }

  const solved = penalty.type !== 'falta_fondos' || penalty.fundsPresented === 'si';
  await run(
    `UPDATE penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     SET pf.multa_pagada_en = COALESCE(pf.multa_pagada_en, UTC_TIMESTAMP()),
       p.estado = ?
     WHERE p.identificador = ? AND p.cliente = ?`,
    [solved ? 'pagada' : 'activa', penaltyId, clienteId]
  );
  if (!solved) {
    await refreshClientCategory(clienteId);
    return getUserPenalties(clienteId);
  }

  await markPurchasePaidIfPenaltySolved(clienteId, penaltyId);
  await refreshClientCategory(clienteId);
  return getUserPenalties(clienteId);
}

async function presentPenaltyFunds(clienteId, penaltyId, paymentMethodId = null) {
  await assertNotGuest(clienteId, 'Verifica tu cuenta para resolver penalidades.');
  await expireOverduePenalties(clienteId);
  const penalty = await first(
    `SELECT p.identificador AS id, CASE WHEN pf.penalidad IS NULL THEN 'general' ELSE 'falta_fondos' END AS type,
      p.estado AS status, pf.total_requerido AS totalRequired,
      pf.fondos_presentados AS fundsPresented, pf.multa_pagada_en AS finePaidAt
     FROM penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.identificador = ? AND p.cliente = ?
     LIMIT 1`,
    [penaltyId, clienteId]
  );
  if (!penalty) throw new Error('No encontramos esa penalidad.');
  if (penalty.status === 'vencida') {
    throw new Error('La penalidad vencio y la cuenta quedo bloqueada por falta de presentacion de fondos.');
  }
  if (penalty.status !== 'activa') throw new Error('Esa penalidad ya esta solucionada.');
  if (penalty.type !== 'falta_fondos') throw new Error('Esta penalidad no requiere presentacion de fondos.');
  if (penalty.fundsPresented === 'si') throw new Error('Los fondos ya fueron presentados.');

  const payment = await resolvePenaltyPayment(clienteId, paymentMethodId);
  const required = Number(penalty.totalRequired || 0);
  if (Number(payment.guaranteeAmount || 0) < required) {
    throw new Error(`El medio seleccionado no cubre el total requerido de ${formatMoney(required)}.`);
  }

  const solved = Boolean(penalty.finePaidAt);
  await run(
    `UPDATE penalidades p
     JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     SET pf.fondos_presentados = 'si',
       pf.fondos_presentados_en = UTC_TIMESTAMP(),
       p.estado = ?
     WHERE p.identificador = ? AND p.cliente = ?`,
    [solved ? 'pagada' : 'activa', penaltyId, clienteId]
  );
  if (solved) {
    await markPurchasePaidIfPenaltySolved(clienteId, penaltyId);
  }
  await refreshClientCategory(clienteId);
  return getUserPenalties(clienteId);
}

async function resolvePenaltyPayment(clienteId, paymentMethodId = null) {
  if (paymentMethodId) {
    const payment = await first(
      `SELECT identificador AS id, monto_garantia AS guaranteeAmount
       FROM medios_pago
       WHERE identificador = ? AND cliente = ? AND verificado = 'si'
       LIMIT 1`,
      [parsePositiveInt(paymentMethodId, 'Medio de pago invalido.'), clienteId]
    );
    if (!payment) throw new Error('Selecciona un medio de pago verificado para presentar fondos.');
    return payment;
  }

  const payment = await first(
    `SELECT identificador AS id, monto_garantia AS guaranteeAmount
     FROM medios_pago
     WHERE cliente = ? AND verificado = 'si'
     ORDER BY monto_garantia DESC
     LIMIT 1`,
    [clienteId]
  );
  if (!payment) throw new Error('Necesitas un medio de pago verificado para presentar fondos.');
  return payment;
}

async function markPurchasePaidIfPenaltySolved(clienteId, penaltyId) {
  const penalty = await first(
    `SELECT pf.registro AS receiptId
     FROM penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.identificador = ? AND p.cliente = ?
       AND p.estado = 'pagada'
       AND (pf.penalidad IS NULL OR (pf.multa_pagada_en IS NOT NULL AND pf.fondos_presentados = 'si'))
     LIMIT 1`,
    [penaltyId, clienteId]
  );
  if (penalty?.receiptId) {
    await run('UPDATE registro_de_subasta SET estado_pago = ? WHERE identificador = ? AND cliente = ?', [
      'pagada',
      penalty.receiptId,
      clienteId
    ]);
  }
}

async function expireOverduePenalties(clienteId = null) {
  const params = [];
  const clientFilter = clienteId ? 'AND p.cliente = ?' : '';
  if (clienteId) params.push(clienteId);

  const overdue = await query(
    `SELECT DISTINCT cliente AS clienteId
     FROM penalidades p
     JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.estado = 'activa'
       AND pf.fondos_presentados = 'no'
       AND pf.vencimiento_fondos <= UTC_TIMESTAMP()
       ${clientFilter}`,
    params
  );

  if (overdue.length === 0) return;

  await run(
    `UPDATE penalidades p
     JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     SET p.estado = 'vencida'
     WHERE p.estado = 'activa'
       AND pf.fondos_presentados = 'no'
       AND pf.vencimiento_fondos <= UTC_TIMESTAMP()
       ${clientFilter}`,
    params
  );

  for (const row of overdue) {
    await run('UPDATE usuarios SET estado = ? WHERE cliente_id = ?', ['bloqueado', row.clienteId]);
  }
}

async function resolveAuctionIdFromItemOrAuction(value) {
  const id = parsePositiveInt(value, 'Item invalido.');
  const item = await first(
    `SELECT s.identificador AS auctionId
     FROM items_catalogo i
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     WHERE i.identificador = ? OR s.identificador = ?
     LIMIT 1`,
    [id, id]
  );
  if (!item) throw new Error('No encontramos ese item.');
  return item.auctionId;
}

async function getUserBids(clienteId, filters = {}) {
  const status = normalizeWhitespace(filters.estado ?? filters.status).toLowerCase();
  const auctionId = filters.subastaId || filters.auctionId
    ? parsePositiveInt(filters.subastaId ?? filters.auctionId, 'Subasta invalida.')
    : null;
  const rows = await query(
    `SELECT p.identificador AS id, p.importe AS amount, p.ganador AS winner, p.creado_en AS createdAt,
      s.identificador AS auctionId, s.titulo AS title, i.cierre_estado AS closureStatus,
      i.timer_vencimiento AS timerExpiresAt,
      winner.identificador AS winnerBidId
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     LEFT JOIN pujos winner ON winner.item = i.identificador AND winner.ganador = 'si'
     WHERE a.cliente = ?
       ${auctionId ? 'AND s.identificador = ?' : ''}
     ORDER BY p.identificador DESC
     LIMIT 50`,
    auctionId ? [clienteId, auctionId] : [clienteId]
  );

  const mapped = rows.map((row) => {
    let bidStatus = 'perdida';
    if (row.winner === 'si' && row.closureStatus === 'finalizada') bidStatus = 'ganadora';
    else if (row.winner === 'si') bidStatus = 'liderando';
    else if (row.winnerBidId && Number(row.winnerBidId) !== Number(row.id)) bidStatus = 'superada';
    return {
      ...row,
      amount: Number(row.amount),
      estado: bidStatus,
      status: bidStatus
    };
  });

  return status ? mapped.filter((bid) => bid.status === status) : mapped;
}

async function getAuctionRows(viewer = null) {
  await settleExpiredAuctionTimers();
  const restrictedCatalog = !viewer || viewer.rol === 'invitado';
  const rows = await query(
    `SELECT s.identificador AS id, s.titulo AS title, DATE_FORMAT(s.fecha, '%Y-%m-%d') AS date,
      s.hora AS time, s.estado AS status, s.categoria AS category, s.moneda AS currency,
      s.ubicacion AS location, COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description, i.precio_base AS basePrice, i.puja_actual AS currentBid,
      i.cierre_estado AS closureStatus,
      GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), i.timer_vencimiento)) AS timerSecondsRemaining
     FROM subastas s
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN (
       SELECT catalogo,
         COALESCE(
           MIN(CASE WHEN cierre_estado <> 'finalizada' THEN orden_lote END),
           MAX(orden_lote)
         ) AS orden_actual
       FROM items_catalogo
       GROUP BY catalogo
     ) catalogo_actual ON catalogo_actual.catalogo = c.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador AND i.orden_lote = catalogo_actual.orden_actual
     JOIN productos p ON p.identificador = i.producto
     ${restrictedCatalog ? "WHERE s.estado = 'programada'" : ''}
     ORDER BY CASE s.estado WHEN 'abierta' THEN 0 WHEN 'programada' THEN 1 ELSE 2 END, s.fecha ASC`
  );

  return restrictedCatalog ? rows.map(redactAuctionPrice) : rows;
}

async function getAuctionDetail(auctionId, clienteId) {
  await settleExpiredAuctionTimers();
  await ensureActiveAuctionItem(auctionId);
  const viewer = await getViewer(clienteId);
  const restrictedCatalog = !viewer || viewer.rol === 'invitado';
  const auction = await first(
    `SELECT s.identificador AS id, s.titulo AS title, s.titulo AS auctionTitle, DATE_FORMAT(s.fecha, '%Y-%m-%d') AS date,
      s.hora AS time, s.estado AS status, s.categoria AS category, s.moneda AS currency,
      s.ubicacion AS location, s.capacidad_asistentes AS capacity,
      COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl, p.descripcion_catalogo AS description,
      p.descripcion_catalogo AS itemTitle, p.descripcion_completa AS fullDescription, p.identificador AS productId,
      i.identificador AS itemId, i.precio_base AS basePrice, i.comision AS commission,
      i.puja_actual AS currentBid, i.subastado AS sold,
      i.orden_lote AS lotPosition,
      (SELECT COUNT(*) FROM items_catalogo lot_items WHERE lot_items.catalogo = c.identificador) AS lotItemCount,
      i.timer_inicio AS timerStartedAt, i.timer_vencimiento AS timerExpiresAt,
      i.cierre_estado AS closureStatus, i.cierre_motivo AS closureReason,
      GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), i.timer_vencimiento)) AS timerSecondsRemaining,
      per.nombre AS auctioneer
     FROM subastas s
     JOIN subastadores sub ON sub.identificador = s.subastador
     JOIN personas per ON per.identificador = sub.identificador
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     WHERE s.identificador = ?
     ORDER BY CASE WHEN i.cierre_estado = 'finalizada' THEN 1 ELSE 0 END,
       CASE WHEN i.cierre_estado = 'finalizada' THEN -i.orden_lote ELSE i.orden_lote END ASC
     LIMIT 1`,
    [auctionId]
  );
  if (!auction) throw new Error('No encontramos esa subasta.');
  if (restrictedCatalog && auction.status !== 'programada') {
    throw new Error('Como invitado solo podes ver subastas futuras.');
  }

  const payment = restrictedCatalog
    ? { verifiedPayments: 0 }
    : await first(
      `SELECT COUNT(*) AS verifiedPayments FROM medios_pago WHERE cliente = ? AND verificado = 'si'`,
      [clienteId]
    );

  const detail = {
    ...auction,
    catalog: await getAuctionCatalogLots(auctionId, viewer),
    bidFeed: restrictedCatalog ? [] : await getAuctionBidFeed(auction.itemId),
    closure: restrictedCatalog ? null : await getAuctionClosure(auction.itemId, clienteId),
    isFavorite: restrictedCatalog ? false : await isFavoriteAuction(clienteId, auctionId),
    eligibility: {
      categoryOk: !restrictedCatalog && await hasCategoryAccess(clienteId, auction.category),
      verifiedPayments: restrictedCatalog ? 0 : payment?.verifiedPayments ?? 0
    }
  };

  return restrictedCatalog ? redactAuctionPrice(detail) : detail;
}

async function getAuctionCatalogLots(auctionId, viewer = null) {
  const restrictedCatalog = !viewer || viewer.rol === 'invitado';
  const rows = await query(
    `SELECT s.identificador AS id, s.estado AS status, s.titulo AS auctionTitle,
      p.descripcion_catalogo AS description, p.descripcion_completa AS fullDescription,
      p.identificador AS productId, p.imagen_uri AS imageUrl,
      i.identificador AS itemId, i.precio_base AS basePrice, i.puja_actual AS currentBid,
      i.orden_lote AS lotPosition, i.comision AS commission, i.subastado AS sold, i.cierre_estado AS closureStatus,
      i.timer_inicio AS timerStartedAt, i.timer_vencimiento AS timerExpiresAt
     FROM subastas s
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     WHERE s.identificador = ?
     ORDER BY i.orden_lote ASC, i.identificador ASC`,
    [auctionId]
  );

  return restrictedCatalog ? rows.map(redactAuctionPrice) : rows;
}

async function enterAuctionRoom(clienteId, auctionId) {
  const detail = await getAuctionDetail(auctionId, clienteId);
  if (detail.status !== 'abierta') throw new Error('La sala todavia no esta abierta.');
  await assertNoActivePenalties(clienteId);
  if (!detail.eligibility.categoryOk) throw new Error('Tu categoria no permite participar en esta subasta.');
  if (detail.eligibility.verifiedPayments < 1) {
    throw new Error('Necesitas registrar un medio de pago verificado para pujar.');
  }
  await ensureAssistant(clienteId, auctionId);
  return detail;
}

async function getAuctionBidFeed(itemId) {
  const rows = await query(
    `SELECT p.identificador AS id, p.importe AS amount, p.creado_en AS createdAt,
      p.ganador AS winner, p.medio_pago AS paymentMethodId, a.numero_postor AS bidderNumber
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     WHERE p.item = ?
     ORDER BY p.identificador DESC`,
    [itemId]
  );
  return rows.map((row) => ({ ...row, bidderAlias: `@postor${String(row.bidderNumber).padStart(3, '0')}` }));
}

async function getAuctionClosure(itemId, clienteId = null) {
  const item = await first(
    `SELECT i.cierre_estado AS status, i.cierre_motivo AS reason, i.subastado AS sold,
      i.timer_vencimiento AS timerExpiresAt,
      GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), i.timer_vencimiento)) AS secondsRemaining
     FROM items_catalogo i
     WHERE i.identificador = ?
     LIMIT 1`,
    [itemId]
  );

  const winningBid = await first(
    `SELECT p.identificador AS bidId, p.importe AS amount, p.medio_pago AS paymentMethodId,
      a.cliente AS clienteId, a.numero_postor AS bidderNumber
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     WHERE p.item = ? AND p.ganador = 'si'
     ORDER BY p.identificador DESC
     LIMIT 1`,
    [itemId]
  );

  return {
    reason: item?.reason ?? null,
    secondsRemaining: Number(item?.secondsRemaining ?? 0),
    sold: item?.sold === 'si',
    status: item?.status ?? 'esperando_puja',
    timerExpiresAt: item?.timerExpiresAt ?? null,
    winner: winningBid
      ? {
          amount: Number(winningBid.amount),
          bidId: winningBid.bidId,
          bidderAlias: `@postor${String(winningBid.bidderNumber).padStart(3, '0')}`,
          isCurrentUser: Number(winningBid.clienteId) === Number(clienteId),
          paymentMethodId: winningBid.paymentMethodId
        }
      : null
  };
}

async function resolveBidPayment(clienteId, paymentMethodId, amount) {
  const requestedId = paymentMethodId ? parsePositiveInt(paymentMethodId, 'Medio de pago invalido.') : null;
  const payment = await first(
    `SELECT identificador AS id, monto_garantia AS guaranteeAmount
     FROM medios_pago
     WHERE cliente = ? AND verificado = 'si'
       ${requestedId ? 'AND identificador = ?' : ''}
     ORDER BY identificador ASC
     LIMIT 1`,
    requestedId ? [clienteId, requestedId] : [clienteId]
  );

  if (!payment) {
    throw new Error(requestedId ? 'Selecciona un medio de pago verificado.' : 'Necesitas un medio de pago verificado para pujar.');
  }

  const guaranteeAmount = Number(payment.guaranteeAmount || 0);
  if (guaranteeAmount > 0) {
    const used = await first(
      `SELECT COALESCE(SUM(p.importe), 0) AS total
       FROM pujos p
       JOIN asistentes a ON a.identificador = p.asistente
       WHERE a.cliente = ? AND p.medio_pago = ? AND p.ganador = 'si'`,
      [clienteId, payment.id]
    );
    const nextTotal = Number(used?.total || 0) + Number(amount || 0);
    if (nextTotal > guaranteeAmount) {
      throw new Error(`La puja supera la garantia disponible de ${formatMoney(guaranteeAmount)} para ese medio de pago.`);
    }
  }

  return payment.id;
}

async function getActiveLeadingBid(clienteId) {
  await settleExpiredAuctionTimers();
  return first(
    `SELECT p.identificador AS bidId, p.importe AS amount, i.identificador AS itemId,
      s.identificador AS auctionId, s.titulo AS title
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     WHERE a.cliente = ?
       AND p.ganador = 'si'
       AND i.cierre_estado = 'en_cuenta'
       AND i.timer_vencimiento > UTC_TIMESTAMP()
       AND s.estado = 'abierta'
     ORDER BY i.timer_vencimiento ASC
     LIMIT 1`,
    [clienteId]
  );
}

async function ensureActiveAuctionItem(auctionId) {
  const auction = await first(
    'SELECT identificador AS id, estado AS status FROM subastas WHERE identificador = ? LIMIT 1',
    [auctionId]
  );
  if (!auction || auction.status !== 'abierta') return null;

  const item = await first(
    `SELECT identificador AS itemId, timer_vencimiento AS timerExpiresAt
     FROM items_catalogo
     WHERE catalogo = (SELECT identificador FROM catalogos WHERE subasta = ? LIMIT 1)
       AND cierre_estado <> 'finalizada'
     ORDER BY orden_lote ASC, identificador ASC
     LIMIT 1`,
    [auctionId]
  );

  if (!item) {
    await run('UPDATE subastas SET estado = ? WHERE identificador = ? AND estado = ?', ['cerrada', auctionId, 'abierta']);
    return null;
  }

  if (!item.timerExpiresAt) {
    await run(
      `UPDATE items_catalogo
       SET timer_inicio = UTC_TIMESTAMP(), timer_vencimiento = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
         cierre_estado = 'esperando_puja', cierre_motivo = NULL
       WHERE identificador = ? AND cierre_estado <> 'finalizada' AND timer_vencimiento IS NULL`,
      [FIRST_BID_TIMER_SECONDS, item.itemId]
    );
  }

  return item.itemId;
}

async function ensureOpenAuctionItems() {
  const auctions = await query("SELECT identificador AS id FROM subastas WHERE estado = 'abierta'");
  for (const auction of auctions) {
    await ensureActiveAuctionItem(auction.id);
  }
}

async function settleExpiredAuctionTimers() {
  await ensureOpenAuctionItems();
  const rows = await query(
    `SELECT i.identificador AS itemId
     FROM items_catalogo i
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     WHERE s.estado = 'abierta'
       AND i.cierre_estado IN ('esperando_puja', 'en_cuenta')
       AND i.timer_vencimiento IS NOT NULL
       AND i.timer_vencimiento <= UTC_TIMESTAMP()
     ORDER BY i.timer_vencimiento ASC
     LIMIT 20`
  );

  for (const row of rows) {
    await finalizeAuctionItem(row.itemId);
  }
}

async function finalizeAuctionItem(itemId) {
  const item = await first(
    `SELECT i.identificador AS itemId, i.precio_base AS basePrice, i.comision AS commission,
      i.cierre_estado AS closureStatus, c.subasta AS auctionId, p.identificador AS productId,
      p.duenio AS ownerId
     FROM items_catalogo i
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN productos p ON p.identificador = i.producto
     WHERE i.identificador = ?
     LIMIT 1`,
    [itemId]
  );

  if (!item || item.closureStatus === 'finalizada') return null;

  const lastBid = await first(
    `SELECT p.identificador AS bidId, p.importe AS amount, p.medio_pago AS paymentMethodId, a.cliente AS clienteId
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     WHERE p.item = ?
     ORDER BY p.identificador DESC
     LIMIT 1`,
    [itemId]
  );

  const buyerClientId = lastBid?.clienteId ?? COMPANY_CLIENT_ID;
  const amount = Number(lastBid?.amount ?? item.basePrice);
  const paymentMethodId = lastBid?.paymentMethodId ?? null;
  const reason = lastBid ? 'adjudicada_por_tiempo' : 'compra_empresa_sin_pujas';

  if (lastBid) {
    await run('UPDATE pujos SET ganador = ? WHERE item = ?', ['no', itemId]);
    await run('UPDATE pujos SET ganador = ? WHERE identificador = ?', ['si', lastBid.bidId]);
  }

  const receipt = await first(
    `SELECT identificador AS id
     FROM registro_de_subasta
     WHERE subasta = ? AND producto = ?
     LIMIT 1`,
    [item.auctionId, item.productId]
  );

  if (!receipt) {
    await run(
      `INSERT INTO registro_de_subasta (subasta, duenio, producto, cliente, medio_pago, importe, comision, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.auctionId, item.ownerId, item.productId, buyerClientId, paymentMethodId, amount, item.commission, 'pendiente']
    );
  }

  await run(
    `UPDATE items_catalogo
     SET subastado = ?, cierre_estado = 'finalizada', cierre_motivo = ?
     WHERE identificador = ?`,
    ['si', reason, itemId]
  );
  await ensureActiveAuctionItem(item.auctionId);

  if (lastBid) {
    await refreshClientCategory(buyerClientId);
  }

  return { amount, buyerClientId, itemId, reason };
}

async function ensureAssistant(clienteId, auctionId) {
  const existing = await first('SELECT identificador AS id FROM asistentes WHERE cliente = ? AND subasta = ? LIMIT 1', [
    clienteId,
    auctionId
  ]);
  if (existing) return existing.id;

  const next = await first('SELECT COALESCE(MAX(numero_postor), 40) + 1 AS number FROM asistentes WHERE subasta = ?', [
    auctionId
  ]);
  const result = await run('INSERT INTO asistentes (numero_postor, cliente, subasta) VALUES (?, ?, ?)', [
    next?.number ?? 41,
    clienteId,
    auctionId
  ]);
  return result.insertId;
}

async function placeAuctionBid(clienteId, auctionId, amount, paymentMethodId = null) {
  await assertNotGuest(clienteId, 'Verifica tu cuenta para pujar.');
  if (amount <= 0) throw new Error('Ingresa un monto valido para pujar.');

  const detail = await enterAuctionRoom(clienteId, auctionId);
  if (detail.closureStatus === 'finalizada' || detail.status === 'cerrada') {
    throw new Error('Esta subasta ya finalizo.');
  }
  const activeLeadingBid = await getActiveLeadingBid(clienteId);
  if (activeLeadingBid) {
    throw new Error(`Ya vas primero en "${activeLeadingBid.title}". Podes mirar otras subastas, pero no ofertar hasta que te superen o cierre el contador.`);
  }
  const currentBid = Number(detail.currentBid || detail.basePrice || 0);
  const basePrice = Number(detail.basePrice || 0);
  const hasBidRangeLimit = BID_RANGE_LIMIT_CATEGORIES.has(String(detail.category || '').toLowerCase());
  const minBid = currentBid + basePrice * 0.01;
  const maxBid = currentBid + basePrice * 0.2;

  if (amount <= currentBid) throw new Error(`El monto debe superar la puja actual de ${formatMoney(currentBid)}.`);
  if (hasBidRangeLimit && amount < minBid) throw new Error(`El monto debe ser al menos ${formatMoney(minBid)}.`);
  if (hasBidRangeLimit && amount > maxBid) {
    throw new Error(`Para categorias comun, especial y plata, el monto no puede superar ${formatMoney(maxBid)}.`);
  }

  const resolvedPaymentId = await resolveBidPayment(clienteId, paymentMethodId, amount);
  const assistantId = await ensureAssistant(clienteId, auctionId);
  await run('UPDATE pujos SET ganador = ? WHERE item = ?', ['no', detail.itemId]);
  const result = await run('INSERT INTO pujos (asistente, item, medio_pago, importe, ganador) VALUES (?, ?, ?, ?, ?)', [
    assistantId,
    detail.itemId,
    resolvedPaymentId,
    amount,
    'si'
  ]);
  await run(
    `UPDATE items_catalogo
     SET puja_actual = ?, timer_inicio = UTC_TIMESTAMP(), timer_vencimiento = ?,
       cierre_estado = 'en_cuenta', cierre_motivo = NULL
     WHERE identificador = ?`,
    [amount, toMysqlDateTime(new Date(Date.now() + BID_TIMER_SECONDS * 1000)), detail.itemId]
  );
  await refreshClientCategory(clienteId);

  return {
    auction: await getAuctionDetail(auctionId, clienteId),
    bid: { id: result.insertId, amount },
    bounds: { min: hasBidRangeLimit ? minBid : currentBid + 1, max: hasBidRangeLimit ? maxBid : null }
  };
}

async function getClientCategory(clienteId) {
  const row = await first('SELECT categoria AS category FROM clientes WHERE identificador = ?', [clienteId]);
  return row?.category ?? 'comun';
}

async function hasCategoryAccess(clienteId, auctionCategory) {
  const userCategory = await getClientCategory(clienteId);
  return categoryRank[userCategory] >= categoryRank[auctionCategory];
}

async function getViewer(clienteId) {
  if (!clienteId) return null;

  return first(
    `SELECT u.cliente_id AS clienteId, u.rol, u.email_verificado AS emailVerified, c.categoria
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE u.cliente_id = ?
     LIMIT 1`,
    [Number(clienteId)]
  );
}

async function getCatalogViewer(req, clienteId) {
  const requestedClientId = clienteId ? parsePositiveInt(clienteId, 'Cliente invalido.') : null;
  const viewer = await getOptionalAuthenticatedClient(req);

  if (!requestedClientId) return viewer;
  if (!viewer) return null;
  if (Number(viewer.clienteId) !== Number(requestedClientId)) return null;

  return viewer;
}

async function getOptionalAuthenticatedClient(req) {
  const token = bearerToken(req) || req.query.access_token;
  if (!token) return null;

  const session = await first(
    `SELECT s.token AS sessionToken, u.id, u.email, u.nombre, u.rol, u.estado,
      u.cliente_id AS clienteId, c.categoria, c.admitido,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE s.token = ? AND s.expira_en > NOW()
     LIMIT 1`,
    [token]
  );

  if (!session) return null;
  await expireOverduePenalties(session.clienteId);

  const currentStatus = await first('SELECT estado FROM usuarios WHERE id = ? LIMIT 1', [session.id]);
  session.estado = currentStatus?.estado ?? session.estado;

  const pendingGuest = session.rol === 'invitado' && session.estado === 'pendiente';
  if ((session.estado !== 'activo' && !pendingGuest) || session.admitido !== 'si') return null;
  return session;
}

async function requireMatchingClient(req, clienteId) {
  const requestedClientId = parsePositiveInt(clienteId, 'Cliente invalido.');
  const viewer = await requireAuthenticatedClient(req);

  if (Number(viewer.clienteId) !== Number(requestedClientId)) {
    throw new Error('No tenes permisos para operar sobre esta cuenta.');
  }

  return viewer;
}

async function requireAuthenticatedClient(req) {
  const viewer = await getOptionalAuthenticatedClient(req);
  if (!viewer) {
    throw new Error('Inicia sesion para continuar.');
  }
  return viewer;
}

async function requireAccountReviewer(req) {
  const configuredToken = process.env.ADMIN_REVIEW_TOKEN;
  const providedToken = req.headers['x-admin-review-token'] || req.headers['x-admin-token'];
  if (configuredToken) {
    if (providedToken !== configuredToken) {
      throw new Error('No tenes permisos para validar cuentas.');
    }
    return;
  }

  const viewer = await requireAuthenticatedClient(req);
  if (viewer.rol !== 'admin') {
    throw new Error('No tenes permisos para validar cuentas.');
  }
}

async function isGuest(clienteId) {
  const viewer = await getViewer(clienteId);
  return viewer?.rol === 'invitado';
}

async function assertNotGuest(clienteId, message) {
  if (await isGuest(clienteId)) {
    throw new Error(message);
  }
}

async function assertNoActivePenalties(clienteId) {
  await expireOverduePenalties(clienteId);
  const penalties = await first(
    `SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN pf.multa_pagada_en IS NULL THEN p.importe ELSE 0 END), 0) AS amount
     FROM penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.cliente = ? AND p.estado IN ('activa', 'vencida')`,
    [clienteId]
  );

  if (Number(penalties?.total || 0) > 0) {
    throw new Error(`Tenes penalidades pendientes por ${formatMoney(penalties.amount)}. Debes pagar las multas y presentar los fondos requeridos antes de participar en otra subasta.`);
  }
}

function redactAuctionPrice(auction) {
  return {
    ...auction,
    basePrice: null,
    currentBid: null,
    commission: null
  };
}

async function isFavoriteAuction(clienteId, auctionId) {
  const row = await first('SELECT 1 AS found FROM favoritos WHERE cliente = ? AND subasta = ?', [
    clienteId,
    auctionId
  ]);
  return Boolean(row);
}

async function getFavoriteAuctions(clienteId) {
  return query(
    `SELECT s.identificador AS id, s.titulo AS title, DATE_FORMAT(s.fecha, '%Y-%m-%d') AS date,
      s.hora AS time, s.estado AS status, s.categoria AS category, s.moneda AS currency,
      s.ubicacion AS location, COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description, i.precio_base AS basePrice, i.puja_actual AS currentBid,
      f.creado_en AS favoritedAt
     FROM favoritos f
     JOIN subastas s ON s.identificador = f.subasta
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     WHERE f.cliente = ?
     ORDER BY f.creado_en DESC`,
    [clienteId]
  );
}

async function getUserPayments(clienteId) {
  const rows = await query(
    `SELECT identificador AS id, tipo AS type, detalle AS detail, moneda AS currency,
      monto_garantia AS amount, verificado AS verified
     FROM medios_pago
     WHERE cliente = ?
     ORDER BY identificador DESC`,
    [clienteId]
  );
  return rows.map((row) => ({ ...row, parsedDetail: parseDetail(row.detail) }));
}

async function getUserNotifications(viewer) {
  const notifications = [];
  const guest = viewer.rol === 'invitado';

  if (guest) {
    notifications.push({
      id: 'verify-account',
      action: 'verify_account',
      createdAt: new Date().toISOString(),
      description: 'Ingresa el codigo de un solo uso para activar precios, pagos y pujas.',
      priority: 'alta',
      read: false,
      target: 'verifyAccount',
      title: 'Verifica tu cuenta'
    });
  }

  const activePenalties = await first(
    `SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN pf.multa_pagada_en IS NULL THEN p.importe ELSE 0 END), 0) AS amount
     FROM penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.cliente = ? AND p.estado IN ('activa', 'vencida')`,
    [viewer.clienteId]
  );

  if (Number(activePenalties?.total || 0) > 0) {
    notifications.push({
      id: 'active-penalties',
      action: 'open_penalties',
      createdAt: new Date().toISOString(),
      description: `Tenes ${activePenalties.total} penalidad pendiente por ${formatMoney(activePenalties.amount)}.`,
      priority: 'alta',
      read: false,
      target: 'penalties',
      title: 'Penalidades pendientes'
    });
  }

  if (!guest) {
    const payment = await first(
      `SELECT COUNT(*) AS total
       FROM medios_pago
       WHERE cliente = ? AND verificado = 'si'`,
      [viewer.clienteId]
    );

    if (Number(payment?.total || 0) === 0) {
      notifications.push({
        id: 'add-payment',
        action: 'add_payment',
        createdAt: new Date().toISOString(),
        description: 'Necesitas al menos un medio de pago verificado para entrar a salas y pujar.',
        priority: 'media',
        read: false,
        target: 'payments',
        title: 'Agrega un medio de pago'
      });
    }

    const pendingPurchase = await first(
      `SELECT p.identificador AS bidId, p.importe AS amount, i.comision AS commission, s.titulo AS title
       FROM pujos p
       JOIN asistentes a ON a.identificador = p.asistente
       JOIN items_catalogo i ON i.identificador = p.item
       JOIN catalogos c ON c.identificador = i.catalogo
       JOIN subastas s ON s.identificador = c.subasta
       JOIN registro_de_subasta r ON r.cliente = a.cliente AND r.subasta = s.identificador AND r.producto = i.producto
       WHERE a.cliente = ? AND p.ganador = 'si' AND i.cierre_estado = 'finalizada' AND r.estado_pago = 'pendiente'
       ORDER BY p.identificador DESC
       LIMIT 1`,
      [viewer.clienteId]
    );

    if (pendingPurchase) {
      const totalDue = Number(pendingPurchase.amount || 0) + Number(pendingPurchase.commission || 0) + SHIPPING_COST;
      notifications.push({
        id: `purchase-due-${pendingPurchase.bidId}`,
        action: 'open_purchases',
        createdAt: new Date().toISOString(),
        description: `${pendingPurchase.title}: puja ${formatMoney(pendingPurchase.amount)}, comision ${formatMoney(pendingPurchase.commission)} y envio ${formatMoney(SHIPPING_COST)}. Total ${formatMoney(totalDue)}.`,
        priority: 'alta',
        read: false,
        target: 'purchases',
        title: 'Subasta adjudicada'
      });
    }

    const outbid = await first(
      `SELECT p.identificador AS bidId, p.importe AS previousAmount,
        winner.importe AS currentAmount, s.identificador AS auctionId, s.titulo AS title
       FROM pujos p
       JOIN asistentes a ON a.identificador = p.asistente
       JOIN items_catalogo i ON i.identificador = p.item
       JOIN catalogos c ON c.identificador = i.catalogo
       JOIN subastas s ON s.identificador = c.subasta
       JOIN pujos winner ON winner.item = i.identificador AND winner.ganador = 'si'
       JOIN asistentes winnerAssistant ON winnerAssistant.identificador = winner.asistente
       WHERE a.cliente = ?
         AND p.ganador = 'no'
         AND winnerAssistant.cliente <> a.cliente
         AND i.cierre_estado = 'en_cuenta'
         AND i.timer_vencimiento > UTC_TIMESTAMP()
         AND s.estado = 'abierta'
       ORDER BY p.identificador DESC
       LIMIT 1`,
      [viewer.clienteId]
    );

    if (outbid) {
      notifications.push({
        id: `outbid-${outbid.bidId}`,
        action: 'open_auction',
        createdAt: new Date().toISOString(),
        description: `${outbid.title}: te superaron. Tu puja fue ${formatMoney(outbid.previousAmount)} y ahora va ${formatMoney(outbid.currentAmount)}.`,
        priority: 'alta',
        read: false,
        target: `auction:${outbid.auctionId}`,
        title: 'Te superaron en una subasta'
      });
    }
  }

  const upcoming = await first(
    `SELECT s.identificador AS id, s.titulo AS title, DATE_FORMAT(s.fecha, '%Y-%m-%d') AS date, s.categoria AS category
     FROM subastas s
     WHERE s.estado = 'programada'
     ORDER BY s.fecha ASC, s.hora ASC
     LIMIT 1`
  );

  if (upcoming) {
    notifications.push({
      id: `upcoming-auction-${upcoming.id}`,
      action: guest ? 'open_auctions' : 'open_auction',
      createdAt: new Date().toISOString(),
      description: `${upcoming.title} esta programada para ${upcoming.date}. Categoria ${upcoming.category}.`,
      priority: 'baja',
      read: true,
      target: guest ? 'auctions' : `auction:${upcoming.id}`,
      title: 'Subasta futura destacada'
    });
  }

  const lot = await first(
    `SELECT identificador AS id, titulo AS title, estado AS status
     FROM solicitudes_lotes
     WHERE cliente = ?
     ORDER BY actualizado_en DESC, identificador DESC
     LIMIT 1`,
    [viewer.clienteId]
  );

  if (lot) {
    notifications.push({
      id: `lot-${lot.id}`,
      action: 'open_lots',
      createdAt: new Date().toISOString(),
      description: `${lot.title} esta en estado ${lot.status}.`,
      priority: lot.status === 'rechazado' ? 'alta' : 'media',
      read: lot.status !== 'rechazado',
      target: 'purchases',
      title: 'Seguimiento de venta'
    });
  }

  if (notifications.length === 0) {
    notifications.push({
      id: 'account-ready',
      action: 'open_auctions',
      createdAt: new Date().toISOString(),
      description: 'Tu cuenta no tiene acciones pendientes. Podes revisar subastas abiertas y futuras.',
      priority: 'baja',
      read: true,
      target: 'auctions',
      title: 'Cuenta al dia'
    });
  }

  return notifications;
}

async function getUserSummary(clienteId) {
  const metrics = await getCategoryMetrics(clienteId);
  const currentCategory = await refreshClientCategory(clienteId, metrics);
  const nextCategory = getNextCategory(currentCategory);

  return {
    ...metrics,
    categoryRequirements,
    currentCategory,
    nextCategory,
    nextCategoryRequirement: categoryRequirements.find((rule) => rule.category === nextCategory) ?? null
  };
}

async function getCategoryMetrics(clienteId) {
  await expireOverduePenalties(clienteId);
  const payments = await first(
    `SELECT COUNT(*) AS verifiedPayments FROM medios_pago WHERE cliente = ? AND verificado = 'si'`,
    [clienteId]
  );
  const bids = await first(
    `SELECT COUNT(*) AS totalBids
     FROM pujos p JOIN asistentes a ON a.identificador = p.asistente
     WHERE a.cliente = ?`,
    [clienteId]
  );
  const wins = await first(
    `SELECT COUNT(*) AS totalWins, COALESCE(SUM(p.importe), 0) AS invested
     FROM pujos p JOIN asistentes a ON a.identificador = p.asistente
     WHERE a.cliente = ? AND p.ganador = 'si'`,
    [clienteId]
  );
  const penalties = await first(
    `SELECT COUNT(*) AS activePenaltyCount
     FROM penalidades
     WHERE cliente = ? AND estado IN ('activa', 'vencida')`,
    [clienteId]
  );

  return {
    activePenaltyCount: Number(penalties?.activePenaltyCount ?? 0),
    invested: Number(wins?.invested ?? 0),
    totalBids: Number(bids?.totalBids ?? 0),
    totalWins: Number(wins?.totalWins ?? 0),
    verifiedPayments: Number(payments?.verifiedPayments ?? 0)
  };
}

async function refreshClientCategory(clienteId, metrics = null) {
  const calculatedCategory = calculateCategory(metrics ?? await getCategoryMetrics(clienteId));
  const currentCategory = await getClientCategory(clienteId);
  const nextCategory = categoryRank[calculatedCategory] > categoryRank[currentCategory]
    ? calculatedCategory
    : currentCategory;

  if (nextCategory !== currentCategory) {
    await run('UPDATE clientes SET categoria = ? WHERE identificador = ?', [nextCategory, clienteId]);
  }

  return nextCategory;
}

function calculateCategory(metrics) {
  return categoryRequirements.reduce((current, rule) => (
    categoryRequirementMet(metrics, rule) ? rule.category : current
  ), 'comun');
}

function categoryRequirementMet(metrics, rule) {
  return (
    (metrics.verifiedPayments ?? 0) >= (rule.minVerifiedPayments ?? 0) &&
    (metrics.totalBids ?? 0) >= (rule.minBids ?? 0) &&
    (metrics.totalWins ?? 0) >= (rule.minWins ?? 0) &&
    (metrics.invested ?? 0) >= (rule.minInvested ?? 0) &&
    (metrics.activePenaltyCount ?? 0) <= (rule.maxActivePenalties ?? Number.MAX_SAFE_INTEGER)
  );
}

function getNextCategory(category) {
  const index = categoryRequirements.findIndex((rule) => rule.category === category);
  return index >= 0 ? categoryRequirements[index + 1]?.category ?? null : 'especial';
}

async function getUserPurchases(clienteId) {
  return query(
    `SELECT p.identificador AS id, p.importe AS amount, p.creado_en AS createdAt,
      p.ganador AS winner, s.identificador AS auctionId, s.titulo AS title,
      s.moneda AS currency, prod.identificador AS productId, prod.duenio AS ownerId,
      i.identificador AS itemId, i.comision AS commission, p.medio_pago AS paymentMethodId,
      r.identificador AS receiptId, r.medio_pago AS receiptPaymentMethodId, r.estado_pago AS receiptPaymentStatus,
      r.direccion_entrega AS deliveryAddress,
      ? AS shippingCost, (p.importe + i.comision + ?) AS totalDue,
      COALESCE(r.estado_pago, 'pendiente') AS paymentStatus,
      COALESCE(prod.imagen_uri, s.imagen_uri) AS imageUrl
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     JOIN productos prod ON prod.identificador = i.producto
     LEFT JOIN registro_de_subasta r ON r.cliente = a.cliente AND r.subasta = s.identificador AND r.producto = prod.identificador
     WHERE a.cliente = ? AND p.ganador = 'si' AND i.cierre_estado = 'finalizada'
     ORDER BY CASE WHEN r.identificador IS NULL THEN 0 ELSE 1 END, p.identificador DESC`,
    [SHIPPING_COST, SHIPPING_COST, clienteId]
  );
}

async function getUserLots(clienteId) {
  const rows = await query(
    `SELECT identificador AS id, cliente AS clienteId, titulo AS title, modo_lote AS lotKind,
      tipo_bien AS itemType, cantidad AS quantity, valor_estimado AS estimatedValue,
      composicion AS composition, descripcion AS description, estado_conservacion AS conditionText,
      historia AS history, origen_licito AS legalOrigin, cuenta_cobro AS payoutAccount,
      declaracion_titularidad AS ownershipDeclaration, acepta_devolucion_cargo AS returnChargeAccepted,
      estado AS status, motivo_rechazo AS rejectionReason, ubicacion_deposito AS storageLocation,
      poliza_seguro AS insurancePolicy, aseguradora AS insuranceCompany,
      DATE_FORMAT(fecha_subasta, '%Y-%m-%d') AS auctionDate, hora_subasta AS auctionTime,
      lugar_subasta AS auctionLocation, valor_base AS basePrice, comision AS commission,
      creado_en AS createdAt, actualizado_en AS updatedAt
     FROM solicitudes_lotes
     WHERE cliente = ?
     ORDER BY identificador DESC`,
    [clienteId]
  );

  const lots = [];
  for (const row of rows) {
    const photos = await query(
      `SELECT identificador AS id, uri, orden AS position
       FROM fotos_lote
       WHERE solicitud = ?
       ORDER BY orden ASC, identificador ASC`,
      [row.id]
    );
    lots.push({
      ...row,
      photoUris: photos.map((photo) => photo.uri),
      photos,
      payoutAccount: parseDetail(row.payoutAccount)
    });
  }

  return lots;
}

async function createLotSubmission(clienteId, lot) {
  const result = await run(
    `INSERT INTO solicitudes_lotes (
      cliente, titulo, modo_lote, tipo_bien, cantidad, valor_estimado, composicion, descripcion, estado_conservacion,
      historia, origen_licito, cuenta_cobro, declaracion_titularidad, acepta_devolucion_cargo, estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clienteId,
      lot.title,
      lot.lotKind,
      lot.itemType,
      lot.quantity,
      lot.estimatedValue,
      lot.composition,
      lot.description,
      lot.condition,
      lot.history,
      lot.legalOrigin,
      JSON.stringify(lot.payoutAccount),
      'si',
      'si',
      'pendiente'
    ]
  );

  for (const [index, uri] of lot.photoUris.entries()) {
    await run('INSERT INTO fotos_lote (solicitud, uri, orden) VALUES (?, ?, ?)', [
      result.insertId,
      uri,
      index + 1
    ]);
  }

  return result;
}

function toSaleRequestContract(lot) {
  return {
    ...lot,
    composicion: lot.composition,
    declaracionPropiedad: lot.ownershipDeclaration === 'si' || lot.ownershipDeclaration === true,
    descripcion: lot.description,
    estado: lot.status,
    fecha: lot.createdAt,
    fotos: lot.photoUris?.length || 0,
    nombreBien: lot.title,
    precioEstimado: Number(lot.estimatedValue || 0),
    tipoLote: lot.lotKind,
    uploadIds: lot.photoUris || [],
    userId: String(lot.clienteId || '')
  };
}

function toCatalogLot(detail) {
  return {
    id: String(detail.itemId || detail.productId || detail.id),
    descripcion: detail.description,
    estado: detail.status,
    fotos: detail.imageUrl ? [detail.imageUrl] : [],
    loteId: String(detail.itemId || detail.productId || detail.id),
    nombre: detail.title || detail.auctionTitle || detail.description,
    precioBase: detail.basePrice,
    pujaActual: detail.currentBid
  };
}

function toLegacyUser(profile, viewer) {
  return {
    id: String(profile?.clienteId ?? viewer.clienteId),
    apellido: profile?.identityLastName ?? '',
    categoria: profile?.categoria ?? viewer.categoria,
    email: profile?.email ?? viewer.email,
    estado: viewer.estado,
    ganadas: Number(profile?.auctionsWon || 0),
    mediosPagoVerificados: Number(viewer.paymentCount || 0),
    nombre: profile?.identityFirstName ?? viewer.nombre,
    participaciones: Number(profile?.auctionsAttended || 0)
  };
}

async function getUserProfile(clienteId) {
  await expireOverduePenalties(clienteId);
  const profile = await first(
    `SELECT p.identificador AS clienteId, p.documento, p.nombre AS fullName, p.direccion AS legalAddress,
      p.foto_uri AS photoUri, u.id AS userId, u.email, u.nombre AS firstName, c.categoria,
      c.numero_pais AS countryNumber, pa.nombre AS countryName,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = p.identificador) AS paymentCount,
      (SELECT COUNT(*) FROM asistentes a WHERE a.cliente = p.identificador) AS auctionsAttended,
      (SELECT COUNT(*) FROM pujos pu JOIN asistentes a ON a.identificador = pu.asistente WHERE a.cliente = p.identificador AND pu.ganador = 'si') AS auctionsWon,
      (SELECT COALESCE(SUM(pu.importe), 0) FROM pujos pu JOIN asistentes a ON a.identificador = pu.asistente WHERE a.cliente = p.identificador AND pu.ganador = 'si') AS invested,
      (SELECT COUNT(*) FROM penalidades pe WHERE pe.cliente = p.identificador AND pe.estado IN ('activa', 'vencida')) AS activePenaltyCount,
      (SELECT COALESCE(SUM(CASE WHEN pf.multa_pagada_en IS NULL THEN pe.importe ELSE 0 END), 0)
       FROM penalidades pe
       LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = pe.identificador
       WHERE pe.cliente = p.identificador AND pe.estado IN ('activa', 'vencida')) AS activePenaltyAmount
     FROM personas p
     JOIN clientes c ON c.identificador = p.identificador
     JOIN usuarios u ON u.cliente_id = c.identificador
     LEFT JOIN paises pa ON pa.numero = c.numero_pais
     WHERE p.identificador = ?`,
    [clienteId]
  );
  if (!profile) return null;
  return { ...profile, identityFirstName: getFirstName(profile.fullName), identityLastName: getLastName(profile.fullName) };
}

async function getUserPenalties(clienteId) {
  await expireOverduePenalties(clienteId);
  return query(
    `SELECT p.identificador AS id, CASE WHEN pf.penalidad IS NULL THEN 'general' ELSE 'falta_fondos' END AS type,
      pf.puja AS bidId, pf.registro AS receiptId,
      p.titulo AS title, p.descripcion AS description, p.importe AS amount, pf.total_requerido AS totalRequired,
      pf.multa_pagada_en AS finePaidAt, pf.fondos_presentados AS fundsPresented,
      pf.fondos_presentados_en AS fundsPresentedAt, p.estado AS status,
      DATE_FORMAT(COALESCE(pf.vencimiento_fondos, p.vencimiento), '%Y-%m-%d %H:%i:%s') AS dueAt,
      DATE_FORMAT(p.vencimiento, '%Y-%m-%d') AS dueDate, p.creado_en AS createdAt
     FROM penalidades p
     LEFT JOIN penalidad_falta_fondos pf ON pf.penalidad = p.identificador
     WHERE p.cliente = ?
     ORDER BY CASE p.estado WHEN 'activa' THEN 0 WHEN 'vencida' THEN 1 ELSE 2 END, COALESCE(pf.vencimiento_fondos, p.vencimiento) ASC`,
    [clienteId]
  );
}

async function assertImmutableIdentity(clienteId, payload) {
  const current = await first('SELECT documento, nombre AS fullName FROM personas WHERE identificador = ?', [clienteId]);
  if (!current) throw new Error('No encontramos tu perfil.');
  const immutableFields = [
    [payload.firstName, getFirstName(current.fullName), 'El nombre no se puede modificar.'],
    [payload.lastName, getLastName(current.fullName), 'El apellido no se puede modificar.'],
    [payload.documento, current.documento, 'El documento no se puede modificar.']
  ];
  for (const [nextValue, currentValue, message] of immutableFields) {
    if (nextValue != null && normalizeIdentityValue(nextValue) !== normalizeIdentityValue(currentValue)) {
      throw new Error(message);
    }
  }
}

async function assertUniqueIdentityDocument(documentNumber, documentType = 'dni') {
  const existing = await first(
    `SELECT identificador
     FROM personas
     WHERE documento = ? AND tipo_documento = ?
     LIMIT 1`,
    [documentNumber, documentType]
  );

  if (existing) {
    throw new Error('Ese documento ya esta registrado. Inicia sesion para continuar.');
  }
}

function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function errorHandler(error, _req, res, _next) {
  res.status(400).json({ message: error.message || 'Error inesperado.' });
}

function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function queueVerificationForUser({ email, name, token }) {
  const configured = hasEmailProviderConfig();

  void sendVerificationEmail({ to: email, name, token })
    .then((result) => {
      if (!result?.sent) {
        console.warn(`El codigo de verificacion para ${email} quedo pendiente: ${result?.reason || 'proveedor no disponible'}.`);
      }
    })
    .catch((error) => {
      console.warn(`No se pudo enviar verificacion a ${email}: ${error.message}`);
    });

  return { sent: configured, queued: true };
}

async function sendVerificationForUser({ email, name, token }) {
  const timeoutMs = Number(process.env.MAIL_RESPONSE_TIMEOUT_MS || 20000);
  const sendPromise = sendVerificationEmail({ to: email, name, token }).catch((error) => {
    console.warn(`No se pudo enviar verificacion a ${email}: ${error.message}`);
    return { sent: false, skipped: false, reason: 'send_failed' };
  });

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`Envio de verificacion a ${email} demorado. La cuenta queda pendiente y puede reintentar.`);
      resolve({ sent: false, skipped: false, reason: 'send_timeout' });
    }, timeoutMs);
  });

  const result = await Promise.race([sendPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

async function sendAccountReviewForUser({ accepted = true, email, name }) {
  const timeoutMs = Number(process.env.MAIL_RESPONSE_TIMEOUT_MS || 20000);
  const sendPromise = sendAccountReviewEmail({ accepted, to: email, name }).catch((error) => {
    console.warn(`No se pudo enviar validacion de cuenta a ${email}: ${error.message}`);
    return { sent: false, skipped: false, reason: 'send_failed' };
  });

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`Envio de validacion de cuenta a ${email} demorado. Se continua con el codigo de email.`);
      resolve({ sent: false, skipped: false, reason: 'send_timeout' });
    }, timeoutMs);
  });

  const result = await Promise.race([sendPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

async function sendPasswordResetForUser({ email, name, token }) {
  const timeoutMs = Number(process.env.MAIL_RESPONSE_TIMEOUT_MS || 20000);
  const sendPromise = sendPasswordResetEmail({ to: email, name, token }).catch((error) => {
    console.warn(`No se pudo enviar recuperacion a ${email}: ${error.message}`);
    return { sent: false, skipped: false, reason: 'send_failed' };
  });

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`Envio de recuperacion a ${email} demorado. Puede reintentar.`);
      resolve({ sent: false, skipped: false, reason: 'send_timeout' });
    }, timeoutMs);
  });

  const result = await Promise.race([sendPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

async function assertPendingGuestCode(user, codeValue) {
  const code = normalizeOneTimeCode(codeValue);
  if (!code) throw new Error('Ingresa el codigo de un solo uso para volver a entrar.');
  if (!user.verificationCodeHash) throw new Error('Solicita un nuevo codigo de verificacion.');
  if (Number(user.verificationCodeExpired)) {
    throw new Error('El codigo vencio. Solicita uno nuevo.');
  }

  const codeResult = await verifyPassword(code, user.verificationCodeHash);
  if (!codeResult.ok) throw new Error('El codigo ingresado no es correcto.');
}

function normalizeToken(value = '') {
  const token = normalizeWhitespace(value);
  return /^[A-Za-z0-9._:-]{20,220}$/.test(token) ? token : '';
}

function sendVerificationHtml(res, status, title, message) {
  res.status(status).send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - EliteBid</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f3f4f6; color: #111827; }
      main { max-width: 520px; margin: 12vh auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 16px 40px rgba(17, 24, 39, 0.12); }
      h1 { margin: 0 0 12px; font-size: 26px; }
      p { margin: 0; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loginForRegister(email, password) {
  const user = await first(
    `SELECT u.id, u.email, u.password, u.nombre, u.rol, u.estado, u.cliente_id AS clienteId,
      c.categoria, c.admitido, (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM usuarios u JOIN clientes c ON c.identificador = u.cliente_id WHERE lower(u.email) = ?`,
    [email]
  );
  const token = createToken();
  await run('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)', [
    token,
    user.id,
    toMysqlDateTime(new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000))
  ]);
  return toSessionUser(user, token);
}

function toSessionUser(user, token) {
  return {
    id: user.id,
    sessionToken: token,
    clienteId: user.clienteId,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
    estado: user.estado,
    categoria: user.categoria,
    paymentCount: user.paymentCount ?? 0
  };
}

function createToken() {
  return `elite-${crypto.randomBytes(32).toString('hex')}`;
}

function createOneTimeCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function fromLegacyRegistrationInput(payload) {
  const documentFrontUri =
    payload.documentFrontUri ||
    payload.documentoFrente ||
    payload.documentos?.frente ||
    payload.documentos?.front ||
    payload.documentos?.[0] ||
    'https://elitebid.local/uploads/documento-frente.jpg';
  const documentBackUri =
    payload.documentBackUri ||
    payload.documentoDorso ||
    payload.documentos?.dorso ||
    payload.documentos?.back ||
    payload.documentos?.[1] ||
    documentFrontUri;

  return {
    ...payload,
    documentBackUri,
    documentFrontUri,
    documentNumber: payload.documentNumber ?? payload.documento ?? payload.dni ?? payload.numeroDocumento,
    documentType: payload.documentType ?? payload.tipoDocumento ?? 'dni',
    email: payload.email,
    firstName: payload.firstName ?? payload.nombre,
    lastName: payload.lastName ?? payload.apellido,
    legalAddress: payload.legalAddress ?? payload.domicilioLegal ?? payload.direccion
  };
}

function sanitizeRegistration(form) {
  const required = [
    ['firstName', 'Ingresa tu nombre.'],
    ['lastName', 'Ingresa tu apellido.'],
    ['documentNumber', 'Ingresa tu documento.'],
    ['documentFrontUri', 'Carga la foto del frente del documento.'],
    ['documentBackUri', 'Carga la foto del dorso del documento.'],
    ['legalAddress', 'Ingresa tu domicilio legal.'],
    ['email', 'Ingresa tu correo.'],
    ['password', 'Crea una clave.'],
    ['confirmPassword', 'Confirma tu clave.']
  ];

  for (const [key, message] of required) {
    if (!String(form[key] ?? '').trim()) throw new Error(message);
  }

  const sanitized = {
    firstName: normalizePersonName(form.firstName, 'Ingresa un nombre valido.'),
    lastName: normalizePersonName(form.lastName, 'Ingresa un apellido valido.'),
    documentNumber: normalizeDocument(form.documentNumber),
    documentFrontUri: sanitizeUri(form.documentFrontUri, 'Carga la foto del frente del documento.'),
    documentBackUri: sanitizeUri(form.documentBackUri, 'Carga la foto del dorso del documento.'),
    legalAddress: normalizeAddress(form.legalAddress),
    email: normalizeEmail(form.email),
    password: String(form.password),
    confirmPassword: String(form.confirmPassword)
  };

  if (!sanitized.email) throw new Error('Ingresa un correo valido.');
  validatePassword(form.password, form.confirmPassword);

  return sanitized;
}

function sanitizeGuestRegistration(form) {
  const required = [
    ['firstName', 'Ingresa tu nombre.'],
    ['lastName', 'Ingresa tu apellido.'],
    ['documentNumber', 'Ingresa tu documento.'],
    ['documentFrontUri', 'Carga la foto del frente del documento.'],
    ['email', 'Ingresa tu correo para verificar tu cuenta.']
  ];
  if (normalizeDocumentType(form.documentType) === 'dni') {
    required.push(['documentBackUri', 'Carga la foto del dorso del documento.']);
  }

  for (const [key, message] of required) {
    if (!String(form[key] ?? '').trim()) throw new Error(message);
  }

  const sanitized = {
    firstName: normalizePersonName(form.firstName, 'Ingresa un nombre valido.'),
    lastName: normalizePersonName(form.lastName, 'Ingresa un apellido valido.'),
    documentType: normalizeDocumentType(form.documentType),
    documentFrontUri: sanitizeUri(form.documentFrontUri, 'Carga la foto del frente del documento.'),
    legalAddress: form.legalAddress ? normalizeAddress(form.legalAddress) : 'Pendiente De Completar',
    email: normalizeEmail(form.email)
  };
  sanitized.documentNumber = normalizeIdentityDocument(form.documentNumber, sanitized.documentType);
  sanitized.documentBackUri =
    sanitized.documentType === 'dni'
      ? sanitizeUri(form.documentBackUri, 'Carga la foto del dorso del documento.')
      : sanitized.documentFrontUri;

  if (!sanitized.email) throw new Error('Ingresa un correo valido.');

  return sanitized;
}

function validatePassword(password, confirmPassword) {
  const value = String(password ?? '');

  if (value !== String(confirmPassword ?? '')) throw new Error('Las claves no coinciden.');
  if (value.length < 8 || value.length > 72 || !/\d/.test(value) || !/[A-Za-z]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('La clave debe tener entre 8 y 72 caracteres, una letra, un numero y un simbolo.');
  }
  if (/\s/.test(value)) throw new Error('La clave no puede contener espacios.');
}

function sanitizePayment(payload) {
  const rawType = normalizeWhitespace(payload.type).toLowerCase();
  const type = rawType === 'cuenta_bancaria' ? 'cuenta' : rawType;
  const amount = parseMoney(payload.amount, 'Ingresa un monto de garantia mayor a cero.');

  if (!['tarjeta', 'cuenta', 'cheque'].includes(type)) {
    throw new Error('Selecciona un tipo de medio de pago valido.');
  }
  if (amount <= 0 || amount > 999999999.99) {
    throw new Error('Ingresa un monto de garantia mayor a cero.');
  }

  const sanitized = { ...payload, type, amount };

  if (type === 'tarjeta') {
    requireFields(sanitized, [
      ['cardNumber', 'Ingresa el numero de tarjeta.'],
      ['cardHolder', 'Ingresa el nombre del titular.'],
      ['expiry', 'Ingresa el vencimiento.'],
      ['cvv', 'Ingresa el CVV.']
    ]);
    sanitized.cardNumber = onlyDigits(sanitized.cardNumber);
    sanitized.cardHolder = normalizePersonName(sanitized.cardHolder, 'Ingresa un titular valido.');
    sanitized.expiry = normalizeExpiry(sanitized.expiry);
    sanitized.cvv = onlyDigits(sanitized.cvv);

    if (sanitized.cardNumber.length < 13 || sanitized.cardNumber.length > 16 || !isValidCardNumber(sanitized.cardNumber)) {
      throw new Error('Ingresa un numero de tarjeta valido.');
    }
    if (!/^\d{3,4}$/.test(sanitized.cvv)) {
      throw new Error('Ingresa un CVV valido.');
    }
    if (!sanitized.expiry) {
      throw new Error('Ingresa el vencimiento con formato MM/AA.');
    }
  }
  if (type === 'cuenta') {
    requireFields(sanitized, [
      ['bank', 'Ingresa el banco.'],
      ['accountType', 'Ingresa el tipo de cuenta.'],
      ['cbu', 'Ingresa el CBU o CVU.'],
      ['alias', 'Ingresa el alias.']
    ]);
    sanitized.bank = normalizeTitleText(sanitized.bank, 'Ingresa un banco valido.');
    sanitized.accountType = normalizeTitleText(sanitized.accountType, 'Ingresa un tipo de cuenta valido.');
    sanitized.cbu = onlyDigits(sanitized.cbu);
    sanitized.alias = normalizeAlias(sanitized.alias);

    if (sanitized.cbu.length !== 22) {
      throw new Error('Ingresa un CBU o CVU de 22 digitos.');
    }
    if (!sanitized.alias) {
      throw new Error('Ingresa un alias valido.');
    }
  }
  if (type === 'cheque') {
    requireFields(sanitized, [
      ['bank', 'Ingresa el banco emisor.'],
      ['checkNumber', 'Ingresa el numero de cheque.'],
      ['issueDate', 'Ingresa la fecha de emision.'],
      ['checkImageUri', 'Carga una foto del cheque certificado.']
    ]);
    sanitized.bank = normalizeTitleText(sanitized.bank, 'Ingresa un banco valido.');
    sanitized.checkNumber = onlyDigits(sanitized.checkNumber);
    sanitized.issueDate = normalizeDate(sanitized.issueDate, 'Ingresa una fecha de emision valida.');
    sanitized.checkImageUri = sanitizeUri(sanitized.checkImageUri, 'Carga una foto del cheque certificado.');
    assertNotFutureDate(sanitized.issueDate, 'La fecha de emision del cheque no puede ser futura.');

    if (sanitized.checkNumber.length < 4 || sanitized.checkNumber.length > 20) {
      throw new Error('Ingresa un numero de cheque valido.');
    }
  }

  return sanitized;
}

function requireFields(payload, fields) {
  for (const [key, message] of fields) if (!String(payload[key] ?? '').trim()) throw new Error(message);
}

function buildPaymentDetail(payload) {
  if (payload.type === 'tarjeta') {
    return {
      brand: detectCardBrand(payload.cardNumber),
      cardHolder: payload.cardHolder.trim(),
      cardNumberLast4: lastFour(payload.cardNumber),
      expiry: payload.expiry.trim()
    };
  }
  if (payload.type === 'cuenta') {
    return {
      bank: payload.bank.trim(),
      accountType: payload.accountType.trim(),
      cbuLast4: lastFour(payload.cbu),
      alias: payload.alias.trim()
    };
  }
  return {
    bank: payload.bank.trim(),
    checkNumberLast4: lastFour(payload.checkNumber),
    issueDate: payload.issueDate.trim(),
    checkImageUri: payload.checkImageUri.trim()
  };
}

function fromLegacyPaymentInput(payload) {
  const rawType = normalizeWhitespace(payload.tipo ?? payload.type).toLowerCase();
  const type = rawType === 'cuenta_bancaria' ? 'cuenta' : rawType;
  if (type === 'tarjeta') {
    const lastDigits = onlyDigits(payload.ultimosDigitos || '').slice(-4) || '1111';
    return {
      type,
      amount: payload.montoGarantia ?? payload.amount ?? 1,
      cardHolder: payload.titular ?? payload.cardHolder,
      cardNumber: payload.cardNumber ?? payload.numero ?? `411111111111${lastDigits}`,
      cvv: payload.cvv ?? '123',
      expiry: payload.expiry ?? '12/29'
    };
  }
  if (type === 'cuenta') {
    return {
      type,
      amount: payload.montoGarantia ?? payload.amount ?? 1,
      accountType: payload.accountType ?? 'Cuenta bancaria',
      alias: payload.alias,
      bank: payload.banco ?? payload.bank,
      cbu: payload.cbu
    };
  }
  return {
    type,
    amount: payload.montoGarantia ?? payload.amount ?? 1,
    bank: payload.banco ?? payload.bank,
    checkImageUri: payload.checkImageUri ?? payload.uploadIds?.[0] ?? 'https://elitebid.local/uploads/cheque.jpg',
    checkNumber: payload.numero ?? payload.checkNumber,
    issueDate: payload.issueDate ?? new Date().toISOString().slice(0, 10)
  };
}

function fromSaleRequestInput(payload) {
  const uploadIds = Array.isArray(payload.uploadIds) ? payload.uploadIds : [];
  const photoUris = Array.isArray(payload.photoUris) ? payload.photoUris : uploadIds;
  const expectedPhotos = Number(payload.fotos || photoUris.length || 0);
  const fallbackPhotos = Array.from({ length: Math.max(0, expectedPhotos) }).map(
    (_, index) => `https://elitebid.local/uploads/solicitud-${Date.now()}-${index + 1}.jpg`
  );

  return {
    ...payload,
    condition: payload.condition ?? payload.estadoConservacion ?? 'Pendiente de inspeccion por la empresa.',
    composition: payload.composition ?? payload.composicion ?? '',
    description: payload.description ?? payload.descripcion,
    estimatedValue: payload.estimatedValue ?? payload.precioEstimado,
    history: payload.history ?? payload.historia ?? 'Sin historia adicional declarada.',
    itemType: payload.itemType ?? payload.tipoBien ?? 'Bien a subastar',
    legalOrigin: payload.legalOrigin ?? payload.origenLicito ?? 'Acreditacion pendiente de presentar ante la empresa.',
    lotKind: payload.lotKind ?? payload.tipoLote ?? 'unico',
    ownershipDeclaration: payload.ownershipDeclaration ?? payload.declaracionPropiedad,
    payoutAccountHolder: payload.payoutAccountHolder ?? payload.titularCobro ?? 'Titular a confirmar',
    payoutBank: payload.payoutBank ?? payload.bancoCobro ?? 'Banco a confirmar',
    payoutReference: payload.payoutReference ?? payload.referenciaCobro ?? 'Cuenta a confirmar',
    photoUris: photoUris.length ? photoUris : fallbackPhotos,
    quantity: payload.quantity ?? payload.cantidad ?? 1,
    returnChargeAccepted: payload.returnChargeAccepted ?? payload.aceptaDevolucionCargo ?? true,
    title: payload.title ?? payload.nombreBien
  };
}

function sanitizeLotSubmission(payload) {
  requireFields(payload, [
    ['title', 'Ingresa el nombre del lote o producto.'],
    ['itemType', 'Ingresa el tipo de lote o categoria principal.'],
    ['quantity', 'Ingresa la cantidad de productos o piezas.'],
    ['description', 'Describe la venta que queres subastar.'],
    ['condition', 'Indica el estado de conservacion.'],
    ['history', 'Agrega la historia o datos relevantes del bien.'],
    ['legalOrigin', 'Indica como podes acreditar el origen licito.'],
    ['payoutBank', 'Ingresa el banco de la cuenta de cobro.'],
    ['payoutAccountHolder', 'Ingresa el titular de la cuenta de cobro.'],
    ['payoutReference', 'Ingresa CBU, CVU, IBAN o alias de cobro.']
  ]);

  const photoUris = Array.isArray(payload.photoUris)
    ? payload.photoUris.map((uri) => sanitizeUri(uri, 'Revisa las fotos del lote.'))
    : [];
  if (photoUris.length < 6) {
    throw new Error('Carga al menos 6 fotos del bien o lote.');
  }
  if (photoUris.length > 10) {
    throw new Error('Carga hasta 10 fotos por solicitud.');
  }

  if (!toBoolean(payload.ownershipDeclaration)) {
    throw new Error('Debes declarar que el bien te pertenece y no tiene impedimentos.');
  }
  if (!toBoolean(payload.returnChargeAccepted)) {
    throw new Error('Debes aceptar la devolucion con cargo si la empresa no acepta el bien.');
  }

  const quantity = parseQuantity(payload.quantity);
  const lotKind = normalizeLotKind(payload.lotKind);
  const composition = normalizeWhitespace(payload.composition);
  if (lotKind === 'variado' && composition.length < 10) {
    throw new Error('Detalla que productos distintos componen el lote variado.');
  }
  if (composition.length > 1600) {
    throw new Error('Resume la composicion del lote.');
  }
  const estimatedValue = payload.estimatedValue
    ? parseMoney(payload.estimatedValue, 'Ingresa un valor estimado valido.')
    : 0;
  if (estimatedValue > 999999999.99) {
    throw new Error('Ingresa un valor estimado menor.');
  }

  return {
    title: normalizeLotText(payload.title, 'Ingresa un nombre de lote valido.', 180),
    lotKind,
    itemType: normalizeLotText(payload.itemType, 'Ingresa un tipo de bien valido.', 120),
    quantity,
    estimatedValue,
    composition,
    description: normalizeLotText(payload.description, 'Describe el bien con mas detalle.', 1200, 20),
    condition: normalizeLotText(payload.condition, 'Indica el estado de conservacion con mas detalle.', 800, 10),
    history: normalizeLotText(payload.history, 'Agrega historia, procedencia o datos relevantes.', 1600, 10),
    legalOrigin: normalizeLotText(payload.legalOrigin, 'Indica como podes acreditar el origen licito.', 1200, 10),
    payoutAccount: {
      accountHolder: normalizePersonName(payload.payoutAccountHolder, 'Ingresa un titular de cuenta valido.'),
      bank: normalizeLotText(payload.payoutBank, 'Ingresa un banco valido.', 120),
      reference: normalizeLotText(payload.payoutReference, 'Ingresa CBU, CVU, IBAN o alias valido.', 80)
    },
    photoUris
  };
}

function normalizeLotKind(value = '') {
  return normalizeWhitespace(value).toLowerCase() === 'variado' ? 'variado' : 'unico';
}

function normalizeLotText(value, message, maxLength, minLength = 2) {
  const text = normalizeWhitespace(value);
  if (text.length < minLength || text.length > maxLength) {
    throw new Error(message);
  }
  return text;
}

function parseQuantity(value) {
  const quantity = Number(onlyDigits(value));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error('Ingresa una cantidad de piezas valida.');
  }
  return quantity;
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 'si' || value === 1 || value === '1';
}

function isRejectedReviewValue(value) {
  if (value === false) return true;
  const normalized = normalizeWhitespace(value).toLowerCase();
  return ['false', 'no', 'rechazada', 'rechazado', 'rejected'].includes(normalized);
}

function parseDetail(detail) {
  if (typeof detail === 'object' && detail) return detail;
  try {
    return JSON.parse(detail);
  } catch {
    const digits = String(detail).replace(/\D/g, '');
    return { label: detail, brand: detail, cardNumberLast4: digits.slice(-4), cbuLast4: digits.slice(-4), checkNumberLast4: digits.slice(-4) };
  }
}

function lastFour(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits.slice(-4) || '0000';
}

function detectCardBrand(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('4')) return 'VISA';
  if (digits.startsWith('5')) return 'Mastercard';
  if (digits.startsWith('3')) return 'Amex';
  return 'Tarjeta';
}

function isValidCardNumber(value = '') {
  const digits = onlyDigits(value);
  if (!/^\d{13,16}$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function sanitizeProfile(payload) {
  const profile = {
    userId: parsePositiveInt(payload.userId, 'Usuario invalido.'),
    email: normalizeEmail(payload.email),
    legalAddress: normalizeAddress(payload.legalAddress),
    firstName: payload.firstName == null ? null : normalizePersonName(payload.firstName, 'El nombre no se puede modificar.'),
    lastName: payload.lastName == null ? null : normalizePersonName(payload.lastName, 'El apellido no se puede modificar.'),
    documento: payload.documento == null ? null : normalizeDocument(payload.documento)
  };

  if (!profile.email) {
    throw new Error('Ingresa un correo valido.');
  }

  return profile;
}

function getFirstName(fullName = '') {
  return String(fullName).trim().split(/\s+/)[0] ?? '';
}

function getLastName(fullName = '') {
  return String(fullName).trim().split(/\s+/).slice(1).join(' ');
}

function normalizeIdentityValue(value = '') {
  return normalizeWhitespace(value).toLowerCase();
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function normalizeWhitespace(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmail(value = '') {
  const email = normalizeWhitespace(value).toLowerCase();

  if (!email || email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return '';
  }

  return email;
}

function maskEmail(email = '') {
  const [local = '', domain = ''] = String(email).split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function normalizeDocument(value = '') {
  const documentNumber = onlyDigits(value);

  if (documentNumber.length < 7 || documentNumber.length > 12) {
    throw new Error('Ingresa un documento valido.');
  }

  return documentNumber;
}

function normalizeIdentityDocument(value = '', type = 'dni') {
  if (type === 'pasaporte') {
    const passport = normalizeWhitespace(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (passport.length < 6 || passport.length > 20) {
      throw new Error('Ingresa un pasaporte valido.');
    }
    return passport;
  }

  return normalizeDocument(value);
}

function normalizeDocumentType(value = '') {
  const type = normalizeWhitespace(value).toLowerCase();
  return type === 'pasaporte' ? 'pasaporte' : 'dni';
}

function normalizeOneTimeCode(value = '') {
  const code = onlyDigits(value);
  return /^\d{6}$/.test(code) ? code : '';
}

function normalizePersonName(value = '', message = 'Ingresa un nombre valido.') {
  const text = toTitleCase(normalizeWhitespace(value));

  if (text.length < 2 || text.length > 80 || !/^[\p{L}][\p{L}' -]*$/u.test(text)) {
    throw new Error(message);
  }

  return text;
}

function normalizeAddress(value = '') {
  const address = normalizeTitleText(value, 'Ingresa tu domicilio legal.');

  if (address.length < 5 || address.length > 255) {
    throw new Error('Ingresa tu domicilio legal.');
  }

  return address;
}

function normalizeTitleText(value = '', message = 'Ingresa un valor valido.') {
  const text = toTitleCase(normalizeWhitespace(value));

  if (!text || text.length > 180) {
    throw new Error(message);
  }

  return text;
}

function normalizeAlias(value = '') {
  const alias = normalizeWhitespace(value).toLowerCase();

  if (!/^[a-z0-9.-]{6,30}$/.test(alias)) {
    return '';
  }

  return alias;
}

function normalizeExpiry(value = '') {
  const digits = onlyDigits(value);

  if (digits.length !== 4) {
    return '';
  }

  const month = Number(digits.slice(0, 2));
  if (month < 1 || month > 12) {
    return '';
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalizeDate(value = '', message = 'Ingresa una fecha valida.') {
  const text = normalizeWhitespace(value);
  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalizedText = slashMatch ? `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}` : text;
  const match = normalizedText.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(message);
  }

  const date = new Date(`${normalizedText}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(message);
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function assertNotFutureDate(value = '', message = 'La fecha no puede ser futura.') {
  const [day, month, year] = String(value).split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (date.getTime() > todayUtc.getTime()) {
    throw new Error(message);
  }
}

function sanitizeUri(value = '', message = 'Ingresa una ruta valida.') {
  const uri = normalizeWhitespace(value);
  const maxLength = uri.startsWith('data:image/') ? 12_000_000 : 2000;

  if (
    !uri ||
    uri.length > maxLength ||
    /^javascript:/i.test(uri) ||
    !/^(https?:\/\/|file:\/\/|data:image\/|blob:|content:\/\/)/i.test(uri)
  ) {
    throw new Error(message);
  }

  return uri;
}

function onlyDigits(value = '') {
  return normalizeWhitespace(value).replace(/\D/g, '');
}

function parsePositiveInt(value, message = 'Identificador invalido.') {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0 || number > Number.MAX_SAFE_INTEGER) {
    throw new Error(message);
  }

  return number;
}

function parseMoney(value, message = 'Ingresa un monto valido.') {
  const normalized = normalizeWhitespace(value)
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const number = Number(normalized);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(message);
  }

  return Math.round(number * 100) / 100;
}

function toTitleCase(value = '') {
  const lowerWords = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

  return normalizeWhitespace(value)
    .toLocaleLowerCase('es-AR')
    .split(' ')
    .map((word, index) => {
      if (index > 0 && lowerWords.has(word)) {
        return word;
      }

      return word
        .split('-')
        .map(capitalizeWord)
        .join('-');
    })
    .join(' ');
}

function capitalizeWord(word) {
  return word
    .split("'")
    .map((part) => (part ? part.charAt(0).toLocaleUpperCase('es-AR') + part.slice(1) : part))
    .join("'");
}

app.use(errorHandler);

const port = Number(process.env.PORT || process.env.API_PORT || 3001);

async function start() {
  if (process.env.DB_AUTO_INIT !== 'false') await initDatabase();
  setInterval(() => {
    settleExpiredAuctionTimers().catch((error) => {
      console.warn(`No se pudo cerrar subastas vencidas: ${error.message}`);
    });
  }, 1000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`EliteBid API escuchando en http://0.0.0.0:${port}/api`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
