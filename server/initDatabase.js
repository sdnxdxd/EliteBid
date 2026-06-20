const fs = require('fs/promises');
const path = require('path');

const { connectWithoutDatabase, database, getPool, query, run } = require('./db');
const { hashPassword } = require('./passwordHash');

async function initDatabase() {
  if (process.env.DB_CREATE_DATABASE !== 'false') {
    const connection = await connectWithoutDatabase();

    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } finally {
      await connection.end();
    }
  }

  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await getPool().query(schema);
  await migrateSecuritySchema();
  await seedDatabase();
  await normalizeUnstartedLotItems();
}

async function normalizeUnstartedLotItems() {
  await run(
    `UPDATE items_catalogo i
     LEFT JOIN pujos p ON p.item = i.identificador
     SET i.puja_actual = 0
     WHERE p.identificador IS NULL
       AND i.cierre_estado = 'esperando_puja'
       AND i.timer_vencimiento IS NULL`
  );
}

async function migrateSecuritySchema() {
  await run("ALTER TABLE usuarios MODIFY rol ENUM('invitado', 'cliente', 'admin') DEFAULT 'cliente'");
  await run("ALTER TABLE usuarios MODIFY estado ENUM('pendiente', 'activo', 'bloqueado') DEFAULT 'activo'");
  await run('ALTER TABLE usuarios MODIFY password VARCHAR(255) NOT NULL');
  await addColumnIfMissing(
    'personas',
    'tipo_documento',
    "ALTER TABLE personas ADD COLUMN tipo_documento ENUM('dni', 'pasaporte') DEFAULT 'dni' AFTER identificador"
  );
  await run("ALTER TABLE personas MODIFY tipo_documento ENUM('dni', 'pasaporte') DEFAULT 'dni'");
  await run('ALTER TABLE personas MODIFY foto_uri MEDIUMTEXT');
  await run('ALTER TABLE documentos_identidad MODIFY frente_uri MEDIUMTEXT NOT NULL');
  await run('ALTER TABLE documentos_identidad MODIFY dorso_uri MEDIUMTEXT NOT NULL');
  await addColumnIfMissing(
    'solicitudes_lotes',
    'modo_lote',
    "ALTER TABLE solicitudes_lotes ADD COLUMN modo_lote ENUM('unico', 'variado') DEFAULT 'unico' AFTER titulo"
  );
  await addColumnIfMissing(
    'solicitudes_lotes',
    'composicion',
    'ALTER TABLE solicitudes_lotes ADD COLUMN composicion TEXT AFTER valor_estimado'
  );
  await addColumnIfMissing(
    'usuarios',
    'email_verificado',
    "ALTER TABLE usuarios ADD COLUMN email_verificado ENUM('si', 'no') DEFAULT 'no'"
  );
  await addColumnIfMissing(
    'usuarios',
    'verification_token',
    'ALTER TABLE usuarios ADD COLUMN verification_token VARCHAR(180)'
  );
  await addColumnIfMissing(
    'usuarios',
    'verification_code_hash',
    'ALTER TABLE usuarios ADD COLUMN verification_code_hash VARCHAR(255)'
  );
  await addColumnIfMissing(
    'usuarios',
    'verification_code_expires_at',
    'ALTER TABLE usuarios ADD COLUMN verification_code_expires_at DATETIME'
  );
  await addColumnIfMissing(
    'usuarios',
    'password_reset_code_hash',
    'ALTER TABLE usuarios ADD COLUMN password_reset_code_hash VARCHAR(255)'
  );
  await addColumnIfMissing(
    'usuarios',
    'password_reset_expires_at',
    'ALTER TABLE usuarios ADD COLUMN password_reset_expires_at DATETIME'
  );
  await addColumnIfMissing(
    'items_catalogo',
    'orden_lote',
    'ALTER TABLE items_catalogo ADD COLUMN orden_lote INT NOT NULL DEFAULT 0 AFTER catalogo'
  );
  const catalogItems = await query(
    'SELECT identificador AS id, catalogo AS catalogId, orden_lote AS lotOrder FROM items_catalogo ORDER BY catalogo ASC, identificador ASC'
  );
  let currentCatalogId = null;
  let lotOrder = 0;
  for (const item of catalogItems) {
    if (Number(item.catalogId) !== Number(currentCatalogId)) {
      currentCatalogId = item.catalogId;
      lotOrder = 0;
    }
    lotOrder += 1;
    if (!Number(item.lotOrder)) {
      await run('UPDATE items_catalogo SET orden_lote = ? WHERE identificador = ?', [lotOrder, item.id]);
    }
  }
  await addColumnIfMissing(
    'items_catalogo',
    'timer_inicio',
    'ALTER TABLE items_catalogo ADD COLUMN timer_inicio DATETIME AFTER puja_actual'
  );
  await addColumnIfMissing(
    'items_catalogo',
    'timer_vencimiento',
    'ALTER TABLE items_catalogo ADD COLUMN timer_vencimiento DATETIME AFTER timer_inicio'
  );
  await addColumnIfMissing(
    'items_catalogo',
    'cierre_estado',
    "ALTER TABLE items_catalogo ADD COLUMN cierre_estado ENUM('esperando_puja', 'en_cuenta', 'finalizada') DEFAULT 'esperando_puja' AFTER timer_vencimiento"
  );
  await run("ALTER TABLE items_catalogo MODIFY cierre_estado ENUM('esperando_puja', 'en_cuenta', 'finalizada') DEFAULT 'esperando_puja'");
  await addColumnIfMissing(
    'items_catalogo',
    'cierre_motivo',
    'ALTER TABLE items_catalogo ADD COLUMN cierre_motivo VARCHAR(80) AFTER cierre_estado'
  );
  await addColumnIfMissing(
    'pujos',
    'medio_pago',
    'ALTER TABLE pujos ADD COLUMN medio_pago INT AFTER item'
  );
  await addColumnIfMissing(
    'registro_de_subasta',
    'medio_pago',
    'ALTER TABLE registro_de_subasta ADD COLUMN medio_pago INT AFTER cliente'
  );
  await addColumnIfMissing(
    'registro_de_subasta',
    'estado_pago',
    "ALTER TABLE registro_de_subasta ADD COLUMN estado_pago ENUM('pendiente', 'pagada', 'multa') DEFAULT 'pendiente' AFTER comision"
  );
  await run("ALTER TABLE registro_de_subasta MODIFY estado_pago ENUM('pendiente', 'pagada', 'multa') DEFAULT 'pendiente'");
  await addColumnIfMissing(
    'registro_de_subasta',
    'direccion_entrega',
    'ALTER TABLE registro_de_subasta ADD COLUMN direccion_entrega VARCHAR(255) AFTER estado_pago'
  );
  await run("ALTER TABLE penalidades MODIFY estado ENUM('activa', 'pagada', 'vencida') DEFAULT 'activa'");
  await run('ALTER TABLE penalidades MODIFY vencimiento DATE');
  await run(
    `CREATE TABLE IF NOT EXISTS penalidad_falta_fondos (
      penalidad INT PRIMARY KEY,
      puja INT NOT NULL,
      registro INT,
      total_requerido DECIMAL(14,2) NOT NULL DEFAULT 0,
      vencimiento_fondos DATETIME NOT NULL,
      multa_pagada_en DATETIME,
      fondos_presentados ENUM('si', 'no') DEFAULT 'no',
      fondos_presentados_en DATETIME,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_penalidad_fondos_penalidad FOREIGN KEY (penalidad) REFERENCES penalidades (identificador)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  const legacyUsers = await query(
    "SELECT id, password FROM usuarios WHERE password NOT LIKE 'scrypt$%'"
  );

  for (const user of legacyUsers) {
    await run('UPDATE usuarios SET password = ? WHERE id = ?', [
      await hashPassword(user.password),
      user.id
    ]);
  }
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  const rows = await query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  if (Number(rows[0]?.total || 0) === 0) {
    await run(ddl);
  }
}

async function seedDatabase() {
  await run(
    `INSERT IGNORE INTO paises (numero, nombre, nombre_corto, capital, nacionalidad, idiomas)
     VALUES
     (32, 'Argentina', 'AR', 'Buenos Aires', 'Argentina', 'Espanol')`
  );
  await run('UPDATE clientes SET numero_pais = ? WHERE numero_pais IS NULL OR numero_pais <> ?', [32, 32]);
  await run('UPDATE duenios SET numero_pais = ? WHERE numero_pais IS NULL OR numero_pais <> ?', [32, 32]);
  await run('DELETE FROM paises WHERE numero <> ?', [32]);

  await run(
    `INSERT IGNORE INTO personas (identificador, documento, nombre, direccion, estado)
     VALUES
     (1, '30999111', 'Alejandro Vega', 'Av. Alvear 1800, CABA', 'activo'),
     (2, '22111999', 'Mara Santoro', 'Recoleta, CABA', 'activo'),
     (3, '18000999', 'Rafael Montero', 'Palermo, CABA', 'activo')`
  );
  await run('INSERT IGNORE INTO empleados (identificador, cargo, sector) VALUES (?, ?, ?)', [
    2,
    'Verificador senior',
    1
  ]);
  await run(
    `INSERT IGNORE INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [1, 32, 'si', 'platino', 2]
  );
  await run(
    `INSERT IGNORE INTO personas (identificador, documento, nombre, direccion, estado)
     VALUES (?, ?, ?, ?, ?)`,
    [4, '00000000', 'Empresa EliteBid', 'Av. Alvear 1800, CABA', 'activo']
  );
  await run(
    `INSERT IGNORE INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [4, 32, 'si', 'platino', 2]
  );
  await run('UPDATE registro_de_subasta SET cliente = ? WHERE cliente = ?', [4, 900001]);
  await run('DELETE FROM clientes WHERE identificador = ?', [900001]);
  await run('DELETE FROM personas WHERE identificador = ?', [900001]);
  await run("UPDATE clientes SET categoria = 'platino' WHERE identificador = ?", [1]);
  await run(
    `INSERT IGNORE INTO duenios (identificador, numero_pais, verificacion_financiera, verificacion_judicial, calificacion_riesgo, verificador)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [3, 32, 'si', 'si', 2, 2]
  );
  await run('INSERT IGNORE INTO subastadores (identificador, matricula, region) VALUES (?, ?, ?)', [
    2,
    'MAT-8821',
    'CABA'
  ]);
  await run(
    `INSERT IGNORE INTO usuarios (id, cliente_id, email, password, nombre, rol, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, 'alejandro@elitebid.com', await hashPassword('Elite1234'), 'Alejandro', 'cliente', 'activo']
  );
  await run("UPDATE usuarios SET email_verificado = 'si' WHERE email = ?", ['alejandro@elitebid.com']);
  await run(
    `UPDATE usuarios
     SET password = ?
     WHERE email = ? AND password = ?`,
    [await hashPassword('Elite1234'), 'alejandro@elitebid.com', 'Elite1234']
  );
  await run(
    `INSERT IGNORE INTO medios_pago (identificador, cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      1,
      'tarjeta',
      JSON.stringify({ brand: 'VISA', cardHolder: 'Alejandro Vega', cardNumberLast4: '2048', expiry: '12/29' }),
      'ARS',
      65000000,
      'si'
    ]
  );

  await seedAuction({
    id: 1,
    title: 'Patek Philippe Grand Complications',
    date: '2026-06-06',
    time: '21:30',
    status: 'abierta',
    category: 'platino',
    location: 'Salon Nocturne, Puerto Madero',
    image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80',
    product: 'Reloj mecanico suizo con calendario perpetuo y fase lunar.',
    basePrice: 380000,
    currentBid: 450000
  });
  await seedAuction({
    id: 2,
    title: 'Composicion Abstracta, 1968',
    date: '2026-06-06',
    time: '19:00',
    status: 'abierta',
    category: 'oro',
    location: 'Galeria Central',
    image: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=80',
    product: 'Obra expresionista con procedencia documentada y marco original.',
    basePrice: 9500000,
    currentBid: 12500000
  });
  await seedAuction({
    id: 3,
    title: 'Porsche 911 Carrera 1973',
    date: '2026-06-09',
    time: '20:30',
    status: 'programada',
    category: 'oro',
    location: 'Hangar Norte',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80',
    product: 'Coupe clasico restaurado, matching numbers y dossier tecnico.',
    basePrice: 80000000,
    currentBid: 0
  });
  await seedAuction({
    id: 4,
    title: 'Lote Numismatico Rio de la Plata',
    date: '2026-06-06',
    time: '18:30',
    status: 'abierta',
    category: 'comun',
    location: 'Sala Federal, CABA',
    image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=900&q=80',
    product: 'Conjunto de monedas argentinas y medallas con catalogacion basica.',
    basePrice: 120000,
    currentBid: 132000,
    extraItems: [
      {
        product: 'Moneda de 8 escudos de oro, Rio de la Plata, 1828.',
        image: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=900&q=80',
        basePrice: 185000
      },
      {
        product: 'Medalla conmemorativa de plata, Exposicion Nacional 1882.',
        image: 'https://images.unsplash.com/photo-1644424235476-295f24d503d9?auto=format&fit=crop&w=900&q=80',
        basePrice: 95000
      },
      {
        product: 'Billete argentino de coleccion, serie historica sin circular.',
        image: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=900&q=80',
        basePrice: 70000
      }
    ]
  });
  await seedAuction({
    id: 5,
    title: 'Camara Leica M3 con Optica Summicron',
    date: '2026-06-06',
    time: '20:00',
    status: 'abierta',
    category: 'especial',
    location: 'Galeria Central',
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80',
    product: 'Camara analogica Leica M3 revisada, con lente Summicron 50mm.',
    basePrice: 780000,
    currentBid: 842000
  });
  await seedAuction({
    id: 6,
    title: 'Juego de Te Ingles de 18 Piezas',
    date: '2026-06-06',
    time: '18:00',
    status: 'abierta',
    category: 'plata',
    location: 'Salon Nocturne, Puerto Madero',
    image: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=900&q=80',
    product: 'Juego de te en porcelana inglesa con servicio completo de 18 piezas.',
    basePrice: 1450000,
    currentBid: 1610000
  });
  await seedAuction({
    id: 7,
    title: 'Coleccion Inicial de Diseno Argentino',
    date: '2026-06-12',
    time: '19:30',
    status: 'programada',
    category: 'comun',
    location: 'Espacio Retiro',
    image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80',
    product: 'Piezas de diseno argentino contemporaneo para nuevos postores.',
    basePrice: 220000,
    currentBid: 0,
    extraItems: [
      {
        product: 'Silla BKF original restaurada con cuero natural.',
        image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?auto=format&fit=crop&w=900&q=80',
        basePrice: 180000
      },
      {
        product: 'Lampara de mesa industrial de autor argentino.',
        image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80',
        basePrice: 95000
      }
    ]
  });

  await run(
    `INSERT IGNORE INTO penalidades (identificador, cliente, titulo, descripcion, importe, estado, vencimiento)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      1,
      'Retraso en pago',
      'Incumplimiento de plazo para Rolex Daytona 1968. La cuenta tiene restricciones temporales de puja.',
      15000,
      'activa',
      '2026-06-02'
    ]
  );
}

async function seedAuction(auction) {
  await run(
    `INSERT IGNORE INTO subastas (identificador, titulo, fecha, hora, estado, subastador, ubicacion, capacidad_asistentes, tiene_deposito, seguridad_propia, categoria, moneda, imagen_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      auction.id,
      auction.title,
      auction.date,
      auction.time,
      auction.status,
      2,
      auction.location,
      120,
      'si',
      'si',
      auction.category,
      'ARS',
      auction.image
    ]
  );
  await run(
    `INSERT IGNORE INTO productos (identificador, fecha, disponible, descripcion_catalogo, descripcion_completa, revisor, duenio, seguro, imagen_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [auction.id, auction.date, 'si', auction.product, auction.product, 2, 3, null, auction.image]
  );
  await run(
    `INSERT IGNORE INTO catalogos (identificador, descripcion, subasta, responsable)
     VALUES (?, ?, ?, ?)`,
    [auction.id, `Catalogo ${auction.title}`, auction.id, 2]
  );
  await run(
    `INSERT IGNORE INTO items_catalogo (identificador, catalogo, orden_lote, producto, precio_base, comision, subastado, puja_actual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [auction.id, auction.id, 1, auction.id, auction.basePrice, auction.basePrice * 0.12, 'no', 0]
  );

  const additionalLotItems = auction.extraItems?.length
    ? auction.extraItems
    : [
        {
          product: `${auction.title}: pieza complementaria I.`,
          image: auction.image,
          basePrice: Math.max(1, Math.round(auction.basePrice * 0.6))
        },
        {
          product: `${auction.title}: pieza complementaria II.`,
          image: auction.image,
          basePrice: Math.max(1, Math.round(auction.basePrice * 0.35))
        }
      ];

  for (const [index, item] of additionalLotItems.entries()) {
    const productId = auction.id * 100 + index + 1;
    const itemId = auction.id * 100 + index + 1;
    await run(
      `INSERT IGNORE INTO productos (identificador, fecha, disponible, descripcion_catalogo, descripcion_completa, revisor, duenio, seguro, imagen_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, auction.date, 'si', item.product, item.product, 2, 3, null, item.image || auction.image]
    );
    await run(
      `INSERT IGNORE INTO items_catalogo (identificador, catalogo, orden_lote, producto, precio_base, comision, subastado, puja_actual)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemId, auction.id, index + 2, productId, item.basePrice, item.basePrice * 0.12, 'no', item.currentBid || 0]
    );
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log(`Base MySQL '${database}' inicializada.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { initDatabase };
