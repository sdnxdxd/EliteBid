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

async function cleanup(db, touched = {}) {
  if (touched.itemId && touched.previousBid != null) {
    await db.query('UPDATE items_catalogo SET puja_actual = ? WHERE identificador = ?', [
      touched.previousBid,
      touched.itemId
    ]);
  }

  const [rows] = await db.query(
    "SELECT id, cliente_id AS clienteId FROM usuarios WHERE email LIKE 'qa.robust.%@example.com'"
  );

  for (const row of rows) {
    await db.query(
      'DELETE p FROM pujos p JOIN asistentes a ON a.identificador = p.asistente WHERE a.cliente = ?',
      [row.clienteId]
    );
    await db.query('DELETE FROM favoritos WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM solicitudes_lotes WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM asistentes WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM medios_pago WHERE cliente = ?', [row.clienteId]);
    await db.query('DELETE FROM sesiones WHERE usuario_id = ?', [row.id]);
    await db.query('DELETE FROM usuarios WHERE id = ?', [row.id]);
    await db.query('DELETE FROM documentos_identidad WHERE persona_id = ?', [row.clienteId]);
    await db.query('DELETE FROM clientes WHERE identificador = ?', [row.clienteId]);
    await db.query('DELETE FROM personas WHERE identificador = ?', [row.clienteId]);
  }
}

async function main() {
  await initDatabase();
  server = app.listen(PORT, '127.0.0.1');
  const db = await createDb();
  const touched = {};

  try {
    await request('/health');
    logOk('api health');

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
    const userB = await verifyGuest(db, await registerGuest(db, 3));
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

    await request(`/users/${userA.clienteId}/payments`, {
      method: 'POST',
      token: userA.sessionToken,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: 100000,
        cardHolder: 'qa robustez',
        cardNumber: '4111111111111111',
        expiry: '12/30',
        cvv: '123'
      })
    });
    logOk('pago valido agregado');

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
    touched.previousBid = activeCommon.currentBid;
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
