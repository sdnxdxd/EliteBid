import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import VerificationPanel from '../components/VerificationPanel';
import { colors, radii, shadows } from '../theme';

export default function VerifyAccountScreen({ onContinueAsGuest, onVerified, user }) {
  const emailSent = user?.verificationEmailSent !== false;

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.surfaceLowest, colors.surface, colors.surfaceLow]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons color={colors.onPrimaryFixed} name="email-lock-outline" size={34} />
          </View>
          <Text style={styles.eyebrow}>Verificacion de email</Text>
          <Text style={styles.title}>
            {emailSent ? 'Te enviamos un codigo' : 'Codigo pendiente'}
          </Text>
          <Text style={styles.copy}>
            {emailSent
              ? 'Tu cuenta ya fue aceptada por la empresa. Ingresalo para verificar el email, crear tu contrasena y activar todas las funciones.'
              : 'No pudimos enviar el mail todavia. Revisa la configuracion SMTP o toca reenviar codigo.'}
          </Text>
          <View style={styles.mailPill}>
            <MaterialCommunityIcons color={colors.onPrimaryFixed} name="email-outline" size={16} />
            <Text style={styles.mailText}>{user.email}</Text>
          </View>
        </View>

        <VerificationPanel
          email={user.email}
          onVerified={onVerified}
        />

        <Pressable onPress={onContinueAsGuest} style={styles.guestButton}>
          <Text style={styles.guestButtonText}>Continuar como invitado</Text>
          <MaterialCommunityIcons color={colors.primary} name="arrow-right" size={18} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
    paddingVertical: 34
  },
  copy: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center'
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 16,
    textTransform: 'uppercase'
  },
  guestButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
    padding: 10
  },
  guestButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  hero: {
    alignItems: 'center',
    marginBottom: 18
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 68,
    justifyContent: 'center',
    width: 68,
    ...shadows.ambient
  },
  mailPill: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  mailText: {
    color: colors.onPrimaryFixed,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800'
  },
  title: {
    color: colors.onSurface,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 10,
    marginTop: 8,
    textAlign: 'center'
  }
});
