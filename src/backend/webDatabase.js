const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const storageKey = 'elitebid-web-db-v2';

export function createWebDatabase() {
  const state = loadStoredState();

  return {
    async execAsync() {
      return undefined;
    },
    async getAllAsync(sql, params = []) {
      return routeQuery(state, sql, params, true);
    },
    async getFirstAsync(sql, params = []) {
      const rows = routeQuery(state, sql, params, true);
      return rows[0] ?? null;
    },
    async runAsync(sql, params = []) {
      const result = routeMutation(state, sql, params);
      persistState(state);
      return result;
    }
  };
}

function loadStoredState() {
  try {
    if (typeof localStorage === 'undefined') {
      return createSeedState();
    }

    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      return createSeedState();
    }

    return {
      ...createSeedState(),
      ...JSON.parse(stored)
    };
  } catch {
    return createSeedState();
  }
}

function persistState(state) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
  } catch {
    // The app can keep working in-memory if browser storage is unavailable.
  }
}

function createSeedState() {
  return {
    asistentes: [
      { identificador: 1, numero_postor: 41, cliente: 1, subasta: 1 },
      { identificador: 2, numero_postor: 42, cliente: 1, subasta: 2 }
    ],
    catalogos: [
      { identificador: 1, descripcion: 'Catalogo Patek Philippe Grand Complications', subasta: 1, responsable: 2 },
      { identificador: 2, descripcion: 'Catalogo Composicion Abstracta, 1968', subasta: 2, responsable: 2 },
      { identificador: 3, descripcion: 'Catalogo Porsche 911 Carrera 1973', subasta: 3, responsable: 2 }
    ],
    clientes: [
      { identificador: 1, numero_pais: 32, admitido: 'si', categoria: 'platino', verificador: 2 }
    ],
    documentos_identidad: [],
    duenios: [
      {
        identificador: 3,
        numero_pais: 32,
        verificacion_financiera: 'si',
        verificacion_judicial: 'si',
        calificacion_riesgo: 2,
        verificador: 2
      }
    ],
    empleados: [{ identificador: 2, cargo: 'Verificador senior', sector: 1 }],
    favoritos: [],
    items_catalogo: [
      { identificador: 1, catalogo: 1, producto: 1, precio_base: 380000, comision: 45600, subastado: 'no', puja_actual: 450000 },
      { identificador: 2, catalogo: 2, producto: 2, precio_base: 9500000, comision: 1140000, subastado: 'no', puja_actual: 12500000 },
      { identificador: 3, catalogo: 3, producto: 3, precio_base: 80000000, comision: 9600000, subastado: 'no', puja_actual: 0 }
    ],
    medios_pago: [
      {
        identificador: 1,
        cliente: 1,
        tipo: 'tarjeta',
        detalle: 'Visa Black terminada en 2048',
        moneda: 'ARS',
        monto_garantia: 65000000,
        verificado: 'si'
      }
    ],
    paises: [
      { numero: 32, nombre: 'Argentina', nombre_corto: 'AR', capital: 'Buenos Aires', nacionalidad: 'Argentina', idiomas: 'Espanol' },
      { numero: 724, nombre: 'Espana', nombre_corto: 'ES', capital: 'Madrid', nacionalidad: 'Espanola', idiomas: 'Espanol' },
      { numero: 484, nombre: 'Mexico', nombre_corto: 'MX', capital: 'Ciudad de Mexico', nacionalidad: 'Mexicana', idiomas: 'Espanol' },
      { numero: 170, nombre: 'Colombia', nombre_corto: 'CO', capital: 'Bogota', nacionalidad: 'Colombiana', idiomas: 'Espanol' },
      { numero: 152, nombre: 'Chile', nombre_corto: 'CL', capital: 'Santiago', nacionalidad: 'Chilena', idiomas: 'Espanol' }
    ],
    penalidades: [
      {
        identificador: 1,
        cliente: 1,
        titulo: 'Retraso en pago',
        descripcion: 'Incumplimiento de plazo para Rolex Daytona 1968. La cuenta tiene restricciones temporales de puja.',
        importe: 15000,
        estado: 'activa',
        vencimiento: '2026-06-02',
        creado_en: now()
      }
    ],
    personas: [
      { identificador: 1, documento: '30999111', nombre: 'Alejandro Vega', direccion: 'Av. Alvear 1800, CABA', estado: 'activo', foto_uri: null },
      { identificador: 2, documento: '22111999', nombre: 'Mara Santoro', direccion: 'Recoleta, CABA', estado: 'activo', foto_uri: null },
      { identificador: 3, documento: '18000999', nombre: 'Rafael Montero', direccion: 'Palermo, CABA', estado: 'activo', foto_uri: null }
    ],
    productos: [
      {
        identificador: 1,
        fecha: '2026-06-04',
        disponible: 'si',
        descripcion_catalogo: 'Reloj mecanico suizo con calendario perpetuo y fase lunar.',
        descripcion_completa: 'Reloj mecanico suizo con calendario perpetuo y fase lunar.',
        revisor: 2,
        duenio: 3,
        seguro: null,
        imagen_uri: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80'
      },
      {
        identificador: 2,
        fecha: '2026-06-05',
        disponible: 'si',
        descripcion_catalogo: 'Obra expresionista con procedencia documentada y marco original.',
        descripcion_completa: 'Obra expresionista con procedencia documentada y marco original.',
        revisor: 2,
        duenio: 3,
        seguro: null,
        imagen_uri: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=80'
      },
      {
        identificador: 3,
        fecha: '2026-06-09',
        disponible: 'si',
        descripcion_catalogo: 'Coupe clasico restaurado, matching numbers y dossier tecnico.',
        descripcion_completa: 'Coupe clasico restaurado, matching numbers y dossier tecnico.',
        revisor: 2,
        duenio: 3,
        seguro: null,
        imagen_uri: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80'
      }
    ],
    pujos: [
      { identificador: 1, asistente: 1, item: 1, importe: 450000, ganador: 'si', creado_en: now() },
      { identificador: 2, asistente: 2, item: 2, importe: 12500000, ganador: 'si', creado_en: now() }
    ],
    registro_de_subasta: [],
    sesiones: [],
    subastadores: [{ identificador: 2, matricula: 'MAT-8821', region: 'CABA' }],
    subastas: [
      {
        identificador: 1,
        titulo: 'Patek Philippe Grand Complications',
        fecha: '2026-06-04',
        hora: '21:30',
        estado: 'abierta',
        subastador: 2,
        ubicacion: 'Salon Nocturne, Puerto Madero',
        capacidad_asistentes: 120,
        tiene_deposito: 'si',
        seguridad_propia: 'si',
        categoria: 'platino',
        moneda: 'ARS',
        imagen_uri: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80'
      },
      {
        identificador: 2,
        titulo: 'Composicion Abstracta, 1968',
        fecha: '2026-06-05',
        hora: '19:00',
        estado: 'abierta',
        subastador: 2,
        ubicacion: 'Galeria Central',
        capacidad_asistentes: 120,
        tiene_deposito: 'si',
        seguridad_propia: 'si',
        categoria: 'oro',
        moneda: 'ARS',
        imagen_uri: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=900&q=80'
      },
      {
        identificador: 3,
        titulo: 'Porsche 911 Carrera 1973',
        fecha: '2026-06-09',
        hora: '20:30',
        estado: 'programada',
        subastador: 2,
        ubicacion: 'Hangar Norte',
        capacidad_asistentes: 120,
        tiene_deposito: 'si',
        seguridad_propia: 'si',
        categoria: 'oro',
        moneda: 'ARS',
        imagen_uri: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80'
      }
    ],
    usuarios: [
      {
        id: 1,
        cliente_id: 1,
        email: 'alejandro@elitebid.com',
        password: 'Elite1234',
        nombre: 'Alejandro',
        rol: 'cliente',
        estado: 'activo',
        creado_en: now()
      }
    ]
  };
}

