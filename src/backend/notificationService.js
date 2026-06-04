import { apiRequest } from './apiClient';

export async function getNotifications() {
  return apiRequest('/notificaciones');
}

export async function performNotificationAction(notificationId) {
  return apiRequest(`/notificaciones/${notificationId}/accion`, {
    method: 'POST'
  });
}
