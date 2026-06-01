import { apiRequest } from './apiClient';

export async function getUserProfile(clienteId) {
  return apiRequest(`/users/${clienteId}/profile`);
}

export async function updateUserProfile(userId, clienteId, payload) {
  return apiRequest(`/users/${clienteId}/profile`, {
    body: JSON.stringify({ ...payload, userId }),
    method: 'PUT'
  });
}

export async function updateProfilePhoto(clienteId, photoUri) {
  await apiRequest(`/users/${clienteId}/profile/photo`, {
    body: JSON.stringify({ photoUri }),
    method: 'PUT'
  });
}