function routeQuery(state, sql, params) {
  const query = normalizeSql(sql);

  if (query.includes('select count(*) as total from usuarios')) {
    return [{ total: state.usuarios.length }];
  }

  if (query.includes('select identificador from personas where identificador')) {
    return findById(state.personas, params[0]) ? [{ identificador: params[0] }] : [];
  }

  if (query.includes('select count(*) as total from penalidades where cliente')) {
    return [{ total: state.penalidades.filter((row) => row.cliente === params[0]).length }];
  }

  if (query.includes('select id from usuarios where lower(email) = ? and id <> ?')) {
    return state.usuarios
      .filter((user) => user.email.toLowerCase() === params[0] && user.id !== params[1])
      .map((user) => ({ id: user.id }));
  }

  if (query.includes('select id from usuarios where lower(email) = ?')) {
    return state.usuarios
      .filter((user) => user.email.toLowerCase() === params[0])
      .map((user) => ({ id: user.id }));
  }

  if (query.includes('from usuarios u join clientes c') && query.includes('where lower(u.email) = ?')) {
    const user = state.usuarios.find((row) => row.email.toLowerCase() === params[0]);
    return user ? [buildSessionUser(state, user)] : [];
  }

  if (query.includes('from sesiones s join usuarios u') && query.includes('where s.expira_en > ?')) {
    return state.sesiones
      .filter((session) => session.expira_en > params[0])
      .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)))
      .map((session) => {
        const user = findById(state.usuarios, session.usuario_id);
        return user ? { ...buildSessionUser(state, user), sessionToken: session.token } : null;
      })
      .filter(Boolean);
  }

  if (query.includes('select u.id from usuarios u join personas p')) {
    const identifier = String(params[0]).toLowerCase();
    return state.usuarios
      .filter((user) => {
        const person = findById(state.personas, user.cliente_id);
        return user.email.toLowerCase() === identifier || person?.documento === params[1];
      })
      .map((user) => ({ id: user.id }));
  }

  if (query.includes('from personas p') && query.includes('join clientes c') && query.includes('join usuarios u') && query.includes('where p.identificador = ?')) {
    const person = findById(state.personas, params[0]);
    return person ? [buildProfile(state, person)] : [];
  }

  if (query.includes('select documento, nombre as fullname from personas')) {
    const person = findById(state.personas, params[0]);
    return person ? [{ documento: person.documento, fullName: person.nombre }] : [];
  }

  if (query.includes('from medios_pago') && query.includes('count(*) as verifiedpayments')) {
    return [{
      verifiedPayments: state.medios_pago.filter((row) => row.cliente === params[0] && row.verificado === 'si').length
    }];
  }

  if (query.includes('from medios_pago') && query.includes('count(*) as paymentcount')) {
    return [{ paymentCount: state.medios_pago.filter((row) => row.cliente === params[0]).length }];
  }

  if (query.includes('from medios_pago') && query.includes('identificador as id')) {
    return state.medios_pago
      .filter((row) => row.cliente === params[0])
      .sort((a, b) => b.identificador - a.identificador)
      .map((row) => ({
        amount: row.monto_garantia,
        currency: row.moneda,
        detail: row.detalle,
        id: row.identificador,
        type: row.tipo,
        verified: row.verificado
      }));
  }

  if (query.includes('from pujos p') && query.includes('count(*) as totalbids')) {
    return [{
      totalBids: state.pujos.filter((bid) => findById(state.asistentes, bid.asistente)?.cliente === params[0]).length
    }];
  }

  if (query.includes('from subastas s') && query.includes('where s.identificador = ?')) {
    const row = buildAuctionDetail(state, params[0]);
    return row ? [row] : [];
  }

  if (query.includes('from subastas s') && query.includes('join catalogos c')) {
    return getAuctionRows(state);
  }

  if (query.includes('from pujos p') && query.includes('where p.item = ?')) {
    return state.pujos
      .filter((bid) => bid.item === params[0])
      .sort((a, b) => b.identificador - a.identificador)
      .map((bid) => {
        const assistant = findById(state.asistentes, bid.asistente);
        return {
          amount: bid.importe,
          bidderNumber: assistant?.numero_postor ?? 0,
          createdAt: bid.creado_en,
          id: bid.identificador,
          winner: bid.ganador
        };
      });
  }

  if (query.includes('from pujos p') && query.includes("p.ganador = 'si'")) {
    return state.pujos
      .filter((bid) => bid.ganador === 'si' && findById(state.asistentes, bid.asistente)?.cliente === params[0])
      .sort((a, b) => b.identificador - a.identificador)
      .map((bid) => buildPurchaseRow(state, bid));
  }

  if (query.includes('select subasta as auctionid from favoritos')) {
    return state.favoritos
      .filter((favorite) => favorite.cliente === params[0])
      .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)))
      .map((favorite) => ({ auctionId: favorite.subasta }));
  }

  if (query.includes('from favoritos f') && query.includes('join subastas s')) {
    return state.favoritos
      .filter((favorite) => favorite.cliente === params[0])
      .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)))
      .map((favorite) => ({
        ...buildAuctionRow(state, favorite.subasta),
        favoritedAt: favorite.creado_en
      }))
      .filter(Boolean);
  }

  if (query.includes('select 1 as found') && query.includes('from favoritos')) {
    const found = state.favoritos.some((favorite) => favorite.cliente === params[0] && favorite.subasta === params[1]);
    return found ? [{ found: 1 }] : [];
  }

  if (query.includes('select categoria as category from clientes')) {
    const client = findById(state.clientes, params[0]);
    return client ? [{ category: client.categoria }] : [];
  }

  if (query.includes('select identificador as id from asistentes')) {
    const assistant = state.asistentes.find((row) => row.cliente === params[0] && row.subasta === params[1]);
    return assistant ? [{ id: assistant.identificador }] : [];
  }

  if (query.includes('select coalesce(max(numero_postor), 40) + 1 as number from asistentes')) {
    const numbers = state.asistentes
      .filter((assistant) => assistant.subasta === params[0])
      .map((assistant) => assistant.numero_postor);
    return [{ number: (numbers.length ? Math.max(...numbers) : 40) + 1 }];
  }

  if (query.includes('select identificador as id, estado as status from penalidades')) {
    return state.penalidades
      .filter((row) => row.identificador === params[0] && row.cliente === params[1])
      .map((row) => ({
        id: row.identificador,
        status: row.estado
      }));
  }

  if (query.includes('from penalidades')) {
    const statusRank = { activa: 0, vencida: 1, pagada: 2 };

    return state.penalidades
      .filter((row) => row.cliente === params[0])
      .sort((a, b) => (statusRank[a.estado] ?? 3) - (statusRank[b.estado] ?? 3) || a.vencimiento.localeCompare(b.vencimiento))
      .map((row) => ({
        amount: row.importe,
        createdAt: row.creado_en,
        description: row.descripcion,
        dueDate: row.vencimiento,
        id: row.identificador,
        status: row.estado,
        title: row.titulo
      }));
  }

  return [];
}

