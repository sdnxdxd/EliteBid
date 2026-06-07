const mysql = require('mysql2/promise');
const app = require('../server');
const { getPool } = require('../server/db');
const { initDatabase } = require('../server/initDatabase');
const { hashPassword } = require('../server/passwordHash');

require('dotenv').config();

process.env.SMTP_HOST = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASSWORD = '';
process.env.RESEND_API_KEY = '';
process.env.MAIL_RESPONSE_TIMEOUT_MS = '1000';

const PORT = Number(process.env.SEED_API_PORT || 3998);
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = 'Demo!2203';
const OTP_VALID = '123456';
const OTP_EXPIRED = '111111';
const DEMO_DOMAIN = 'elitebid.test';

let server;

const scenarios = [
  {
    key: 'guestPending',
    email: `demo.elitebid.invitado.pendiente@${DEMO_DOMAIN}`,
    name: 'Invitado Pendiente',
    description: 'Cuenta invitada con codigo vigente. Usar OTP 123456.'
  },
  {
    key: 'guestExpired',
    email: `demo.elitebid.invitado.vencido@${DEMO_DOMAIN}`,
    name: 'Invitado Vencido',
    description: 'Cuenta invitada con codigo vencido. Debe pedir reenvio.'
  },
  {
    key: 'clientNoPayment',
    email: `demo.elitebid.cliente.sinpago@${DEMO_DOMAIN}`,
    name: 'Cliente Sin Pago',
    description: 'Cliente verificado, sin medios de pago.'
  },
  {
    key: 'clientWithPayment',
    email: `demo.elitebid.cliente.conpago@${DEMO_DOMAIN}`,
    name: 'Cliente Con Pago',
    description: 'Cliente verificado con tarjeta habilitada para entrar a salas comun.'
  },
  {
    key: 'clientPenalty',
    email: `demo.elitebid.cliente.penalidad@${DEMO_DOMAIN}`,
    name: 'Cliente Penalidad',
    description: 'Cliente con pago y penalidad activa.'
  },
  {
    key: 'clientSilver',
    email: `demo.elitebid.cliente.plata@${DEMO_DOMAIN}`,
    name: 'Cliente Plata',
    description: 'Cliente con metricas para categoria plata.'
  },
  {
    key: 'clientPurchase',
    email: `demo.elitebid.cliente.compra@${DEMO_DOMAIN}`,
    name: 'Cliente Compra',
    description: 'Cliente con puja ganadora pendiente de registrar compra.'
  },
  {
    key: 'clientLot',
    email: `demo.elitebid.cliente.lote@${DEMO_DOMAIN}`,
    name: 'Cliente Lote',
    description: 'Cliente con solicitud de lote en inspeccion.'
  }
];

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
    throw new Error(`${path}: ${body?.message || body?.error || response.status}`);
  }

  return body;
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

async function cleanup(db) {
  const [users] = await db.query(
    "SELECT id, cliente_id AS clienteId FROM usuarios WHERE email LIKE 'demo.elitebid.%@elitebid.test'"
  );

  for (const user of users) {
    await db.query(
      'DELETE fl FROM fotos_lote fl JOIN solicitudes_lotes sl ON sl.identificador = fl.solicitud WHERE sl.cliente = ?',
      [user.clienteId]
    );
    await db.query('DELETE FROM solicitudes_lotes WHERE cliente = ?', [user.clienteId]);
    await db.query('DELETE FROM registro_de_subasta WHERE cliente = ?', [user.clienteId]);
    await db.query(
      'DELETE p FROM pujos p JOIN asistentes a ON a.identificador = p.asistente WHERE a.cliente = ?',
      [user.clienteId]
    );
    await db.query('DELETE FROM asistentes WHERE cliente = ?', [user.clienteId]);
    await db.query('DELETE FROM favoritos WHERE cliente = ?', [user.clienteId]);
    await db.query('DELETE FROM penalidades WHERE cliente = ?', [user.clienteId]);
    await db.query('DELETE FROM medios_pago WHERE cliente = ?', [user.clienteId]);
    await db.query('DELETE FROM sesiones WHERE usuario_id = ?', [user.id]);
    await db.query('DELETE FROM usuarios WHERE id = ?', [user.id]);
    await db.query('DELETE FROM documentos_identidad WHERE persona_id = ?', [user.clienteId]);
    await db.query('DELETE FROM clientes WHERE identificador = ?', [user.clienteId]);
    await db.query('DELETE FROM personas WHERE identificador = ?', [user.clienteId]);
  }

  await resetAutoIncrement(db, 'usuarios', 'id');
  await resetAutoIncrement(db, 'personas', 'identificador');
  await resetAutoIncrement(db, 'documentos_identidad', 'identificador');
}

