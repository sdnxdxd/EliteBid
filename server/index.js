const cors = require('cors');
const crypto = require('crypto');
const express = require('express');

const { first, query, run } = require('./db');
const { sendVerificationEmail } = require('./emailService');
const { initDatabase } = require('./initDatabase');
const { hashPassword, verifyPassword } = require('./passwordHash');

require('dotenv').config();

const app = express();
const SESSION_DAYS = 7;
const categoryRank = { comun: 1, especial: 2, plata: 3, oro: 4, platino: 5 };

app.use(cors());
app.use(express.json({ limit: '30mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await first('SELECT 1 AS ok');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) throw new Error('Completa tu correo y clave para ingresar.');

  const user = await first(
    `SELECT u.id, u.email, u.password, u.nombre, u.rol, u.estado, u.cliente_id AS clienteId,
      u.verification_code_hash AS verificationCodeHash, u.verification_code_expires_at AS verificationCodeExpiresAt,
      u.verification_code_expires_at <= UTC_TIMESTAMP() AS verificationCodeExpired,
      c.categoria, c.admitido,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = u.cliente_id) AS paymentCount
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE lower(u.email) = ?`,
    [normalizedEmail]
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

  const emailResult = await sendVerificationForUser({
    email: form.email,
    name: form.firstName,
    token: verificationCode
  });

  res.json({
    ...toSessionUser(user, token),
    verificationPending: true,
    verificationEmailSent: emailResult.sent
  });
}));

app.post('/api/auth/register/paso1', wrap(async (req, res) => {
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
  const emailResult = await sendVerificationForUser({
    email: form.email,
    name: form.firstName,
    token: verificationCode
  });

  res.status(201).json({
    email: form.email,
    estado: 'pendiente',
    registrationId: String(user.id),
    verificationEmailSent: emailResult.sent
  });
}));

app.post('/api/auth/register/paso2', wrap(async (req, res) => {
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
  const email = normalizeEmail(req.body.email);
  if (!email) throw new Error('Ingresa un correo valido.');

  const user = await first(
    `SELECT id, email, nombre
     FROM usuarios
     WHERE lower(email) = ? AND rol = 'invitado' AND email_verificado = 'no' AND estado = 'pendiente'
     LIMIT 1`,
    [email]
  );

  if (!user) {
    return res.json({ ok: true, verificationEmailSent: false });
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

app.get('/api/auth/session', wrap(async (req, res) => {
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

app.post('/api/auth/reset-password', wrap(async (req, res) => {
  const { identifier = '', password, confirmPassword } = req.body;
  const cleanIdentifier = normalizeWhitespace(identifier);
  const emailIdentifier = normalizeEmail(cleanIdentifier);
  const documentIdentifier = onlyDigits(cleanIdentifier);

  if (!emailIdentifier && !documentIdentifier) throw new Error('Ingresa tu correo o numero de documento.');
  validatePassword(password, confirmPassword);

  const user = await first(
    `SELECT u.id
     FROM usuarios u
     JOIN personas p ON p.identificador = u.cliente_id
     WHERE (lower(u.email) = ? OR p.documento = ?)
       AND u.rol = 'cliente'
       AND u.estado = 'activo'
       AND u.email_verificado = 'si'
     LIMIT 1`,
    [emailIdentifier, documentIdentifier]
  );
  if (!user) throw new Error('No encontramos un usuario con esos datos.');
  await run('UPDATE usuarios SET password = ? WHERE id = ?', [await hashPassword(password), user.id]);
  await run('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
  res.json({ ok: true });
}));

app.get('/api/usuarios/me', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const profile = await getUserProfile(viewer.clienteId);
  res.json(toLegacyUser(profile, viewer));
}));

app.get('/api/usuarios/me/medios-de-pago', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserPayments(viewer.clienteId));
}));

app.post('/api/usuarios/me/medios-de-pago', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para agregar medios de pago.');
  const payment = sanitizePayment(fromLegacyPaymentInput(req.body));
  const verified = payment.type === 'cheque' ? 'no' : 'si';
  await run(
    `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [viewer.clienteId, payment.type, JSON.stringify(buildPaymentDetail(payment)), 'ARS', payment.amount, verified]
  );
  res.status(201).json(await getUserPayments(viewer.clienteId));
}));

app.get('/api/usuarios/me/compras', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserPurchases(viewer.clienteId));
}));

app.get('/api/usuarios/me/penalidades', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserPenalties(viewer.clienteId));
}));

app.get('/api/usuarios/me/metricas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  res.json(await getUserSummary(viewer.clienteId));
}));

app.get('/api/notificaciones', wrap(async (req, res) => {
  await requireAuthenticatedClient(req);
  res.json([]);
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

app.post('/api/solicitudes-venta', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  await assertNotGuest(viewer.clienteId, 'Verifica tu cuenta para cargar lotes a subasta.');
  const lot = sanitizeLotSubmission(fromSaleRequestInput(req.body));
  const result = await createLotSubmission(viewer.clienteId, lot);
  const rows = await getUserLots(viewer.clienteId);
  const created = rows.find((row) => row.id === result.insertId);
  res.status(201).json(toSaleRequestContract(created));
}));

app.get('/api/subastas', wrap(async (req, res) => {
  const viewer = await getOptionalAuthenticatedClient(req);
  res.json(await getAuctionRows(viewer));
}));

app.get('/api/subastas/:auctionId/catalogo', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const detail = await getAuctionDetail(parsePositiveInt(req.params.auctionId, 'Subasta invalida.'), viewer.clienteId);
  res.json({ catalogo: [toCatalogLot(detail)] });
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

app.post('/api/subastas/:auctionId/pujas', wrap(async (req, res) => {
  const viewer = await requireAuthenticatedClient(req);
  const amount = parseMoney(req.body.monto ?? req.body.amount, 'Ingresa un monto valido para pujar.');
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');

  const bidResult = await placeAuctionBid(viewer.clienteId, auctionId, amount);
  res.status(201).json({
    bid: { id: bidResult.bid.id, amount: bidResult.bid.amount, monto: bidResult.bid.amount },
    bounds: bidResult.bounds,
    lote: toCatalogLot(bidResult.auction)
  });
}));

app.get('/api/auctions/home', wrap(async (_req, res) => {
  const viewer = await getViewer(_req.query.clienteId);
  const rows = await getAuctionRows(viewer);
  res.json({
    live: rows.filter((auction) => auction.status === 'abierta'),
    upcoming: rows.filter((auction) => auction.status === 'programada')
  });
}));

app.get('/api/auctions', wrap(async (_req, res) => {
  res.json(await getAuctionRows(await getViewer(_req.query.clienteId)));
}));

app.get('/api/auctions/:auctionId', wrap(async (req, res) => {
  res.json(await getAuctionDetail(parsePositiveInt(req.params.auctionId, 'Subasta invalida.'), parsePositiveInt(req.query.clienteId, 'Cliente invalido.')));
}));

app.post('/api/auctions/:auctionId/enter', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.body.clienteId, 'Cliente invalido.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para ingresar a una sala.');
  res.json(await enterAuctionRoom(clienteId, parsePositiveInt(req.params.auctionId, 'Subasta invalida.')));
}));

app.post('/api/auctions/:auctionId/bids', wrap(async (req, res) => {
  const amount = parseMoney(req.body.amount, 'Ingresa un monto valido para pujar.');
  const clienteId = parsePositiveInt(req.body.clienteId, 'Cliente invalido.');
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');

  const bidResult = await placeAuctionBid(clienteId, auctionId, amount);
  res.json({ auction: bidResult.auction, bid: bidResult.bid });
}));

app.get('/api/users/:clienteId/summary', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
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
  res.json({ verifiedPayments: payments?.verifiedPayments ?? 0, totalBids: bids?.totalBids ?? 0 });
}));

app.get('/api/users/:clienteId/favorites/ids', wrap(async (req, res) => {
  if (await isGuest(parsePositiveInt(req.params.clienteId, 'Cliente invalido.'))) {
    return res.json([]);
  }
  const rows = await query('SELECT subasta AS auctionId FROM favoritos WHERE cliente = ? ORDER BY creado_en DESC', [
    parsePositiveInt(req.params.clienteId, 'Cliente invalido.')
  ]);
  res.json(rows.map((row) => row.auctionId));
}));

app.get('/api/users/:clienteId/favorites', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  if (await isGuest(clienteId)) return res.json([]);
  res.json(await getFavoriteAuctions(clienteId));
}));

app.post('/api/users/:clienteId/favorites/:auctionId/toggle', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  const auctionId = parsePositiveInt(req.params.auctionId, 'Subasta invalida.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para guardar favoritos.');
  const existing = await first('SELECT 1 AS found FROM favoritos WHERE cliente = ? AND subasta = ?', [
    clienteId,
    auctionId
  ]);

  if (existing) {
    await run('DELETE FROM favoritos WHERE cliente = ? AND subasta = ?', [clienteId, auctionId]);
  } else {
    await run('INSERT INTO favoritos (cliente, subasta) VALUES (?, ?)', [clienteId, auctionId]);
  }

  const rows = await query('SELECT subasta AS auctionId FROM favoritos WHERE cliente = ? ORDER BY creado_en DESC', [
    clienteId
  ]);
  res.json(rows.map((row) => row.auctionId));
}));

app.get('/api/users/:clienteId/purchases', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  if (await isGuest(clienteId)) return res.json([]);
  res.json(await getUserPurchases(clienteId));
}));

app.get('/api/users/:clienteId/lots', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  if (await isGuest(clienteId)) return res.json([]);
  res.json(await getUserLots(clienteId));
}));

app.post('/api/users/:clienteId/lots', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para cargar lotes a subasta.');
  const lot = sanitizeLotSubmission(req.body);
  await createLotSubmission(clienteId, lot);
  res.status(201).json(await getUserLots(clienteId));
}));

app.post('/api/users/:clienteId/purchases/:bidId/settle', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  const bidId = parsePositiveInt(req.params.bidId, 'Puja invalida.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para registrar compras.');
  const purchase = await first(
    `SELECT p.identificador AS id, p.importe AS amount, s.identificador AS auctionId,
      prod.identificador AS productId, prod.duenio AS ownerId, i.identificador AS itemId,
      i.comision AS commission, r.identificador AS receiptId
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
  if (!purchase.receiptId) {
    await run(
      `INSERT INTO registro_de_subasta (subasta, duenio, producto, cliente, importe, comision)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [purchase.auctionId, purchase.ownerId, purchase.productId, clienteId, purchase.amount, purchase.commission]
    );
    await run('UPDATE items_catalogo SET subastado = ? WHERE identificador = ?', ['si', purchase.itemId]);
  }

  res.json(await getUserPurchases(clienteId));
}));

app.get('/api/users/:clienteId/payments', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  if (await isGuest(clienteId)) return res.json([]);
  const rows = await query(
    `SELECT identificador AS id, tipo AS type, detalle AS detail, moneda AS currency,
      monto_garantia AS amount, verificado AS verified
     FROM medios_pago
     WHERE cliente = ?
     ORDER BY identificador DESC`,
    [clienteId]
  );
  res.json(rows.map((row) => ({ ...row, parsedDetail: parseDetail(row.detail) })));
}));

app.post('/api/users/:clienteId/payments', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para agregar medios de pago.');
  const payment = sanitizePayment(req.body);
  const verified = payment.type === 'cheque' ? 'no' : 'si';
  await run(
    `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [clienteId, payment.type, JSON.stringify(buildPaymentDetail(payment)), 'ARS', payment.amount, verified]
  );
  const summary = await first('SELECT COUNT(*) AS paymentCount FROM medios_pago WHERE cliente = ?', [clienteId]);
  res.json(summary?.paymentCount ?? 0);
}));

app.delete('/api/users/:clienteId/payments/:paymentId', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para eliminar medios de pago.');
  await run('DELETE FROM medios_pago WHERE identificador = ? AND cliente = ?', [
    parsePositiveInt(req.params.paymentId, 'Medio de pago invalido.'),
    clienteId
  ]);
  const summary = await first('SELECT COUNT(*) AS paymentCount FROM medios_pago WHERE cliente = ?', [clienteId]);
  res.json(summary?.paymentCount ?? 0);
}));

app.get('/api/users/:clienteId/profile', wrap(async (req, res) => {
  const profile = await getUserProfile(parsePositiveInt(req.params.clienteId, 'Cliente invalido.'));
  res.json(profile);
}));

app.put('/api/users/:clienteId/profile', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para modificar tus datos.');
  const profile = sanitizeProfile(req.body);
  await assertImmutableIdentity(clienteId, profile);

  const duplicate = await first('SELECT id FROM usuarios WHERE lower(email) = ? AND id <> ?', [
    profile.email,
    profile.userId
  ]);
  if (duplicate) throw new Error('Ese correo ya esta usado por otro usuario.');

  await run('UPDATE personas SET direccion = ? WHERE identificador = ?', [profile.legalAddress, clienteId]);
  await run('UPDATE usuarios SET email = ? WHERE id = ?', [profile.email, profile.userId]);
  res.json({ email: profile.email });
}));

