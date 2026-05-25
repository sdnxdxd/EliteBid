import { getDatabase } from './database';

const SESSION_DAYS = 7;

export async function login(email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('Completa tu correo y clave para ingresar.');
  }

  const db = await getDatabase();
  const user = await db.getFirstAsync(
    `SELECT
      u.id,
      u.email,
      u.password,
      u.nombre,
      u.rol,
      u.estado,
      u.cliente_id AS clienteId,
      c.categoria,
      c.admitido
     FROM usuarios u
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE lower(u.email) = ?`,
    [normalizedEmail]
  );

  if (!user || user.password !== password) {
    throw new Error('Correo o clave incorrectos.');
  }

  if (user.estado !== 'activo' || user.admitido !== 'si') {
    throw new Error('Tu usuario aun no esta habilitado para ingresar.');
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.runAsync('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
  await db.runAsync(
    'INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)',
    [token, user.id, expiresAt]
  );

  return toSessionUser(user, token);
}

export async function registerUser(form) {
  validateRegistration(form);

  const db = await getDatabase();
  const normalizedEmail = form.email.trim().toLowerCase();
  const existing = await db.getFirstAsync('SELECT id FROM usuarios WHERE lower(email) = ?', [
    normalizedEmail
  ]);

  if (existing) {
    throw new Error('Ese correo ya esta registrado. Inicia sesion para continuar.');
  }

  const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();

  const personResult = await db.runAsync(
    `INSERT INTO personas (documento, nombre, direccion, estado, foto_uri)
     VALUES (?, ?, ?, ?, ?)`,
    [
      form.documentNumber.trim(),
      fullName,
      form.legalAddress.trim(),
      'activo',
      form.documentFrontUri.trim()
    ]
  );

  const personId = personResult.lastInsertRowId;

  await db.runAsync(
    `INSERT INTO documentos_identidad (persona_id, frente_uri, dorso_uri)
     VALUES (?, ?, ?)`,
    [personId, form.documentFrontUri.trim(), form.documentBackUri.trim()]
  );

  await db.runAsync(
    `INSERT INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [personId, Number(form.countryNumber), 'si', 'comun', 2]
  );

  await db.runAsync(
    `INSERT INTO usuarios (cliente_id, email, password, nombre, rol, estado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [personId, normalizedEmail, form.password, form.firstName.trim(), 'cliente', 'activo']
  );

  await db.runAsync(
    `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      personId,
      form.paymentType,
      form.paymentDetail.trim(),
      form.paymentCurrency,
      Number(form.paymentAmount || 0),
      'si'
    ]
  );

  return login(normalizedEmail, form.password);
}

export async function getActiveSession() {
  const db = await getDatabase();
  const session = await db.getFirstAsync(
    `SELECT
      s.token AS sessionToken,
      u.id,
      u.email,
      u.nombre,
      u.rol,
      u.estado,
      u.cliente_id AS clienteId,
      c.categoria,
      c.admitido
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     JOIN clientes c ON c.identificador = u.cliente_id
     WHERE s.expira_en > ?
     ORDER BY s.creado_en DESC
     LIMIT 1`,
    [new Date().toISOString()]
  );

  if (!session || session.estado !== 'activo' || session.admitido !== 'si') {
    return null;
  }

  return session;
}

export async function signOut(token) {
  if (!token) {
    return;
  }

  const db = await getDatabase();
  await db.runAsync('DELETE FROM sesiones WHERE token = ?', [token]);
}

function toSessionUser(user, token) {
  return {
    id: user.id,
    sessionToken: token,
    clienteId: user.clienteId,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
    categoria: user.categoria
  };
}

function createToken() {
  return `elite-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function validateRegistration(form) {
  const required = [
    ['firstName', 'Ingresa tu nombre.'],
    ['lastName', 'Ingresa tu apellido.'],
    ['documentNumber', 'Ingresa tu documento.'],
    ['documentFrontUri', 'Carga la foto del frente del documento.'],
    ['documentBackUri', 'Carga la foto del dorso del documento.'],
    ['legalAddress', 'Ingresa tu domicilio legal.'],
    ['countryNumber', 'Selecciona tu pais de origen.'],
    ['email', 'Ingresa tu correo.'],
    ['password', 'Crea una clave.'],
    ['confirmPassword', 'Confirma tu clave.'],
    ['paymentDetail', 'Ingresa el detalle del medio de pago.']
  ];

  for (const [key, message] of required) {
    if (!String(form[key] ?? '').trim()) {
      throw new Error(message);
    }
  }

  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    throw new Error('Ingresa un correo valido.');
  }

  if (form.password !== form.confirmPassword) {
    throw new Error('Las claves no coinciden.');
  }

  if (form.password.length < 8 || !/\d/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) {
    throw new Error('La clave debe tener 8 caracteres, un numero y un simbolo.');
  }

  if (Number(form.paymentAmount || 0) <= 0) {
    throw new Error('El monto de garantia debe ser mayor a cero.');
  }
}
