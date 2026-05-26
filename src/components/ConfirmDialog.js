import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors, radii } from '../theme';

export default function ConfirmDialog({
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  icon = 'help-circle-outline',
  loading = false,
  message,
  onCancel,
  onConfirm,
  title,
  visible
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable
          disabled={loading}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.dialog}>
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons color={colors.primary} name={icon} size={28} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              disabled={loading}
              onPress={onCancel}
              style={[styles.secondaryButton, loading && styles.disabledButton]}
            >
              <Text style={styles.secondaryText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={onConfirm}
              style={[styles.primaryButton, loading && styles.disabledButton]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimaryFixed} />
              ) : (
                <Text numberOfLines={1} style={styles.primaryText}>
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%'
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 5, 43, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 22
  },
  dialog: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(204, 193, 255, 0.2)',
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 430,
    padding: 22,
    width: '100%'
  },
  disabledButton: {
    opacity: 0.62
  },
  iconBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(204, 193, 255, 0.12)',
    borderRadius: radii.full,
    height: 58,
    justifyContent: 'center',
    marginBottom: 14,
    width: 58
  },
  message: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center'
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flex: 1,
    height: 46,
    justifyContent: 'center'
  },
  primaryText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: 'rgba(204, 193, 255, 0.28)',
    borderRadius: radii.full,
    borderWidth: 1,
    flex: 1,
    height: 46,
    justifyContent: 'center'
  },
  secondaryText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  title: {
    color: colors.onSurface,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center'
  }
});
