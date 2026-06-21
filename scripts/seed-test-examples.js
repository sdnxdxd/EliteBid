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
    description: 'Cliente con pago y penalidad general activa.'
  },
  {
    key: 'clientPenaltyExpired',
    email: `demo.elitebid.cliente.penalidad.vencida@${DEMO_DOMAIN}`,
    name: 'Penalidad Vencida',
    description: 'Cliente con penalidad vencida y cuenta restringida.'
  },
  {
    key: 'clientPenaltyFunds',
    email: `demo.elitebid.cliente.penalidad.fondos@${DEMO_DOMAIN}`,
    name: 'Penalidad Fondos',
    description: 'Cliente con penalidad por falta de fondos: multa y fondos pendientes.'
  },
  {
    key: 'clientPenaltyFinePaid',
    email: `demo.elitebid.cliente.penalidad.multa@${DEMO_DOMAIN}`,
    name: 'Penalidad Multa',
    description: 'Cliente con multa abonada pero fondos pendientes.'
  },
  {
    key: 'clientPenaltyPaid',
    email: `demo.elitebid.cliente.penalidad.pagada@${DEMO_DOMAIN}`,
    name: 'Penalidad Pagada',
    description: 'Cliente con penalidad por falta de fondos ya resuelta.'
  },
  {
    key: 'clientSilver',
    email: `demo.elitebid.cliente.plata@${DEMO_DOMAIN}`,
    name: 'Cliente Plata',
    description: 'Cliente con metricas para categoria plata.'
  },
  {
    key: 'clientSpecial',
    email: `demo.elitebid.cliente.especial@${DEMO_DOMAIN}`,
    name: 'Cliente Especial',
    description: 'Cliente categoria especial con cuenta bancaria verificada.'
  },
  {
    key: 'clientGold',
    email: `demo.elitebid.cliente.oro@${DEMO_DOMAIN}`,
    name: 'Cliente Oro',
    description: 'Cliente categoria oro con cheque certificado verificado.'
  },
  {
    key: 'clientPlatinum',
    email: `demo.elitebid.cliente.platino@${DEMO_DOMAIN}`,
    name: 'Cliente Platino',
    description: 'Cliente categoria platino con medio de pago internacional USD.'
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
    description: 'Cliente con solicitudes de lotes pendientes y productos con imagenes distintas.'
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
      `DELETE fps FROM fotos_producto_solicitud_lote fps
       JOIN productos_solicitud_lote psl ON psl.identificador = fps.producto_solicitud
       JOIN solicitudes_lotes sl ON sl.identificador = psl.solicitud
       WHERE sl.cliente = ?`,
      [user.clienteId]
    );
    await db.query(
      `DELETE psl FROM productos_solicitud_lote psl
       JOIN solicitudes_lotes sl ON sl.identificador = psl.solicitud
       WHERE sl.cliente = ?`,
      [user.clienteId]
    );
    await db.query(
      'DELETE fl FROM fotos_lote fl JOIN solicitudes_lotes sl ON sl.identificador = fl.solicitud WHERE sl.cliente = ?',
      [user.clienteId]
    );
    await db.query('DELETE FROM solicitudes_lotes WHERE cliente = ?', [user.clienteId]);
    await db.query('DELETE FROM registro_de_subasta WHERE cliente = ?', [user.clienteId]);
    await db.query(
      'DELETE pf FROM penalidad_falta_fondos pf JOIN penalidades p ON p.identificador = pf.penalidad WHERE p.cliente = ?',
      [user.clienteId]
    );
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
  const token = await getSessionTokenForClient(db, clienteId);

  if (type === 'cuenta') {
    await request(`/users/${clienteId}/payments`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        type: 'cuenta',
        amount: 2500000,
        currency: 'ARS',
        bank: 'Banco Galicia',
        accountType: 'Cuenta Corriente',
        cbu: '2850590940090418135201',
        alias: `demo.${clienteId}.elitebid`
      })
    });
    return;
  }

  if (type === 'cheque') {
    await request(`/users/${clienteId}/payments`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        type: 'cheque',
        amount: 3500000,
        currency: 'ARS',
        bank: 'Banco Nacion',
        checkNumber: `88${String(clienteId).padStart(6, '0')}`,
        issueDate: '2026-06-05',
        checkImageUri: 'file:///demo/cheque-certificado.jpg'
      })
    });
    return;
  }

  if (type === 'tarjeta_usd') {
    await request(`/users/${clienteId}/payments`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        type: 'tarjeta',
        amount: 250000,
        currency: 'USD',
        cardHolder: 'Demo Internacional',
        cardNumber: '5555555555554444',
        expiry: '12/30',
        cvv: '123'
      })
    });
    return;
  }

  await request(`/users/${clienteId}/payments`, {
    method: 'POST',
    token,
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

async function setClientCategory(db, clienteId, category) {
  await db.query('UPDATE clientes SET categoria = ? WHERE identificador = ?', [category, clienteId]);
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

async function addPenalty(db, clienteId, variant = 'general_activa') {
  const variants = {
    general_activa: {
      title: 'Penalidad demo activa',
      description: 'Penalidad general activa: bloquea participacion hasta resolverla.',
      amount: 45000,
      status: 'activa',
      due: 'DATE_ADD(CURDATE(), INTERVAL 7 DAY)'
    },
    general_vencida: {
      title: 'Penalidad demo vencida',
      description: 'Penalidad vencida: simula una cuenta con incumplimiento fuera de plazo.',
      amount: 65000,
      status: 'vencida',
      due: 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)'
    },
    falta_fondos: {
      title: 'Multa por falta de fondos demo',
      description: 'Falta pagar la multa y presentar fondos suficientes para liberar la cuenta.',
      amount: 90000,
      status: 'activa',
      due: 'DATE_ADD(CURDATE(), INTERVAL 3 DAY)',
      funds: { finePaid: null, fundsPresented: 'no' }
    },
    multa_pagada: {
      title: 'Multa abonada, fondos pendientes demo',
      description: 'La multa esta abonada, pero todavia falta presentar fondos.',
      amount: 90000,
      status: 'activa',
      due: 'DATE_ADD(CURDATE(), INTERVAL 3 DAY)',
      funds: { finePaid: 'UTC_TIMESTAMP()', fundsPresented: 'no' }
    },
    pagada: {
      title: 'Penalidad resuelta demo',
      description: 'Penalidad por falta de fondos resuelta: multa abonada y fondos presentados.',
      amount: 90000,
      status: 'pagada',
      due: 'DATE_ADD(CURDATE(), INTERVAL 3 DAY)',
      funds: { finePaid: 'UTC_TIMESTAMP()', fundsPresented: 'si' }
    }
  };
  const data = variants[variant] || variants.general_activa;
  const [result] = await db.query(
    `INSERT INTO penalidades (cliente, titulo, descripcion, importe, estado, vencimiento)
     VALUES (?, ?, ?, ?, ?, ${data.due})`,
    [
      clienteId,
      data.title,
      data.description,
      data.amount,
      data.status
    ]
  );

  if (data.funds) {
    await db.query(
      `INSERT INTO penalidad_falta_fondos (
        penalidad, puja, registro, total_requerido, vencimiento_fondos, multa_pagada_en, fondos_presentados, fondos_presentados_en
      ) VALUES (?, ?, NULL, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 72 HOUR), ${data.funds.finePaid || 'NULL'}, ?, ${data.funds.fundsPresented === 'si' ? 'UTC_TIMESTAMP()' : 'NULL'})`,
      [result.insertId, 900000 + clienteId, 900000, data.funds.fundsPresented]
    );
  }
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

async function addLot(db, clienteId, options = {}) {
  const title = options.title || 'Reloj de bolsillo demo';
  const items = options.items || [
    {
      title: 'Reloj de bolsillo demo',
      itemType: 'Antiguedad',
      quantity: 1,
      estimatedValue: 850000,
      description: 'Reloj de bolsillo con cadena, usado para testear seguimiento de venta.',
      condition: 'Muy Bueno',
      history: 'Pieza heredada con documentacion familiar.',
      photoPrefix: 'reloj'
    }
  ];
  const [result] = await db.query(
    `INSERT INTO solicitudes_lotes (
      cliente, titulo, modo_lote, tipo_bien, cantidad, valor_estimado, composicion, descripcion,
      estado_conservacion, historia, origen_licito, cuenta_cobro,
      declaracion_titularidad, acepta_devolucion_cargo, estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'si', 'si', 'pendiente')`,
    [
      clienteId,
      title,
      items.length > 1 ? 'variado' : 'unico',
      items[0].itemType,
      items.reduce((total, item) => total + Number(item.quantity || 1), 0),
      items.reduce((total, item) => total + Number(item.estimatedValue || 0), 0),
      items.map((item) => item.title).join(', '),
      items[0].description,
      items[0].condition,
      items[0].history,
      'Factura y declaracion jurada disponibles.',
      JSON.stringify({ bank: 'Banco Demo', holder: 'Demo Elitebid', reference: 'demo.cobro' })
    ]
  );

  let flatOrder = 1;
  for (const [itemIndex, item] of items.entries()) {
    const [itemResult] = await db.query(
      `INSERT INTO productos_solicitud_lote (
        solicitud, orden_lote, titulo, tipo_bien, cantidad, valor_estimado, descripcion, estado_conservacion, historia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        itemIndex + 1,
        item.title,
        item.itemType,
        item.quantity || 1,
        item.estimatedValue || 0,
        item.description,
        item.condition,
        item.history
      ]
    );

    for (let index = 1; index <= 6; index += 1) {
      const uri = `https://images.unsplash.com/${item.photoId || 'photo-1523170335258-f5ed11844a49'}?auto=format&fit=crop&w=900&q=80&demo=${item.photoPrefix || itemIndex}-${index}`;
      await db.query('INSERT INTO fotos_lote (solicitud, uri, orden) VALUES (?, ?, ?)', [
        result.insertId,
        uri,
        flatOrder
      ]);
      await db.query('INSERT INTO fotos_producto_solicitud_lote (producto_solicitud, uri, orden) VALUES (?, ?, ?)', [
        itemResult.insertId,
        uri,
        index
      ]);
      flatOrder += 1;
    }
  }
}

async function seedDemoAuctions(db) {
  const auctions = [
    {
      id: 90001,
      title: 'QA Comun USD - Arte Grafico Accesible',
      date: '2026-09-10',
      time: '18:00',
      status: 'programada',
      category: 'comun',
      currency: 'USD',
      location: 'Sala QA Retiro',
      image: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=900&q=80',
      products: [
        { title: 'Serigrafia firmada QA', basePrice: 300, image: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=900&q=80' },
        { title: 'Grabado numerado QA', basePrice: 180, image: 'https://images.unsplash.com/photo-1579783901586-d88db74b4fe4?auto=format&fit=crop&w=900&q=80' }
      ]
    },
    {
      id: 90002,
      title: 'QA Especial ARS - Audio Vintage',
      date: '2026-09-12',
      time: '19:00',
      status: 'programada',
      category: 'especial',
      currency: 'ARS',
      location: 'Sala QA Palermo',
      image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80',
      products: [
        { title: 'Amplificador valvular QA', basePrice: 600000, image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80' },
        { title: 'Bandeja giradiscos QA', basePrice: 350000, image: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=900&q=80' }
      ]
    },
    {
      id: 90003,
      title: 'QA Plata ARS - Diseno Argentino',
      date: '2026-09-14',
      time: '20:00',
      status: 'programada',
      category: 'plata',
      currency: 'ARS',
      location: 'Sala QA Norte',
      image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80',
      products: [
        { title: 'Silla de autor QA', basePrice: 900000, image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80' },
        { title: 'Lampara industrial QA', basePrice: 420000, image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80' }
      ]
    },
    {
      id: 90004,
      title: 'QA Oro USD - Joyeria Certificada',
      date: '2026-09-16',
      time: '20:30',
      status: 'programada',
      category: 'oro',
      currency: 'USD',
      location: 'Salon QA Alvear',
      image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80',
      products: [
        { title: 'Anillo art deco QA', basePrice: 12000, image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80' },
        { title: 'Collar perlas QA', basePrice: 8500, image: 'https://images.unsplash.com/photo-1611085583191-a3b181a88401?auto=format&fit=crop&w=900&q=80' }
      ]
    },
    {
      id: 90005,
      title: 'QA Platino USD - Automovilismo',
      date: '2026-09-18',
      time: '21:00',
      status: 'programada',
      category: 'platino',
      currency: 'USD',
      location: 'Hangar QA San Fernando',
      image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80',
      products: [
        { title: 'Coupe clasico QA', basePrice: 90000, image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80' },
        { title: 'Cronografo competicion QA', basePrice: 9500, image: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=900&q=80' }
      ]
    }
  ];

  for (const auction of auctions) {
    await db.query(
      `INSERT INTO subastas (
        identificador, titulo, fecha, hora, estado, subastador, ubicacion, capacidad_asistentes,
        tiene_deposito, seguridad_propia, categoria, moneda, imagen_uri
      ) VALUES (?, ?, ?, ?, ?, 2, ?, 120, 'si', 'si', ?, ?, ?)
      ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), fecha = VALUES(fecha), hora = VALUES(hora),
        estado = VALUES(estado), ubicacion = VALUES(ubicacion), categoria = VALUES(categoria),
        moneda = VALUES(moneda), imagen_uri = VALUES(imagen_uri)`,
      [
        auction.id,
        auction.title,
        auction.date,
        auction.time,
        auction.status,
        auction.location,
        auction.category,
        auction.currency,
        auction.image
      ]
    );
    await db.query(
      `INSERT INTO catalogos (identificador, descripcion, subasta, responsable)
       VALUES (?, ?, ?, 2)
       ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), subasta = VALUES(subasta)`,
      [auction.id, `Catalogo ${auction.title}`, auction.id]
    );

    for (const [index, product] of auction.products.entries()) {
      const productId = auction.id * 10 + index + 1;
      const itemId = auction.id * 10 + index + 1;
      await db.query(
        `INSERT INTO productos (
          identificador, fecha, disponible, descripcion_catalogo, descripcion_completa, revisor, duenio, seguro, imagen_uri
        ) VALUES (?, ?, 'si', ?, ?, 2, 3, NULL, ?)
        ON DUPLICATE KEY UPDATE fecha = VALUES(fecha), disponible = VALUES(disponible),
          descripcion_catalogo = VALUES(descripcion_catalogo), descripcion_completa = VALUES(descripcion_completa),
          imagen_uri = VALUES(imagen_uri)`,
        [productId, auction.date, product.title, `${product.title}. Fixture QA con procedencia y fotos completas.`, product.image]
      );
      await db.query(
        `INSERT INTO items_catalogo (
          identificador, catalogo, orden_lote, producto, precio_base, comision, subastado, puja_actual,
          timer_inicio, timer_vencimiento, cierre_estado, cierre_motivo
        ) VALUES (?, ?, ?, ?, ?, ?, 'no', 0, NULL, NULL, 'esperando_puja', NULL)
        ON DUPLICATE KEY UPDATE catalogo = VALUES(catalogo), orden_lote = VALUES(orden_lote),
          producto = VALUES(producto), precio_base = VALUES(precio_base), comision = VALUES(comision),
          subastado = 'no', puja_actual = 0, timer_inicio = NULL, timer_vencimiento = NULL,
          cierre_estado = 'esperando_puja', cierre_motivo = NULL`,
        [itemId, auction.id, index + 1, productId, product.basePrice, Number(product.basePrice) * 0.12]
      );
      for (let order = 1; order <= 6; order += 1) {
        const uri = `${product.image}${product.image.includes('?') ? '&' : '?'}qa_photo=${order}`;
        await db.query(
          `INSERT INTO fotos (producto, uri, orden)
           SELECT ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM fotos WHERE producto = ? AND orden = ?)`,
          [productId, uri, order, productId, order]
        );
        await db.query('UPDATE fotos SET uri = ? WHERE producto = ? AND orden = ?', [uri, productId, order]);
      }
    }
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
    '- Hay usuarios demo para penalidad general activa, vencida, falta de fondos pendiente, multa abonada con fondos pendientes y penalidad pagada.',
    '- El cliente con penalidad activa/vencida debe mostrar notificacion y panel de penalidades.',
    '- El cliente con lote debe mostrar ventas en estado pendiente en `Mis ventas`.'
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

    const byKey = Object.fromEntries(scenarios.map((scenario) => [scenario.key, scenario]));

    const pending = await registerGuest(db, byKey.guestPending, 1);
    await setKnownOtp(db, pending.email, OTP_VALID, 15);
    users.push(pending);

    const expired = await registerGuest(db, byKey.guestExpired, 2);
    await setKnownOtp(db, expired.email, OTP_EXPIRED, -1);
    users.push(expired);

    const noPayment = await verifyUser(db, byKey.clientNoPayment, 3);
    users.push(noPayment);

    const withPayment = await verifyUser(db, byKey.clientWithPayment, 4);
    await addPayment(db, withPayment.clienteId);
    users.push({ ...withPayment, payment: 'tarjeta' });

    const penalty = await verifyUser(db, byKey.clientPenalty, 5);
    await addPayment(db, penalty.clienteId);
    await addPenalty(db, penalty.clienteId, 'general_activa');
    users.push({ ...penalty, payment: 'tarjeta', penalty: true });

    const penaltyExpired = await verifyUser(db, byKey.clientPenaltyExpired, 6);
    await addPayment(db, penaltyExpired.clienteId);
    await addPenalty(db, penaltyExpired.clienteId, 'general_vencida');
    users.push({ ...penaltyExpired, payment: 'tarjeta', penalty: 'vencida' });

    const penaltyFunds = await verifyUser(db, byKey.clientPenaltyFunds, 7);
    await addPayment(db, penaltyFunds.clienteId);
    await addPenalty(db, penaltyFunds.clienteId, 'falta_fondos');
    users.push({ ...penaltyFunds, payment: 'tarjeta', penalty: 'falta_fondos' });

    const penaltyFinePaid = await verifyUser(db, byKey.clientPenaltyFinePaid, 8);
    await addPayment(db, penaltyFinePaid.clienteId);
    await addPenalty(db, penaltyFinePaid.clienteId, 'multa_pagada');
    users.push({ ...penaltyFinePaid, payment: 'tarjeta', penalty: 'multa_pagada' });

    const penaltyPaid = await verifyUser(db, byKey.clientPenaltyPaid, 9);
    await addPayment(db, penaltyPaid.clienteId);
    await addPenalty(db, penaltyPaid.clienteId, 'pagada');
    users.push({ ...penaltyPaid, payment: 'tarjeta', penalty: 'pagada' });

    const silver = await verifyUser(db, byKey.clientSilver, 10);
    await addPayment(db, silver.clienteId);
    await addDemoBids(db, silver.clienteId, { total: 5, wins: 1, amount: 350000 });
    await request(`/users/${silver.clienteId}/summary`, { token: silver.sessionToken });
    await setClientCategory(db, silver.clienteId, 'plata');
    users.push({ ...silver, categoria: 'plata', payment: 'tarjeta' });

    const special = await verifyUser(db, byKey.clientSpecial, 11);
    await addPayment(db, special.clienteId, 'cuenta');
    await setClientCategory(db, special.clienteId, 'especial');
    users.push({ ...special, categoria: 'especial', payment: 'cuenta' });

    const gold = await verifyUser(db, byKey.clientGold, 12);
    await addPayment(db, gold.clienteId, 'cheque');
    await setClientCategory(db, gold.clienteId, 'oro');
    users.push({ ...gold, categoria: 'oro', payment: 'cheque' });

    const platinum = await verifyUser(db, byKey.clientPlatinum, 13);
    await addPayment(db, platinum.clienteId, 'tarjeta_usd');
    await setClientCategory(db, platinum.clienteId, 'platino');
    users.push({ ...platinum, categoria: 'platino', payment: 'tarjeta_usd' });

    const purchase = await verifyUser(db, byKey.clientPurchase, 14);
    await addPayment(db, purchase.clienteId);
    await addDemoBids(db, purchase.clienteId, { total: 1, wins: 1, amount: 420000 });
    users.push({ ...purchase, payment: 'tarjeta', purchase: true });

    const lot = await verifyUser(db, byKey.clientLot, 15);
    await addPayment(db, lot.clienteId);
    await addLot(db, lot.clienteId);
    await addLot(db, lot.clienteId, {
      title: 'Coleccion demo de audio vintage',
      items: [
        {
          title: 'Amplificador valvular demo',
          itemType: 'Audio',
          quantity: 1,
          estimatedValue: 620000,
          description: 'Amplificador valvular con gabinete restaurado y prueba de funcionamiento.',
          condition: 'Muy buen estado, con mantenimiento reciente.',
          history: 'Equipo comprado en tienda especializada durante los anos 70.',
          photoId: 'photo-1545454675-3531b543be5d',
          photoPrefix: 'amplificador'
        },
        {
          title: 'Bandeja giradiscos demo',
          itemType: 'Audio',
          quantity: 1,
          estimatedValue: 380000,
          description: 'Bandeja de traccion directa con capsula original.',
          condition: 'Funcionamiento probado, tapa con marcas leves.',
          history: 'Pieza familiar conservada en uso domestico.',
          photoId: 'photo-1461360370896-922624d12aa1',
          photoPrefix: 'bandeja'
        }
      ]
    });
    users.push({ ...lot, payment: 'tarjeta', lot: true });

    await seedDemoAuctions(db);

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