function routeMutation(state, sql, params) {
  const query = normalizeSql(sql);

  if (query.includes('insert or ignore into paises')) {
    const [numero, nombre, nombre_corto, capital, nacionalidad, idiomas] = params;
    if (!findById(state.paises, numero)) {
      state.paises.push({ numero, nombre, nombre_corto, capital, nacionalidad, idiomas });
    }
    return result(numero);
  }

  if (query.includes('insert into sesiones')) {
    const [token, usuario_id, expira_en] = params;
    state.sesiones.push({ token, usuario_id, expira_en, creado_en: now() });
    return result(token);
  }

  if (query.includes('delete from sesiones where usuario_id')) {
    removeWhere(state.sesiones, (row) => row.usuario_id === params[0]);
    return result();
  }

  if (query.includes('delete from sesiones where token')) {
    removeWhere(state.sesiones, (row) => row.token === params[0]);
    return result();
  }

  if (query.includes('insert into personas') && query.includes('foto_uri')) {
    const id = nextId(state.personas);
    const [documento, nombre, direccion, estado, foto_uri] = params;
    state.personas.push({ identificador: id, documento, nombre, direccion, estado, foto_uri });
    return result(id);
  }

  if (query.includes('insert into documentos_identidad')) {
    const id = nextId(state.documentos_identidad);
    const [persona_id, frente_uri, dorso_uri] = params;
    state.documentos_identidad.push({ identificador: id, persona_id, frente_uri, dorso_uri, creado_en: now() });
    return result(id);
  }

  if (query.includes('insert into clientes')) {
    const [identificador, numero_pais, admitido, categoria, verificador] = params;
    state.clientes.push({ identificador, numero_pais, admitido, categoria, verificador });
    return result(identificador);
  }

  if (query.includes('insert into usuarios')) {
    const id = nextId(state.usuarios);
    const [cliente_id, email, password, nombre, rol, estado] = params;
    state.usuarios.push({ id, cliente_id, email, password, nombre, rol, estado, creado_en: now() });
    return result(id);
  }

  if (query.includes('update usuarios set password')) {
    const user = findById(state.usuarios, params[1]);
    if (user) user.password = params[0];
    return result();
  }

  if (query.includes('update usuarios') && query.includes('set email')) {
    const user = findById(state.usuarios, params[1]);
    if (user) user.email = params[0];
    return result();
  }

  if (query.includes('update personas') && query.includes('set direccion')) {
    const person = findById(state.personas, params[1]);
    if (person) person.direccion = params[0];
    return result();
  }

  if (query.includes('update personas set foto_uri')) {
    const person = findById(state.personas, params[1]);
    if (person) person.foto_uri = params[0];
    return result();
  }

  if (query.includes('insert into medios_pago')) {
    const id = nextId(state.medios_pago);
    const [cliente, tipo, detalle, moneda, monto_garantia, verificado] = params;
    state.medios_pago.push({ identificador: id, cliente, tipo, detalle, moneda, monto_garantia, verificado });
    return result(id);
  }

  if (query.includes('delete from medios_pago')) {
    removeWhere(state.medios_pago, (row) => row.identificador === params[0] && row.cliente === params[1]);
    return result();
  }

  if (query.includes('insert into favoritos')) {
    const [cliente, subasta] = params;
    if (!state.favoritos.some((row) => row.cliente === cliente && row.subasta === subasta)) {
      state.favoritos.push({ cliente, subasta, creado_en: now() });
    }
    return result(subasta);
  }

  if (query.includes('delete from favoritos')) {
    removeWhere(state.favoritos, (row) => row.cliente === params[0] && row.subasta === params[1]);
    return result();
  }

  if (query.includes('update penalidades') && query.includes('set estado')) {
    const penalty = state.penalidades.find((row) => row.identificador === params[1] && row.cliente === params[2]);
    if (penalty) {
      penalty.estado = params[0];
    }
    return result();
  }

  if (query.includes('insert into asistentes')) {
    const id = nextId(state.asistentes);
    const [numero_postor, cliente, subasta] = params;
    state.asistentes.push({ identificador: id, numero_postor, cliente, subasta });
    return result(id);
  }

  if (query.includes('update pujos set ganador')) {
    state.pujos.forEach((bid) => {
      if (bid.item === params[1]) {
        bid.ganador = params[0];
      }
    });
    return result();
  }

  if (query.includes('insert into pujos')) {
    const id = nextId(state.pujos);
    const [asistente, item, importe, ganador] = params;
    state.pujos.push({ identificador: id, asistente, item, importe, ganador, creado_en: now() });
    return result(id);
  }

  if (query.includes('update items_catalogo set puja_actual')) {
    const item = findById(state.items_catalogo, params[1]);
    if (item) item.puja_actual = params[0];
    return result();
  }

  return result();
}