app.put('/api/users/:clienteId/profile/photo', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para modificar tu foto.');
  const photoUri = sanitizeUri(req.body.photoUri, 'Selecciona una foto para actualizar tu perfil.');
  await run('UPDATE personas SET foto_uri = ? WHERE identificador = ?', [
    photoUri,
    clienteId
  ]);
  res.json({ ok: true });
}));

app.get('/api/users/:clienteId/penalties', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  if (await isGuest(clienteId)) return res.json([]);
  res.json(await getUserPenalties(clienteId));
}));

app.post('/api/users/:clienteId/penalties/:penaltyId/settle', wrap(async (req, res) => {
  const clienteId = parsePositiveInt(req.params.clienteId, 'Cliente invalido.');
  const penaltyId = parsePositiveInt(req.params.penaltyId, 'Penalidad invalida.');
  await assertNotGuest(clienteId, 'Verifica tu cuenta para resolver penalidades.');
  const penalty = await first(
    'SELECT identificador AS id, estado AS status FROM penalidades WHERE identificador = ? AND cliente = ? LIMIT 1',
    [penaltyId, clienteId]
  );
  if (!penalty) throw new Error('No encontramos esa penalidad.');
  if (penalty.status !== 'activa' && penalty.status !== 'vencida') {
    throw new Error('Esa penalidad ya esta solucionada.');
  }
  await run('UPDATE penalidades SET estado = ? WHERE identificador = ? AND cliente = ?', [
    'pagada',
    penaltyId,
    clienteId
  ]);
  res.json(await getUserPenalties(clienteId));
}));

