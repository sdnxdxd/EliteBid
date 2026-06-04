import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors, radii } from '../theme';

export default function ErrorDialog({ message, onClose, title = 'Hubo un error', visible }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.dialog}>
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons color={colors.error} name="alert-circle-outline" size={30} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Pressable onPress={onClose} style={styles.button}>
            <Text style={styles.buttonText}>Entendido</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 5, 43, 0.76)',
    flex: 1,
    justifyContent: 'center',
    padding: 22
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 48,
    justifyContent: 'center',
    marginTop: 20,
    width: '100%'
  },
  buttonText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  dialog: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(255, 180, 171, 0.24)',
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 430,
    padding: 22,
    width: '100%'
  },
  iconBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.12)',
    borderRadius: radii.full,
    height: 60,
    justifyContent: 'center',
    marginBottom: 14,
    width: 60
  },
  message: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center'
  },
  title: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center'
  }
});