function buildSessionUser(state, user) {
  const client = findById(state.clientes, user.cliente_id);

  return {
    admitido: client?.admitido,
    categoria: client?.categoria,
    clienteId: user.cliente_id,
    email: user.email,
    estado: user.estado,
    id: user.id,
    nombre: user.nombre,
    password: user.password,
    paymentCount: state.medios_pago.filter((row) => row.cliente === user.cliente_id).length,
    rol: user.rol
  };
}

function buildProfile(state, person) {
  const client = findById(state.clientes, person.identificador);
  const user = state.usuarios.find((row) => row.cliente_id === person.identificador);
  const country = findById(state.paises, client?.numero_pais);
  const penalties = state.penalidades.filter((row) => row.cliente === person.identificador && row.estado === 'activa');

  return {
    activePenaltyAmount: penalties.reduce((total, row) => total + Number(row.importe || 0), 0),
    activePenaltyCount: penalties.length,
    auctionsAttended: state.asistentes.filter((row) => row.cliente === person.identificador).length,
    auctionsWon: state.pujos.filter(
      (bid) => bid.ganador === 'si' && findById(state.asistentes, bid.asistente)?.cliente === person.identificador
    ).length,
    categoria: client?.categoria,
    clienteId: person.identificador,
    countryName: country?.nombre,
    countryNumber: client?.numero_pais,
    documento: person.documento,
    email: user?.email,
    firstName: user?.nombre,
    fullName: person.nombre,
    invested: state.pujos
      .filter(
        (bid) => bid.ganador === 'si' && findById(state.asistentes, bid.asistente)?.cliente === person.identificador
      )
      .reduce((total, row) => total + Number(row.importe || 0), 0),
    legalAddress: person.direccion,
    paymentCount: state.medios_pago.filter((row) => row.cliente === person.identificador).length,
    photoUri: person.foto_uri,
    userId: user?.id
  };
}