async function getAuctionRows(viewer = null) {
  const guest = viewer?.rol === 'invitado';
  const rows = await query(
    `SELECT s.identificador AS id, s.titulo AS title, DATE_FORMAT(s.fecha, '%Y-%m-%d') AS date,
      s.hora AS time, s.estado AS status, s.categoria AS category, s.moneda AS currency,
      s.ubicacion AS location, COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description, i.precio_base AS basePrice, i.puja_actual AS currentBid
     FROM subastas s
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     ${guest ? "WHERE s.estado = 'programada'" : ''}
     ORDER BY CASE s.estado WHEN 'abierta' THEN 0 WHEN 'programada' THEN 1 ELSE 2 END, s.fecha ASC`
  );

  return guest ? rows.map(redactAuctionPrice) : rows;
}

async function getAuctionDetail(auctionId, clienteId) {
  const viewer = await getViewer(clienteId);
  const auction = await first(
    `SELECT s.identificador AS id, s.titulo AS title, DATE_FORMAT(s.fecha, '%Y-%m-%d') AS date,
      s.hora AS time, s.estado AS status, s.categoria AS category, s.moneda AS currency,
      s.ubicacion AS location, s.capacidad_asistentes AS capacity,
      COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl, p.descripcion_catalogo AS description,
      p.descripcion_completa AS fullDescription, p.identificador AS productId,
      i.identificador AS itemId, i.precio_base AS basePrice, i.comision AS commission,
      i.puja_actual AS currentBid, per.nombre AS auctioneer
     FROM subastas s
     JOIN subastadores sub ON sub.identificador = s.subastador
     JOIN personas per ON per.identificador = sub.identificador
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     WHERE s.identificador = ?
     LIMIT 1`,
    [auctionId]
  );
  if (!auction) throw new Error('No encontramos esa subasta.');
  if (viewer?.rol === 'invitado' && auction.status !== 'programada') {
    throw new Error('Como invitado solo podes ver subastas futuras.');
  }

  const payment = await first(
    `SELECT COUNT(*) AS verifiedPayments FROM medios_pago WHERE cliente = ? AND verificado = 'si'`,
    [clienteId]
  );

  const detail = {
    ...auction,
    bidFeed: viewer?.rol === 'invitado' ? [] : await getAuctionBidFeed(auction.itemId),
    isFavorite: viewer?.rol === 'invitado' ? false : await isFavoriteAuction(clienteId, auctionId),
    eligibility: {
      categoryOk: viewer?.rol !== 'invitado' && await hasCategoryAccess(clienteId, auction.category),
      verifiedPayments: viewer?.rol === 'invitado' ? 0 : payment?.verifiedPayments ?? 0
    }
  };

  return viewer?.rol === 'invitado' ? redactAuctionPrice(detail) : detail;
}

