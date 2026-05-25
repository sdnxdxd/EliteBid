import * as SQLite from 'expo-sqlite';

let databasePromise;

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paises (
  numero INTEGER PRIMARY KEY NOT NULL,
  nombre TEXT NOT NULL,
  nombre_corto TEXT,
  capital TEXT NOT NULL,
  nacionalidad TEXT NOT NULL,
  idiomas TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  documento TEXT NOT NULL,
  nombre TEXT NOT NULL,
  direccion TEXT,
  estado TEXT CHECK (estado IN ('activo', 'inactivo')) DEFAULT 'activo',
  foto_uri TEXT
);

CREATE TABLE IF NOT EXISTS empleados (
  identificador INTEGER PRIMARY KEY NOT NULL,
  cargo TEXT,
  sector INTEGER
);

CREATE TABLE IF NOT EXISTS clientes (
  identificador INTEGER PRIMARY KEY NOT NULL,
  numero_pais INTEGER,
  admitido TEXT CHECK (admitido IN ('si', 'no')) DEFAULT 'si',
  categoria TEXT CHECK (categoria IN ('comun', 'especial', 'plata', 'oro', 'platino')),
  verificador INTEGER NOT NULL,
  FOREIGN KEY (identificador) REFERENCES personas (identificador),
  FOREIGN KEY (verificador) REFERENCES empleados (identificador),
  FOREIGN KEY (numero_pais) REFERENCES paises (numero)
);

CREATE TABLE IF NOT EXISTS subastadores (
  identificador INTEGER PRIMARY KEY NOT NULL,
  matricula TEXT,
  region TEXT,
  FOREIGN KEY (identificador) REFERENCES personas (identificador)
);

CREATE TABLE IF NOT EXISTS duenios (
  identificador INTEGER PRIMARY KEY NOT NULL,
  numero_pais INTEGER,
  verificacion_financiera TEXT CHECK (verificacion_financiera IN ('si', 'no')),
  verificacion_judicial TEXT CHECK (verificacion_judicial IN ('si', 'no')),
  calificacion_riesgo INTEGER CHECK (calificacion_riesgo IN (1, 2, 3, 4, 5, 6)),
  verificador INTEGER NOT NULL,
  FOREIGN KEY (identificador) REFERENCES personas (identificador),
  FOREIGN KEY (verificador) REFERENCES empleados (identificador)
);

CREATE TABLE IF NOT EXISTS seguros (
  nro_poliza TEXT PRIMARY KEY NOT NULL,
  compania TEXT NOT NULL,
  poliza_combinada TEXT CHECK (poliza_combinada IN ('si', 'no')),
  importe REAL NOT NULL CHECK (importe > 0)
);

CREATE TABLE IF NOT EXISTS subastas (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  estado TEXT CHECK (estado IN ('abierta', 'cerrada', 'programada')),
  subastador INTEGER,
  ubicacion TEXT,
  capacidad_asistentes INTEGER,
  tiene_deposito TEXT CHECK (tiene_deposito IN ('si', 'no')),
  seguridad_propia TEXT CHECK (seguridad_propia IN ('si', 'no')),
  categoria TEXT CHECK (categoria IN ('comun', 'especial', 'plata', 'oro', 'platino')),
  moneda TEXT CHECK (moneda IN ('ARS', 'USD')) DEFAULT 'ARS',
  imagen_uri TEXT,
  FOREIGN KEY (subastador) REFERENCES subastadores (identificador)
);

CREATE TABLE IF NOT EXISTS productos (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT,
  disponible TEXT CHECK (disponible IN ('si', 'no')),
  descripcion_catalogo TEXT DEFAULT 'No Posee',
  descripcion_completa TEXT NOT NULL,
  revisor INTEGER NOT NULL,
  duenio INTEGER NOT NULL,
  seguro TEXT,
  imagen_uri TEXT,
  FOREIGN KEY (revisor) REFERENCES empleados (identificador),
  FOREIGN KEY (duenio) REFERENCES duenios (identificador),
  FOREIGN KEY (seguro) REFERENCES seguros (nro_poliza)
);

CREATE TABLE IF NOT EXISTS catalogos (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  descripcion TEXT NOT NULL,
  subasta INTEGER,
  responsable INTEGER NOT NULL,
  FOREIGN KEY (responsable) REFERENCES empleados (identificador),
  FOREIGN KEY (subasta) REFERENCES subastas (identificador)
);

