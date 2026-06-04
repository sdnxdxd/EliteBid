import { apiRequest } from './apiClient';

export async function getUserLots(clienteId) {
  try {
    const response = await apiRequest('/solicitudes-venta');
    return normalizeLots(response.solicitudes || response);
  } catch (error) {
    if (!clienteId || !isSessionError(error)) {
      throw error;
    }

    return normalizeLots(await apiRequest(`/users/${clienteId}/lots`));
  }
}

export async function submitUserLot(clienteId, payload) {
  const body = JSON.stringify(toSaleRequestInput(payload));
  let response;

  try {
    response = await apiRequest('/solicitudes-venta', {
      body,
      method: 'POST'
    });
  } catch (error) {
    if (!clienteId || !isSessionError(error)) {
      throw error;
    }

    response = await apiRequest(`/users/${clienteId}/lots`, {
      body: JSON.stringify(payload),
      method: 'POST'
    });
  }

  const rows = await getUserLots(clienteId);
  return rows.some((lot) => lot.id === response.id) ? rows : [response, ...rows];
}

function normalizeLots(rows) {
  return Array.isArray(rows) ? rows : [];
}

function isSessionError(error) {
  return /inicia sesion/i.test(error?.message || '');
}

function toSaleRequestInput(payload) {
  return {
    ...payload,
    declaracionPropiedad: payload.ownershipDeclaration,
    descripcion: payload.description,
    fotos: payload.photoUris?.length || 0,
    composicion: payload.composition,
    nombreBien: payload.title,
    precioEstimado: payload.estimatedValue,
    tipoLote: payload.lotKind,
    uploadIds: payload.photoUris
  };
}
