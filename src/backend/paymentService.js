import { apiRequest } from './apiClient';

export async function getPaymentMethods(clienteId) {
  return apiRequest(`/users/${clienteId}/payments`);
}

export async function addPaymentMethod(clienteId, payload) {
  return apiRequest(`/users/${clienteId}/payments`, {
    body: JSON.stringify(payload),
    method: 'POST'
  });
}

export async function deletePaymentMethod(clienteId, paymentId) {
  return apiRequest(`/users/${clienteId}/payments/${paymentId}`, {
    method: 'DELETE'
  });
}
