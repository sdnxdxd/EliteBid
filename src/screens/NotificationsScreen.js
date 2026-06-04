import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getNotifications, performNotificationAction } from '../backend/notificationService';
import AppToast from '../components/AppToast';
import { colors, radii } from '../theme';

const priorityMeta = {
  alta: { color: colors.error, icon: 'alert-circle-outline', label: 'Alta' },
  media: { color: colors.secondary, icon: 'clock-outline', label: 'Media' },
  baja: { color: colors.primary, icon: 'information-outline', label: 'Info' }
};

const actionLabel = {
  add_payment: 'Agregar pago',
  open_auction: 'Ver subasta',
  open_auctions: 'Ver subastas',
  open_lots: 'Ver ventas',
  open_penalties: 'Resolver',
  verify_account: 'Verificar'
};

export default function NotificationsScreen({ onAction, onBack }) {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setNotifications(await getNotifications());
    } catch (error) {
      setToast({ message: error.message, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAction(notification) {
    try {
      const result = await performNotificationAction(notification.id);
      onAction?.(result);
    } catch (error) {
      setToast({ message: error.message, tone: 'danger' });
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.surfaceLowest, colors.surface, colors.surfaceLow]} style={StyleSheet.absoluteFill} />
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-left" size={25} />
        </Pressable>
        <Text style={styles.logo}>Notificaciones</Text>
        <Pressable onPress={load} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="refresh" size={23} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{notifications.filter((item) => !item.read).length}</Text>
            <Text style={styles.summaryText}>notificaciones requieren atencion</Text>
          </View>

          {notifications.length ? (
            notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onAction={() => handleAction(notification)}
              />
            ))
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons color={colors.primary} name="bell-check-outline" size={42} />
              <Text style={styles.emptyTitle}>Sin novedades</Text>
              <Text style={styles.emptyText}>Cuando haya acciones pendientes o avisos de subasta van a aparecer aca.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <AppToast
        bottom={24}
        message={toast?.message}
        onDone={() => setToast(null)}
        tone={toast?.tone}
        visible={Boolean(toast)}
      />
    </View>
  );
}

function NotificationCard({ notification, onAction }) {
  const meta = priorityMeta[notification.priority] ?? priorityMeta.baja;

  return (
    <View style={[styles.card, !notification.read && styles.cardUnread]}>
      <View style={styles.cardHeader}>
        <View style={[styles.priorityIcon, { backgroundColor: `${meta.color}22` }]}>
          <MaterialCommunityIcons color={meta.color} name={meta.icon} size={24} />
        </View>
        <View style={styles.cardCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{notification.title}</Text>
            <Text style={[styles.priorityText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.cardText}>{notification.description}</Text>
        </View>
      </View>
      <Pressable onPress={onAction} style={styles.actionButton}>
        <Text style={styles.actionButtonText}>{actionLabel[notification.action] ?? 'Abrir'}</Text>
        <MaterialCommunityIcons color={colors.onPrimaryFixed} name="arrow-right" size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 7,
    height: 42,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 16
  },
  actionButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.26)',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15
  },
  cardCopy: {
    flex: 1
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12
  },
  cardText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 5
  },
  cardTitle: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 16,
    fontWeight: '900'
  },
  cardUnread: {
    borderColor: 'rgba(204, 193, 255, 0.38)'
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: 36
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.26)',
    borderRadius: 22,
    borderWidth: 1,
    padding: 28
  },
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center'
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  priorityIcon: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 46,
    justifyContent: 'center',
    width: 46
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  summary: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    padding: 16
  },
  summaryText: {
    color: colors.onSurfaceVariant,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  summaryValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '900'
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.95)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 42
  }
});