CREATE TABLE IF NOT EXISTS items_catalogo (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  catalogo INTEGER NOT NULL,
  producto INTEGER NOT NULL,
  precio_base REAL NOT NULL CHECK (precio_base > 0.01),
  comision REAL NOT NULL CHECK (comision > 0.01),
  subastado TEXT CHECK (subastado IN ('si', 'no')) DEFAULT 'no',
  puja_actual REAL DEFAULT 0,
  FOREIGN KEY (catalogo) REFERENCES catalogos (identificador),
  FOREIGN KEY (producto) REFERENCES productos (identificador)
);

CREATE TABLE IF NOT EXISTS asistentes (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_postor INTEGER NOT NULL,
  cliente INTEGER NOT NULL,
  subasta INTEGER NOT NULL,
  FOREIGN KEY (cliente) REFERENCES clientes (identificador),
  FOREIGN KEY (subasta) REFERENCES subastas (identificador)
);

CREATE TABLE IF NOT EXISTS pujos (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  asistente INTEGER NOT NULL,
  item INTEGER NOT NULL,
  importe REAL NOT NULL CHECK (importe > 0.01),
  ganador TEXT CHECK (ganador IN ('si', 'no')) DEFAULT 'no',
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asistente) REFERENCES asistentes (identificador),
  FOREIGN KEY (item) REFERENCES items_catalogo (identificador)
);

CREATE TABLE IF NOT EXISTS registro_de_subasta (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  subasta INTEGER NOT NULL,
  duenio INTEGER NOT NULL,
  producto INTEGER NOT NULL,
  cliente INTEGER NOT NULL,
  importe REAL NOT NULL CHECK (importe > 0.01),
  comision REAL NOT NULL CHECK (comision > 0.01),
  FOREIGN KEY (subasta) REFERENCES subastas (identificador),
  FOREIGN KEY (duenio) REFERENCES duenios (identificador),
  FOREIGN KEY (producto) REFERENCES productos (identificador),
  FOREIGN KEY (cliente) REFERENCES clientes (identificador)
);

CREATE TABLE IF NOT EXISTS medios_pago (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente INTEGER NOT NULL,
  tipo TEXT CHECK (tipo IN ('cuenta', 'tarjeta', 'cheque')) NOT NULL,
  detalle TEXT NOT NULL,
  moneda TEXT CHECK (moneda IN ('ARS', 'USD')) DEFAULT 'ARS',
  monto_garantia REAL DEFAULT 0,
  verificado TEXT CHECK (verificado IN ('si', 'no')) DEFAULT 'no',
  FOREIGN KEY (cliente) REFERENCES clientes (identificador)
);

CREATE TABLE IF NOT EXISTS documentos_identidad (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,
  frente_uri TEXT NOT NULL,
  dorso_uri TEXT NOT NULL,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (persona_id) REFERENCES personas (identificador)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT CHECK (rol IN ('cliente', 'admin')) DEFAULT 'cliente',
  estado TEXT CHECK (estado IN ('activo', 'bloqueado')) DEFAULT 'activo',
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes (identificador)
);

CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY NOT NULL,
  usuario_id INTEGER NOT NULL,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  expira_en TEXT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
);
`;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('elite_bid.db');
  }

  return databasePromise;
}

export async function initDatabase() {
  const db = await getDatabase();

  await db.execAsync(schema);
  await ensureReferenceData(db);
  await seedDatabase(db);

  return db;
}

async function ensureReferenceData(db) {
  const countries = [
    [32, 'Argentina', 'AR', 'Buenos Aires', 'Argentina', 'Espanol'],
    [724, 'Espana', 'ES', 'Madrid', 'Espanola', 'Espanol'],
    [484, 'Mexico', 'MX', 'Ciudad de Mexico', 'Mexicana', 'Espanol'],
    [170, 'Colombia', 'CO', 'Bogota', 'Colombiana', 'Espanol'],
    [152, 'Chile', 'CL', 'Santiago', 'Chilena', 'Espanol']
  ];

  for (const country of countries) {
    await db.runAsync(
      `INSERT OR IGNORE INTO paises (numero, nombre, nombre_corto, capital, nacionalidad, idiomas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      country
    );
  }
}

