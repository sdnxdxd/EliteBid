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

CREATE TABLE IF NOT EXISTS sectores (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_sector TEXT NOT NULL,
  codigo_sector TEXT,
  responsable_sector INTEGER,
  FOREIGN KEY (responsable_sector) REFERENCES empleados (identificador)
);

CREATE TABLE IF NOT EXISTS seguros (
  nro_poliza TEXT PRIMARY KEY NOT NULL,
  compania TEXT NOT NULL,
  poliza_combinada TEXT CHECK (poliza_combinada IN ('si', 'no')),
  importe REAL NOT NULL CHECK (importe > 0)
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

CREATE TABLE IF NOT EXISTS subastadores (
  identificador INTEGER PRIMARY KEY NOT NULL,
  matricula TEXT,
  region TEXT,
  FOREIGN KEY (identificador) REFERENCES personas (identificador)
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

CREATE TABLE IF NOT EXISTS fotos (
  identificador INTEGER PRIMARY KEY AUTOINCREMENT,
  producto INTEGER NOT NULL,
  foto_uri TEXT NOT NULL,
  FOREIGN KEY (producto) REFERENCES productos (identificador)
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
