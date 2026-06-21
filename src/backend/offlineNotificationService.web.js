const offlineNotification = {
  body: 'Revisa tu WiFi o datos moviles para seguir usando subastas, pagos y notificaciones.',
  title: 'EliteBid esta sin conexion'
};

export async function notifyOfflineConnection() {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return;
  }

  let permission = window.Notification.permission;
  if (permission === 'default') {
    permission = await window.Notification.requestPermission();
  }

  if (permission === 'granted') {
    new window.Notification(offlineNotification.title, {
      body: offlineNotification.body,
      icon: '/favicon.ico'
    });
  }
}