async function enterAuctionRoom(clienteId, auctionId) {
  const detail = await getAuctionDetail(auctionId, clienteId);
  if (detail.status !== 'abierta') throw new Error('La sala todavia no esta abierta.');
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
      p.ganador AS winner, a.numero_postor AS bidderNumber
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     WHERE p.item = ?
     ORDER BY p.identificador DESC`,
    [itemId]
  );
  return rows.map((row) => ({ ...row, bidderAlias: `@postor${String(row.bidderNumber).padStart(3, '0')}` }));
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

async function placeAuctionBid(clienteId, auctionId, amount) {
  await assertNotGuest(clienteId, 'Verifica tu cuenta para pujar.');
  if (amount <= 0) throw new Error('Ingresa un monto valido para pujar.');

  const detail = await enterAuctionRoom(clienteId, auctionId);
  const userCategory = await getClientCategory(clienteId);
  const currentBid = Number(detail.currentBid || detail.basePrice || 0);
  const basePrice = Number(detail.basePrice || 0);
  const minBid = currentBid + basePrice * 0.01;
  const maxBid = currentBid + basePrice * 0.2;
  const bypassRange = ['oro', 'platino'].includes(userCategory);

  if (amount <= currentBid) throw new Error(`El monto debe superar la puja actual de ${formatMoney(currentBid)}.`);
  if (!bypassRange && amount < minBid) throw new Error(`El monto debe ser al menos ${formatMoney(minBid)}.`);
  if (!bypassRange && amount > maxBid) throw new Error(`El monto no puede superar ${formatMoney(maxBid)}.`);

  const assistantId = await ensureAssistant(clienteId, auctionId);
  await run('UPDATE pujos SET ganador = ? WHERE item = ?', ['no', detail.itemId]);
  const result = await run('INSERT INTO pujos (asistente, item, importe, ganador) VALUES (?, ?, ?, ?)', [
    assistantId,
    detail.itemId,
    amount,
    'si'
  ]);
  await run('UPDATE items_catalogo SET puja_actual = ? WHERE identificador = ?', [amount, detail.itemId]);

  return {
    auction: await getAuctionDetail(auctionId, clienteId),
    bid: { id: result.insertId, amount },
    bounds: { min: minBid, max: bypassRange ? null : maxBid }
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
    `SELECT u.rol, u.email_verificado AS emailVerified, c.categoria
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE u.cliente_id = ?
     LIMIT 1`,
    [Number(clienteId)]
  );
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
  const pendingGuest = session.rol === 'invitado' && session.estado === 'pendiente';
  if ((session.estado !== 'activo' && !pendingGuest) || session.admitido !== 'si') return null;
  return session;
}

async function requireAuthenticatedClient(req) {
  const viewer = await getOptionalAuthenticatedClient(req);
  if (!viewer) {
    throw new Error('Inicia sesion para continuar.');
  }
  return viewer;
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

async function getUserSummary(clienteId) {
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
    `SELECT COUNT(*) AS totalWins
     FROM pujos p JOIN asistentes a ON a.identificador = p.asistente
     WHERE a.cliente = ? AND p.ganador = 'si'`,
    [clienteId]
  );
  return {
    totalBids: bids?.totalBids ?? 0,
    totalWins: wins?.totalWins ?? 0,
    verifiedPayments: payments?.verifiedPayments ?? 0
  };
}

async function getUserPurchases(clienteId) {
  return query(
    `SELECT p.identificador AS id, p.importe AS amount, p.creado_en AS createdAt,
      p.ganador AS winner, s.identificador AS auctionId, s.titulo AS title,
      s.moneda AS currency, prod.identificador AS productId, prod.duenio AS ownerId,
      i.identificador AS itemId, i.comision AS commission, r.identificador AS receiptId,
      CASE WHEN r.identificador IS NULL THEN 'pendiente' ELSE 'pagada' END AS paymentStatus,
      COALESCE(prod.imagen_uri, s.imagen_uri) AS imageUrl
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     JOIN productos prod ON prod.identificador = i.producto
     LEFT JOIN registro_de_subasta r ON r.cliente = a.cliente AND r.subasta = s.identificador AND r.producto = prod.identificador
     WHERE a.cliente = ? AND p.ganador = 'si'
     ORDER BY CASE WHEN r.identificador IS NULL THEN 0 ELSE 1 END, p.identificador DESC`,
    [clienteId]
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
    nombre: detail.title,
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
  const profile = await first(
    `SELECT p.identificador AS clienteId, p.documento, p.nombre AS fullName, p.direccion AS legalAddress,
      p.foto_uri AS photoUri, u.id AS userId, u.email, u.nombre AS firstName, c.categoria,
      c.numero_pais AS countryNumber, pa.nombre AS countryName,
      (SELECT COUNT(*) FROM medios_pago mp WHERE mp.cliente = p.identificador) AS paymentCount,
      (SELECT COUNT(*) FROM asistentes a WHERE a.cliente = p.identificador) AS auctionsAttended,
      (SELECT COUNT(*) FROM pujos pu JOIN asistentes a ON a.identificador = pu.asistente WHERE a.cliente = p.identificador AND pu.ganador = 'si') AS auctionsWon,
      (SELECT COALESCE(SUM(pu.importe), 0) FROM pujos pu JOIN asistentes a ON a.identificador = pu.asistente WHERE a.cliente = p.identificador AND pu.ganador = 'si') AS invested,
      (SELECT COUNT(*) FROM penalidades pe WHERE pe.cliente = p.identificador AND pe.estado = 'activa') AS activePenaltyCount,
      (SELECT COALESCE(SUM(pe.importe), 0) FROM penalidades pe WHERE pe.cliente = p.identificador AND pe.estado = 'activa') AS activePenaltyAmount
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
  return query(
    `SELECT identificador AS id, titulo AS title, descripcion AS description, importe AS amount,
      estado AS status, DATE_FORMAT(vencimiento, '%Y-%m-%d') AS dueDate, creado_en AS createdAt
     FROM penalidades
     WHERE cliente = ?
     ORDER BY CASE estado WHEN 'activa' THEN 0 WHEN 'vencida' THEN 1 ELSE 2 END, vencimiento ASC`,
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

async function sendVerificationForUser({ email, name, token }) {
  try {
    return await sendVerificationEmail({ to: email, name, token });
  } catch (error) {
    console.warn(`No se pudo enviar verificacion a ${email}: ${error.message}`);
    return { sent: false, skipped: false, reason: 'send_failed' };
  }
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
  const type = normalizeWhitespace(payload.type).toLowerCase();
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

    if (sanitized.cardNumber.length < 13 || sanitized.cardNumber.length > 19) {
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
  const type = normalizeWhitespace(payload.tipo ?? payload.type).toLowerCase();
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

  return normalizedText;
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

const port = Number(process.env.API_PORT || 3001);

async function start() {
  if (process.env.DB_AUTO_INIT !== 'false') await initDatabase();
  app.listen(port, () => {
    console.log(`EliteBid API escuchando en http://127.0.0.1:${port}/api`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
