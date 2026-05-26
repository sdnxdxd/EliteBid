import { getDatabase } from './database';

export async function getUserProfile(clienteId) {
  const db = await getDatabase();
  const profile = await db.getFirstAsync(
    `SELECT
      p.identificador AS clienteId,
      p.documento,
      p.nombre AS fullName,
      p.direccion AS legalAddress,
      p.foto_uri AS photoUri,
      u.id AS userId,
      u.email,
      u.nombre AS firstName,
      c.categoria,
      c.numero_pais AS countryNumber,
      pa.nombre AS countryName,
      (
        SELECT COUNT(*)
        FROM medios_pago mp
        WHERE mp.cliente = p.identificador
      ) AS paymentCount,
      (
        SELECT COUNT(*)
        FROM asistentes a
        WHERE a.cliente = p.identificador
      ) AS auctionsAttended,
      (
        SELECT COUNT(*)
        FROM pujos pu
        JOIN asistentes a ON a.identificador = pu.asistente
        WHERE a.cliente = p.identificador AND pu.ganador = 'si'
      ) AS auctionsWon,
      (
        SELECT COALESCE(SUM(pu.importe), 0)
        FROM pujos pu
        JOIN asistentes a ON a.identificador = pu.asistente
        WHERE a.cliente = p.identificador AND pu.ganador = 'si'
      ) AS invested,
      (
        SELECT COUNT(*)
        FROM penalidades pe
        WHERE pe.cliente = p.identificador AND pe.estado = 'activa'
      ) AS activePenaltyCount,
      (
        SELECT COALESCE(SUM(pe.importe), 0)
        FROM penalidades pe
        WHERE pe.cliente = p.identificador AND pe.estado = 'activa'
      ) AS activePenaltyAmount
     FROM personas p
     JOIN clientes c ON c.identificador = p.identificador
     JOIN usuarios u ON u.cliente_id = c.identificador
     LEFT JOIN paises pa ON pa.numero = c.numero_pais
     WHERE p.identificador = ?`,
    [clienteId]
  );

  if (!profile) {
    return null;
  }

  return {
    ...profile,
    identityFirstName: getFirstName(profile.fullName),
    identityLastName: getLastName(profile.fullName)
  };
}

export async function updateUserProfile(userId, clienteId, payload) {
  validateProfile(payload);

  const db = await getDatabase();
  await assertImmutableIdentity(db, clienteId, payload);

  const normalizedEmail = payload.email.trim().toLowerCase();
  const duplicate = await db.getFirstAsync(
    'SELECT id FROM usuarios WHERE lower(email) = ? AND id <> ?',
    [normalizedEmail, userId]
  );

  if (duplicate) {
    throw new Error('Ese correo ya esta usado por otro usuario.');
  }

  await db.runAsync(
    `UPDATE personas
     SET direccion = ?
     WHERE identificador = ?`,
    [payload.legalAddress.trim(), clienteId]
  );

  await db.runAsync(
    `UPDATE usuarios
     SET email = ?
     WHERE id = ?`,
    [normalizedEmail, userId]
  );

  return {
    email: normalizedEmail
  };
}

export async function updateProfilePhoto(clienteId, photoUri) {
  if (!photoUri?.trim()) {
    throw new Error('Selecciona una foto para actualizar tu perfil.');
  }

  const db = await getDatabase();
  await db.runAsync('UPDATE personas SET foto_uri = ? WHERE identificador = ?', [
    photoUri.trim(),
    clienteId
  ]);
}

function validateProfile(payload) {
  if (!payload.email?.trim() || !/^\S+@\S+\.\S+$/.test(payload.email.trim())) {
    throw new Error('Ingresa un correo valido.');
  }

  if (!payload.legalAddress?.trim()) {
    throw new Error('Ingresa tu domicilio legal.');
  }
}

async function assertImmutableIdentity(db, clienteId, payload) {
  const current = await db.getFirstAsync(
    `SELECT documento, nombre AS fullName
     FROM personas
     WHERE identificador = ?`,
    [clienteId]
  );

  if (!current) {
    throw new Error('No encontramos tu perfil.');
  }

  const immutableFields = [
    [payload.firstName, getFirstName(current.fullName), 'El nombre no se puede modificar.'],
    [payload.lastName, getLastName(current.fullName), 'El apellido no se puede modificar.'],
    [payload.documento, current.documento, 'El documento no se puede modificar.']
  ];

  for (const [nextValue, currentValue, message] of immutableFields) {
    if (nextValue != null && normalizeIdentityValue(nextValue) !== normalizeIdentityValue(currentValue)) {
      throw new Error(message);
    }
  }
}

function getFirstName(fullName = '') {
  return String(fullName).trim().split(/\s+/)[0] ?? '';
}

function getLastName(fullName = '') {
  return String(fullName).trim().split(/\s+/).slice(1).join(' ');
}

function normalizeIdentityValue(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}
