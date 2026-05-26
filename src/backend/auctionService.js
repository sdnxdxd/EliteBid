import { getDatabase } from './database';

const categoryRank = {
  comun: 1,
  especial: 2,
  plata: 3,
  oro: 4,
  platino: 5
};

export async function getHomeAuctions() {
  const db = await getDatabase();

  const rows = await db.getAllAsync(
    `SELECT
      s.identificador AS id,
      s.titulo AS title,
      s.fecha AS date,
      s.hora AS time,
      s.estado AS status,
      s.categoria AS category,
      'ARS' AS currency,
      s.ubicacion AS location,
      COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description,
      i.precio_base AS basePrice,
      i.puja_actual AS currentBid
     FROM subastas s
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     ORDER BY
       CASE s.estado WHEN 'abierta' THEN 0 WHEN 'programada' THEN 1 ELSE 2 END,
       s.fecha ASC`
  );

  return {
    live: rows.filter((auction) => auction.status === 'abierta'),
    upcoming: rows.filter((auction) => auction.status === 'programada')
  };
}

export async function getAuctionList() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT
      s.identificador AS id,
      s.titulo AS title,
      s.fecha AS date,
      s.hora AS time,
      s.estado AS status,
      s.categoria AS category,
      s.moneda AS currency,
      s.ubicacion AS location,
      COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description,
      i.precio_base AS basePrice,
      i.puja_actual AS currentBid
     FROM subastas s
     JOIN catalogos c ON c.subasta = s.identificador
     JOIN items_catalogo i ON i.catalogo = c.identificador
     JOIN productos p ON p.identificador = i.producto
     ORDER BY
       CASE s.estado WHEN 'abierta' THEN 0 WHEN 'programada' THEN 1 ELSE 2 END,
       s.fecha ASC`
  );

  return rows;
}

export async function getAuctionDetail(auctionId, clienteId) {
  const db = await getDatabase();
  const auction = await db.getFirstAsync(
    `SELECT
      s.identificador AS id,
      s.titulo AS title,
      s.fecha AS date,
      s.hora AS time,
      s.estado AS status,
      s.categoria AS category,
      s.moneda AS currency,
      s.ubicacion AS location,
      s.capacidad_asistentes AS capacity,
      COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description,
      p.descripcion_completa AS fullDescription,
      p.identificador AS productId,
      i.identificador AS itemId,
      i.precio_base AS basePrice,
      i.comision AS commission,
      i.puja_actual AS currentBid,
      per.nombre AS auctioneer
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

  if (!auction) {
    throw new Error('No encontramos esa subasta.');
  }

  const payment = await db.getFirstAsync(
    `SELECT COUNT(*) AS verifiedPayments
     FROM medios_pago
     WHERE cliente = ? AND verificado = 'si'`,
    [clienteId]
  );
  const history = await getAuctionBidFeed(auction.itemId);

  return {
    ...auction,
    bidFeed: history,
    isFavorite: await isFavoriteAuction(clienteId, auctionId),
    eligibility: {
      categoryOk: await hasCategoryAccess(clienteId, auction.category),
      verifiedPayments: payment?.verifiedPayments ?? 0
    }
  };
}

export async function getUserSummary(clienteId) {
  const db = await getDatabase();
  const payments = await db.getFirstAsync(
    `SELECT COUNT(*) AS verifiedPayments
     FROM medios_pago
     WHERE cliente = ? AND verificado = 'si'`,
    [clienteId]
  );

  const bids = await db.getFirstAsync(
    `SELECT COUNT(*) AS totalBids
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     WHERE a.cliente = ?`,
    [clienteId]
  );

  return {
    verifiedPayments: payments?.verifiedPayments ?? 0,
    totalBids: bids?.totalBids ?? 0
  };
}

export async function enterAuctionRoom(clienteId, auctionId) {
  const detail = await getAuctionDetail(auctionId, clienteId);

  if (detail.status !== 'abierta') {
    throw new Error('La sala todavia no esta abierta.');
  }

  if (!detail.eligibility.categoryOk) {
    throw new Error('Tu categoria no permite participar en esta subasta.');
  }

  if (detail.eligibility.verifiedPayments < 1) {
    throw new Error('Necesitas registrar un medio de pago verificado para pujar.');
  }

  await ensureAssistant(clienteId, auctionId);

  return detail;
}

