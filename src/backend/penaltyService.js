import { getDatabase } from './database';

export async function getUserPenalties(clienteId) {
  const db = await getDatabase();

  return db.getAllAsync(
    `SELECT
      identificador AS id,
      titulo AS title,
      descripcion AS description,
      importe AS amount,
      estado AS status,
      vencimiento AS dueDate,
      creado_en AS createdAt
     FROM penalidades
     WHERE cliente = ?
     ORDER BY
       CASE estado WHEN 'activa' THEN 0 WHEN 'vencida' THEN 1 ELSE 2 END,
       vencimiento ASC`,
    [clienteId]
  );
}

export async function settlePenalty(clienteId, penaltyId) {
  const db = await getDatabase();
  const penalty = await db.getFirstAsync(
    `SELECT identificador AS id, estado AS status
     FROM penalidades
     WHERE identificador = ? AND cliente = ?
     LIMIT 1`,
    [penaltyId, clienteId]
  );

  if (!penalty) {
    throw new Error('No encontramos esa penalidad.');
  }

  if (penalty.status !== 'activa' && penalty.status !== 'vencida') {
    throw new Error('Esa penalidad ya esta solucionada.');
  }

  await db.runAsync(
    `UPDATE penalidades
     SET estado = ?
     WHERE identificador = ? AND cliente = ?`,
    ['pagada', penaltyId, clienteId]
  );

  return getUserPenalties(clienteId);
}