function getAuctionRows(state) {
  return state.subastas
    .map((auction) => buildAuctionRow(state, auction.identificador))
    .filter(Boolean)
    .sort((a, b) => {
      const statusRank = { abierta: 0, programada: 1, cerrada: 2 };
      return (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3) || a.date.localeCompare(b.date);
    });
}

function buildAuctionRow(state, auctionId) {
  const auction = findById(state.subastas, auctionId);
  const catalog = state.catalogos.find((row) => row.subasta === auctionId);
  const item = state.items_catalogo.find((row) => row.catalogo === catalog?.identificador);
  const product = findById(state.productos, item?.producto);

  if (!auction || !catalog || !item || !product) {
    return null;
  }

  return {
    basePrice: item.precio_base,
    category: auction.categoria,
    currency: auction.moneda || 'ARS',
    currentBid: item.puja_actual,
    date: auction.fecha,
    description: product.descripcion_catalogo,
    id: auction.identificador,
    imageUrl: product.imagen_uri || auction.imagen_uri,
    location: auction.ubicacion,
    status: auction.estado,
    time: auction.hora,
    title: auction.titulo
  };
}

function buildAuctionDetail(state, auctionId) {
  const row = buildAuctionRow(state, auctionId);
  const auction = findById(state.subastas, auctionId);
  const catalog = state.catalogos.find((item) => item.subasta === auctionId);
  const item = state.items_catalogo.find((entry) => entry.catalogo === catalog?.identificador);
  const product = findById(state.productos, item?.producto);
  const auctioneer = findById(state.personas, auction?.subastador);

  if (!row || !auction || !item || !product) {
    return null;
  }

  return {
    ...row,
    auctioneer: auctioneer?.nombre,
    capacity: auction.capacidad_asistentes,
    commission: item.comision,
    fullDescription: product.descripcion_completa,
    itemId: item.identificador,
    productId: product.identificador
  };
}

function buildPurchaseRow(state, bid) {
  const item = findById(state.items_catalogo, bid.item);
  const catalog = findById(state.catalogos, item?.catalogo);
  const auction = findById(state.subastas, catalog?.subasta);
  const product = findById(state.productos, item?.producto);

  return {
    amount: bid.importe,
    createdAt: bid.creado_en,
    currency: auction?.moneda,
    id: bid.identificador,
    imageUrl: product?.imagen_uri || auction?.imagen_uri,
    title: auction?.titulo,
    winner: bid.ganador
  };
}

function findById(rows, id) {
  return rows.find((row) => row.identificador === id || row.id === id || row.numero === id);
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, row.identificador ?? row.id ?? 0), 0) + 1;
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
}

function removeWhere(rows, predicate) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (predicate(rows[index])) {
      rows.splice(index, 1);
    }
  }
}

function result(lastInsertRowId = 0) {
  return {
    changes: 1,
    lastInsertRowId
  };
}
