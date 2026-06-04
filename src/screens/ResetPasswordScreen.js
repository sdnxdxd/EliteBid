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

import { resetPassword } from '../backend/authService';
import ErrorDialog from '../components/ErrorDialog';
import { colors, radii, shadows } from '../theme';

export default function ResetPasswordScreen({ onBack }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState('');

  const rules = [
    { label: 'Minimo 8 caracteres', valid: password.length >= 8 },
    { label: 'Al menos un numero', valid: /\d/.test(password) },
    { label: 'Al menos un simbolo', valid: /[^A-Za-z0-9]/.test(password) }
  ];

  async function submit() {
    setErrorDialog('');
    setMessage('');

    if (!identifier.trim()) {
      setErrorDialog('Ingresa tu correo o numero de documento para recuperar la clave.');
      return;
    }
    if (!password.trim()) {
      setErrorDialog('Ingresa una nueva contrasena.');
      return;
    }
    if (!confirmPassword.trim()) {
      setErrorDialog('Confirma tu nueva contrasena.');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(identifier, password, confirmPassword);
      setMessage('Clave actualizada. Ya podes iniciar sesion con tu nueva clave.');
      setPassword('');
      setConfirmPassword('');
    } catch (resetError) {
      setErrorDialog(resetError.message);
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
        <Text style={styles.logo}>Recuperar clave</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.emblem}>
          <MaterialCommunityIcons color={colors.primary} name="lock-reset" size={42} />
        </View>
        <Text style={styles.title}>Crear nueva clave</Text>
        <Text style={styles.subtitle}>
          Validamos tu identidad con tu correo o numero de documento registrado.
        </Text>

        <Field
          autoCapitalize="none"
          label="Correo o documento"
          onChangeText={setIdentifier}
          placeholder="email@dominio.com o DNI"
          value={identifier}
        />
        <Field
          label="Nueva contrasena"
          onChangeText={setPassword}
          placeholder="Ingresa tu nueva clave"
          secureTextEntry
          value={password}
        />
        <Field
          label="Confirmar contrasena"
          onChangeText={setConfirmPassword}
          placeholder="Repite tu nueva clave"
          secureTextEntry
          value={confirmPassword}
        />

        <View style={styles.rules}>
          {rules.map((rule) => (
            <View key={rule.label} style={styles.ruleRow}>
              <MaterialCommunityIcons
                color={rule.valid ? '#73E6A2' : colors.error}
                name={rule.valid ? 'check-circle' : 'close-circle'}
                size={18}
              />
              <Text style={[styles.rule, rule.valid && styles.ruleValid]}>{rule.label}</Text>
            </View>
          ))}
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

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
              <Text style={styles.primaryButtonText}>Actualizar clave</Text>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="rgba(201, 196, 211, 0.55)"
        style={styles.input}
        {...props}
      />
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
    marginBottom: 16
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
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 14
  },
  primaryButton: {
    borderRadius: radii.full,
    overflow: 'hidden'
  },
  primaryButtonFill: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  rule: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700'
  },
  ruleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 24
  },
  ruleValid: {
    color: '#73E6A2'
  },
  rules: {
    marginBottom: 18,
    marginTop: -4
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 26,
    textAlign: 'center'
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