async function resetAutoIncrement(db, table, primaryKey) {
  const [rows] = await db.query(`SELECT COALESCE(MAX(${primaryKey}), 0) + 1 AS nextId FROM ${table}`);
  const nextId = Math.max(1, Number(rows[0]?.nextId || 1));
  await db.query(`ALTER TABLE ${table} AUTO_INCREMENT = ${nextId}`);
}

async function setKnownOtp(db, email, code, minutes) {
  await db.query(
    'UPDATE usuarios SET verification_code_hash = ?, verification_code_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE email = ?',
    [await hashPassword(code), minutes, email]
  );
}

async function registerGuest(db, scenario, index) {
  const [firstName, lastName] = scenario.name.split(' ');
  const user = await request('/auth/register-guest', {
    method: 'POST',
    body: JSON.stringify({
      email: scenario.email,
      firstName,
      lastName,
      documentType: index % 2 === 0 ? 'dni' : 'pasaporte',
      documentNumber: index % 2 === 0 ? `70000${String(index).padStart(3, '0')}` : `ARDEMO${index}`,
      documentFrontUri: 'file:///demo/document-front.jpg',
      ...(index % 2 === 0 ? { documentBackUri: 'file:///demo/document-back.jpg' } : {})
    })
  });

  await setKnownOtp(db, scenario.email, OTP_VALID, 15);
  return { ...scenario, ...user };
}

async function verifyUser(db, scenario, index) {
  const guest = await registerGuest(db, scenario, index);
  await setKnownOtp(db, scenario.email, OTP_VALID, 15);
  const user = await request('/auth/complete-verification', {
    method: 'POST',
    token: guest.sessionToken,
    body: JSON.stringify({
      email: scenario.email,
      code: OTP_VALID,
      password: PASSWORD,
      confirmPassword: PASSWORD
    })
  });
  return { ...scenario, ...user };
}

async function addPayment(db, clienteId, type = 'tarjeta') {
  if (type === 'cheque') {
    await db.query(
      `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
       VALUES (?, 'cheque', ?, 'ARS', 150000, 'no')`,
      [
        clienteId,
        JSON.stringify({
          bank: 'Banco Demo',
          checkImageUri: 'file:///demo/cheque.jpg',
          checkNumber: '889900',
          issueDate: '2026-06-05'
        })
      ]
    );
    return;
  }

  await request(`/users/${clienteId}/payments`, {
    method: 'POST',
    token: await getSessionTokenForClient(db, clienteId),
    body: JSON.stringify({
      type: 'tarjeta',
      amount: 100000,
      cardHolder: 'Demo Elitebid',
      cardNumber: '4111111111111111',
      expiry: '12/30',
      cvv: '123'
    })
  });
}

async function getSessionTokenForClient(db, clienteId) {
  const [rows] = await db.query(
    `SELECT s.token
     FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE u.cliente_id = ?
     ORDER BY s.creado_en DESC
     LIMIT 1`,
    [clienteId]
  );
  return rows[0]?.token;
}

async function addPenalty(db, clienteId) {
  await db.query(
    `INSERT INTO penalidades (cliente, titulo, descripcion, importe, estado, vencimiento)
     VALUES (?, ?, ?, ?, 'activa', DATE_ADD(CURDATE(), INTERVAL 7 DAY))`,
    [
      clienteId,
      'Penalidad demo',
      'Caso de prueba para notificaciones y restricciones por penalidad.',
      45000
    ]
  );
}

async function addDemoBids(db, clienteId, { total = 2, wins = 0, amount = 250000 } = {}) {
  const [auctions] = await db.query(
    `SELECT s.identificador AS auctionId, i.identificador AS itemId
     FROM subastas s
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     ORDER BY s.identificador ASC, i.identificador ASC
     LIMIT ?`,
    [Math.max(total, 1)]
  );

  for (let index = 0; index < total; index += 1) {
    const auction = auctions[index % auctions.length];
    const [assistantRows] = await db.query(
      'SELECT identificador AS id FROM asistentes WHERE cliente = ? AND subasta = ? LIMIT 1',
      [clienteId, auction.auctionId]
    );
    let assistantId = assistantRows[0]?.id;
    if (!assistantId) {
      const [result] = await db.query(
        'INSERT INTO asistentes (numero_postor, cliente, subasta) VALUES (?, ?, ?)',
        [800 + index + clienteId, clienteId, auction.auctionId]
      );
      assistantId = result.insertId;
    }

    await db.query(
      'INSERT INTO pujos (asistente, item, importe, ganador) VALUES (?, ?, ?, ?)',
      [assistantId, auction.itemId, amount + index * 10000, index < wins ? 'si' : 'no']
    );
  }
}