async function seedDatabase(db) {
  const existing = await db.getFirstAsync('SELECT COUNT(*) AS total FROM usuarios');

  if (existing?.total > 0) {
    return;
  }

  await db.runAsync(
    `INSERT INTO personas (identificador, documento, nombre, direccion, estado)
     VALUES (?, ?, ?, ?, ?)`,
    [1, '30999111', 'Alejandro Vega', 'Av. Alvear 1800, CABA', 'activo']
  );

  await db.runAsync(
    `INSERT INTO personas (identificador, documento, nombre, direccion, estado)
     VALUES (?, ?, ?, ?, ?)`,
    [2, '22111999', 'Mara Santoro', 'Recoleta, CABA', 'activo']
  );

  await db.runAsync(
    `INSERT INTO personas (identificador, documento, nombre, direccion, estado)
     VALUES (?, ?, ?, ?, ?)`,
    [3, '18000999', 'Rafael Montero', 'Palermo, CABA', 'activo']
  );

  await db.runAsync(
    'INSERT INTO empleados (identificador, cargo, sector) VALUES (?, ?, ?)',
    [2, 'Verificador senior', 1]
  );

  await db.runAsync(
    `INSERT INTO clientes (identificador, numero_pais, admitido, categoria, verificador)
     VALUES (?, ?, ?, ?, ?)`,
    [1, 32, 'si', 'platino', 2]
  );

  await db.runAsync(
    `INSERT INTO duenios (identificador, numero_pais, verificacion_financiera, verificacion_judicial, calificacion_riesgo, verificador)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [3, 32, 'si', 'si', 2, 2]
  );

  await db.runAsync(
    'INSERT INTO subastadores (identificador, matricula, region) VALUES (?, ?, ?)',
    [2, 'MAT-8821', 'CABA']
  );

  await db.runAsync(
    `INSERT INTO usuarios (cliente_id, email, password, nombre, rol, estado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'alejandro@elitebid.com', 'Elite1234', 'Alejandro', 'cliente', 'activo']
  );

  await db.runAsync(
    `INSERT INTO medios_pago (cliente, tipo, detalle, moneda, monto_garantia, verificado)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [1, 'tarjeta', 'Visa Black terminada en 2048', 'ARS', 65000000, 'si']
  );

  await insertAuctionSeed(db, {
    title: 'Patek Philippe Grand Complications',
    date: '2026-06-04',
    time: '21:30',
    status: 'abierta',
    category: 'platino',
    currency: 'USD',
    location: 'Salon Nocturne, Puerto Madero',
    image:
      'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80',
    product: 'Reloj mecanico suizo con calendario perpetuo y fase lunar.',
    basePrice: 380000,
    currentBid: 450000
  });

  await insertAuctionSeed(db, {
    title: 'Composicion Abstracta, 1968',
    date: '2026-06-05',
    time: '19:00',
    status: 'abierta',
    category: 'oro',
    currency: 'ARS',
    location: 'Galeria Central',
    image:
      'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=80',
    product: 'Obra expresionista con procedencia documentada y marco original.',
    basePrice: 9500000,
    currentBid: 12500000
  });

  await insertAuctionSeed(db, {
    title: 'Porsche 911 Carrera 1973',
    date: '2026-06-09',
    time: '20:30',
    status: 'programada',
    category: 'oro',
    currency: 'ARS',
    location: 'Hangar Norte',
    image:
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80',
    product: 'Coupe clasico restaurado, matching numbers y dossier tecnico.',
    basePrice: 80000000,
    currentBid: 0
  });
}

async function insertAuctionSeed(db, auction) {
  const auctionResult = await db.runAsync(
    `INSERT INTO subastas (titulo, fecha, hora, estado, subastador, ubicacion, capacidad_asistentes, tiene_deposito, seguridad_propia, categoria, moneda, imagen_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      auction.currency,
      auction.image
    ]
  );

  const productResult = await db.runAsync(
    `INSERT INTO productos (fecha, disponible, descripcion_catalogo, descripcion_completa, revisor, duenio, seguro, imagen_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      auction.date,
      'si',
      auction.product,
      auction.product,
      2,
      3,
      null,
      auction.image
    ]
  );

  const catalogResult = await db.runAsync(
    'INSERT INTO catalogos (descripcion, subasta, responsable) VALUES (?, ?, ?)',
    [`Catalogo ${auction.title}`, auctionResult.lastInsertRowId, 2]
  );

  await db.runAsync(
    `INSERT INTO items_catalogo (catalogo, producto, precio_base, comision, subastado, puja_actual)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      catalogResult.lastInsertRowId,
      productResult.lastInsertRowId,
      auction.basePrice,
      auction.basePrice * 0.12,
      'no',
      auction.currentBid
    ]
  );
}
