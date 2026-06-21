import * as Notifications from 'expo-notifications';

const offlineNotification = {
  body: 'Revisa tu WiFi o datos moviles para seguir usando subastas, pagos y notificaciones.',
  title: 'EliteBid esta sin conexion'
};

let nativeHandlerConfigured = false;

export async function notifyOfflineConnection() {
  if (!nativeHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true
      })
    });
    nativeHandlerConfigured = true;
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permission = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();

  if (!permission.granted) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      body: offlineNotification.body,
      sound: true,
      title: offlineNotification.title
    },
    trigger: null
  });
}
