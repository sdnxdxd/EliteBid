import { apiRequest } from './apiClient';

export async function getUserPenalties(clienteId) {
  return apiRequest(`/users/${clienteId}/penalties`);
}

export async function settlePenalty(clienteId, penaltyId) {
  return apiRequest(`/users/${clienteId}/penalties/${penaltyId}/settle`, {
    method: 'POST'
  });
}

export async function presentPenaltyFunds(clienteId, penaltyId) {
  return apiRequest(`/users/${clienteId}/penalties/${penaltyId}/funds`, {
    method: 'POST'
  });
}