export async function placeBid(clienteId, auctionId, rawAmount) {
  const amount = Number(rawAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Ingresa un monto valido para pujar.');
  }

  const db = await getDatabase();
  const detail = await enterAuctionRoom(clienteId, auctionId);
  const userCategory = await getClientCategory(clienteId);
  const currentBid = Number(detail.currentBid || detail.basePrice || 0);
  const basePrice = Number(detail.basePrice || 0);
  const minBid = currentBid + basePrice * 0.01;
  const maxBid = currentBid + basePrice * 0.2;
  const bypassRange = ['oro', 'platino'].includes(userCategory);

  if (amount <= currentBid) {
    throw new Error(`El monto debe superar la puja actual de ${formatMoney(currentBid)}.`);
  }

  if (!bypassRange && amount < minBid) {
    throw new Error(`El monto debe ser al menos ${formatMoney(minBid)}.`);
  }

  if (!bypassRange && amount > maxBid) {
    throw new Error(`El monto no puede superar ${formatMoney(maxBid)}.`);
  }

  const assistantId = await ensureAssistant(clienteId, auctionId);

  await db.runAsync('UPDATE pujos SET ganador = ? WHERE item = ?', ['no', detail.itemId]);
  const result = await db.runAsync(
    `INSERT INTO pujos (asistente, item, importe, ganador)
     VALUES (?, ?, ?, ?)`,
    [assistantId, detail.itemId, amount, 'si']
  );
  await db.runAsync('UPDATE items_catalogo SET puja_actual = ? WHERE identificador = ?', [
    amount,
    detail.itemId
  ]);

  const refreshed = await getAuctionDetail(auctionId, clienteId);

  return {
    auction: refreshed,
    bid: {
      id: result.lastInsertRowId,
      amount
    }
  };
}

export async function getUserPurchases(clienteId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT
      p.identificador AS id,
      p.importe AS amount,
      p.creado_en AS createdAt,
      p.ganador AS winner,
      s.titulo AS title,
      s.moneda AS currency,
      COALESCE(prod.imagen_uri, s.imagen_uri) AS imageUrl
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     JOIN items_catalogo i ON i.identificador = p.item
     JOIN catalogos c ON c.identificador = i.catalogo
     JOIN subastas s ON s.identificador = c.subasta
     JOIN productos prod ON prod.identificador = i.producto
     WHERE a.cliente = ? AND p.ganador = 'si'
     ORDER BY p.identificador DESC`,
    [clienteId]
  );

  return rows;
}

export async function getFavoriteAuctionIds(clienteId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT subasta AS auctionId
     FROM favoritos
     WHERE cliente = ?
     ORDER BY creado_en DESC`,
    [clienteId]
  );

  return rows.map((row) => row.auctionId);
}

export async function getFavoriteAuctions(clienteId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT
      s.identificador AS id,
      s.titulo AS title,
      s.fecha AS date,
      s.hora AS time,
      s.estado AS status,
      s.categoria AS category,
      s.moneda AS currency,
      s.ubicacion AS location,
      COALESCE(p.imagen_uri, s.imagen_uri) AS imageUrl,
      p.descripcion_catalogo AS description,
      i.precio_base AS basePrice,
      i.puja_actual AS currentBid,
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

  return rows;
}

export async function toggleFavoriteAuction(clienteId, auctionId) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync(
    `SELECT 1 AS found
     FROM favoritos
     WHERE cliente = ? AND subasta = ?`,
    [clienteId, auctionId]
  );

  if (existing) {
    await db.runAsync('DELETE FROM favoritos WHERE cliente = ? AND subasta = ?', [
      clienteId,
      auctionId
    ]);
  } else {
    await db.runAsync(
      `INSERT INTO favoritos (cliente, subasta)
       VALUES (?, ?)`,
      [clienteId, auctionId]
    );
  }

  return getFavoriteAuctionIds(clienteId);
}

export async function isFavoriteAuction(clienteId, auctionId) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT 1 AS found
     FROM favoritos
     WHERE cliente = ? AND subasta = ?`,
    [clienteId, auctionId]
  );

  return Boolean(row);
}

async function getAuctionBidFeed(itemId) {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT
      p.identificador AS id,
      p.importe AS amount,
      p.creado_en AS createdAt,
      p.ganador AS winner,
      a.numero_postor AS bidderNumber
     FROM pujos p
     JOIN asistentes a ON a.identificador = p.asistente
     WHERE p.item = ?
     ORDER BY p.identificador DESC`,
    [itemId]
  );

  return rows.map((row) => ({
    ...row,
    bidderAlias: `@postor${String(row.bidderNumber).padStart(3, '0')}`
  }));
}

async function ensureAssistant(clienteId, auctionId) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync(
    `SELECT identificador AS id
     FROM asistentes
     WHERE cliente = ? AND subasta = ?
     LIMIT 1`,
    [clienteId, auctionId]
  );

  if (existing) {
    return existing.id;
  }

  const next = await db.getFirstAsync(
    'SELECT COALESCE(MAX(numero_postor), 40) + 1 AS number FROM asistentes WHERE subasta = ?',
    [auctionId]
  );
  const result = await db.runAsync(
    `INSERT INTO asistentes (numero_postor, cliente, subasta)
     VALUES (?, ?, ?)`,
    [next?.number ?? 41, clienteId, auctionId]
  );

  return result.lastInsertRowId;
}

async function hasCategoryAccess(clienteId, auctionCategory) {
  const userCategory = await getClientCategory(clienteId);

  return categoryRank[userCategory] >= categoryRank[auctionCategory];
}

async function getClientCategory(clienteId) {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT categoria AS category FROM clientes WHERE identificador = ?',
    [clienteId]
  );

  return row?.category ?? 'comun';
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}
