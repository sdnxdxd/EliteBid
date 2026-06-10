import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { resendVerificationEmail } from '../backend/authService';
import ErrorDialog from '../components/ErrorDialog';
import { colors, radii, shadows } from '../theme';

export default function ResendVerificationScreen({ onBack }) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState('');

  async function submit() {
    setErrorDialog('');
    setMessage('');

    if (!identifier.trim()) {
      setErrorDialog('Ingresa el email o DNI de la cuenta invitada.');
      return;
    }

    setLoading(true);

    try {
      const result = await resendVerificationEmail(identifier);
      setMessage(
        result.verificationEmailSent
          ? `Enviamos un nuevo codigo de verificacion de email a ${result.email}.`
          : 'La cuenta fue validada, pero no pudimos enviar el mail. Revisa SMTP e intenta nuevamente.'
      );
    } catch (resendError) {
      setErrorDialog(resendError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <LinearGradient
        colors={[colors.surfaceLowest, colors.surface, colors.surfaceContainer]}
        style={StyleSheet.absoluteFill}
      />
      <ErrorDialog
        message={errorDialog}
        onClose={() => setErrorDialog('')}
        visible={Boolean(errorDialog)}
      />

      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-left" size={25} />
        </Pressable>
        <Text style={styles.logo}>Codigo de email</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.emblem}>
          <MaterialCommunityIcons color={colors.primary} name="email-sync-outline" size={42} />
        </View>
        <Text style={styles.title}>Verificar identidad</Text>
        <Text style={styles.subtitle}>
          Ingresa el email o DNI registrado. Si corresponde a un email pendiente, emitimos un nuevo codigo.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email o DNI</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setIdentifier}
            placeholder="email@dominio.com o DNI"
            placeholderTextColor="rgba(201, 196, 211, 0.55)"
            style={styles.input}
            value={identifier}
          />
        </View>

        {message ? (
          <View style={styles.successBox}>
            <MaterialCommunityIcons color="#73E6A2" name="check-circle" size={20} />
            <Text style={styles.message}>{message}</Text>
          </View>
        ) : null}

        <Pressable disabled={loading} onPress={submit} style={styles.primaryButton}>
          <LinearGradient
            colors={[colors.primary, colors.primaryContainer]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.primaryButtonFill}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimaryFixed} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Validar y reenviar</Text>
                <MaterialCommunityIcons color={colors.onPrimaryFixed} name="send" size={18} />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
    padding: 24
  },
  emblem: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(49, 34, 73, 0.72)',
    borderColor: 'rgba(72, 69, 81, 0.35)',
    borderRadius: 44,
    borderWidth: 1,
    height: 88,
    justifyContent: 'center',
    marginBottom: 24,
    width: 88,
    ...shadows.ambient
  },
  field: {
    marginBottom: 18
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.4)',
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.onSurface,
    fontSize: 15,
    height: 54,
    paddingHorizontal: 16
  },
  label: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  message: {
    color: '#73E6A2',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  primaryButton: {
    borderRadius: radii.full,
    overflow: 'hidden'
  },
  primaryButtonFill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    height: 56,
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 26,
    textAlign: 'center'
  },
  successBox: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(115, 230, 162, 0.1)',
    borderColor: 'rgba(115, 230, 162, 0.26)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    padding: 12
  },
  title: {
    color: colors.onSurface,
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center'
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.88)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 42
  }
});