async function addLot(db, clienteId) {
  const [result] = await db.query(
    `INSERT INTO solicitudes_lotes (
      cliente, titulo, modo_lote, tipo_bien, cantidad, valor_estimado, composicion, descripcion,
      estado_conservacion, historia, origen_licito, cuenta_cobro,
      declaracion_titularidad, acepta_devolucion_cargo, estado
    ) VALUES (?, ?, 'unico', ?, 1, 850000, '', ?, ?, ?, ?, ?, 'si', 'si', 'en_inspeccion')`,
    [
      clienteId,
      'Reloj de bolsillo demo',
      'Antiguedad',
      'Reloj de bolsillo con cadena, usado para testear seguimiento de venta.',
      'Muy Bueno',
      'Pieza heredada con documentacion familiar.',
      'Factura y declaracion jurada disponibles.',
      JSON.stringify({ bank: 'Banco Demo', holder: 'Demo Elitebid', reference: 'demo.cobro' })
    ]
  );

  for (let index = 1; index <= 6; index += 1) {
    await db.query('INSERT INTO fotos_lote (solicitud, uri, orden) VALUES (?, ?, ?)', [
      result.insertId,
      `file:///demo/lote-${index}.jpg`,
      index
    ]);
  }
}

async function writeSummary(users) {
  const fs = require('fs/promises');
  const lines = [
    '# Datos de prueba EliteBid',
    '',
    'Generados con `npm run qa:seed`.',
    '',
    '| Caso | Email | Clave / codigo | Estado esperado |',
    '| --- | --- | --- | --- |'
  ];

  for (const user of users) {
    const credential = user.rol === 'invitado'
      ? (user.email.includes('vencido') ? `OTP vencido ${OTP_EXPIRED}; usar reenvio` : `OTP ${OTP_VALID}`)
      : PASSWORD;
    lines.push(`| ${user.description} | \`${user.email}\` | \`${credential}\` | ${user.rol} / ${user.estado} / ${user.categoria || 'comun'} |`);
  }

  lines.push(
    '',
    'Notas:',
    '',
    '- Los mails usan dominio `.test`; no salen a cuentas reales.',
    '- El seed es idempotente: borra y vuelve a crear solo usuarios `demo.elitebid.*@elitebid.test`.',
    '- Para probar desde Login: usar los emails de la tabla y la clave/codigo correspondiente.',
    '- El cliente con penalidad debe mostrar notificacion y panel de penalidades.',
    '- El cliente con lote debe mostrar una venta en inspeccion en `Mis ventas`.'
  );

  await fs.writeFile('docs/qa/DATOS_PRUEBA.md', `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  await initDatabase();
  server = app.listen(PORT, '127.0.0.1');
  const db = await createDb();
  const users = [];

  try {
    await cleanup(db);

    const pending = await registerGuest(db, scenarios[0], 1);
    await setKnownOtp(db, pending.email, OTP_VALID, 15);
    users.push(pending);

    const expired = await registerGuest(db, scenarios[1], 2);
    await setKnownOtp(db, expired.email, OTP_EXPIRED, -1);
    users.push(expired);

    const noPayment = await verifyUser(db, scenarios[2], 3);
    users.push(noPayment);

    const withPayment = await verifyUser(db, scenarios[3], 4);
    await addPayment(db, withPayment.clienteId);
    users.push({ ...withPayment, payment: 'tarjeta' });

    const penalty = await verifyUser(db, scenarios[4], 5);
    await addPayment(db, penalty.clienteId);
    await addPenalty(db, penalty.clienteId);
    users.push({ ...penalty, payment: 'tarjeta', penalty: true });

    const silver = await verifyUser(db, scenarios[5], 6);
    await addPayment(db, silver.clienteId);
    await addDemoBids(db, silver.clienteId, { total: 5, wins: 1, amount: 350000 });
    await request(`/users/${silver.clienteId}/summary`, { token: silver.sessionToken });
    users.push({ ...silver, categoria: 'plata', payment: 'tarjeta' });

    const purchase = await verifyUser(db, scenarios[6], 7);
    await addPayment(db, purchase.clienteId);
    await addDemoBids(db, purchase.clienteId, { total: 1, wins: 1, amount: 420000 });
    users.push({ ...purchase, payment: 'tarjeta', purchase: true });

    const lot = await verifyUser(db, scenarios[7], 8);
    await addPayment(db, lot.clienteId);
    await addLot(db, lot.clienteId);
    users.push({ ...lot, payment: 'tarjeta', lot: true });

    await writeSummary(users);
    console.log('Datos demo creados:');
    for (const user of users) {
      console.log(`- ${user.email} (${user.description})`);
    }
    console.log('Resumen: docs/qa/DATOS_PRUEBA.md');
  } finally {
    await db.end();
    await getPool().end();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

main().catch(async (error) => {
  console.error(`No se pudieron crear datos demo: ${error.message}`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  process.exit(1);
});
