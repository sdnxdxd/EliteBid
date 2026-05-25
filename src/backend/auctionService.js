import { getDatabase } from './database';

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

  return {
    live: rows.filter((auction) => auction.status === 'abierta'),
    upcoming: rows.filter((auction) => auction.status === 'programada')
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
