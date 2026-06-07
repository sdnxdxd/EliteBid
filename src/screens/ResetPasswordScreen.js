import React, { useMemo, useState } from 'react';
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

import { confirmPasswordReset, requestPasswordReset } from '../backend/authService';
import ErrorDialog from '../components/ErrorDialog';
import { colors, radii, shadows } from '../theme';
import { getPasswordStatus, isPasswordReady, passwordRuleCopy } from '../utils/passwordRules';

export default function ResetPasswordScreen({ onBack }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState('request');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState('');
  const passwordStatus = useMemo(() => getPasswordStatus(password, confirmPassword), [password, confirmPassword]);
  const canRequest = Boolean(email.trim());
  const canConfirm = Boolean(email.trim()) && code.trim().length === 6 && isPasswordReady(passwordStatus);

  async function requestCode() {
    setErrorDialog('');
    setMessage('');

    if (!email.trim()) {
      setErrorDialog('Ingresa el correo de tu cuenta para recibir el codigo.');
      return;
    }

    setLoading(true);

    try {
      const result = await requestPasswordReset(email);
      setStep('confirm');
      setMessage(
        result.resetEmailSent
          ? 'Te enviamos un codigo de recuperacion. Revisalo e ingresalo aca.'
          : 'Generamos el codigo, pero no pudimos enviar el mail. Revisa SMTP o intenta reenviar.'
      );
    } catch (resetError) {
      setErrorDialog(resetError.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmReset() {
    setErrorDialog('');
    setMessage('');

    if (!email.trim()) {
      setErrorDialog('Ingresa el correo de tu cuenta.');
      return;
    }
    if (code.trim().length !== 6) {
      setErrorDialog('Ingresa el codigo de 6 digitos que recibiste por mail.');
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
    if (!isPasswordReady(passwordStatus)) {
      setErrorDialog('Revisa los requisitos de la contrasena antes de actualizarla.');
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(email, code, password, confirmPassword);
      setMessage('Clave actualizada. Ya podes iniciar sesion con tu nueva clave.');
      setCode('');
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
          Primero te enviamos un codigo a tu correo. Despues lo ingresas aca para cambiar la clave.
        </Text>

        <Field
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          label="Correo"
          onChangeText={setEmail}
          placeholder="email@dominio.com"
          value={email}
        />

        {step === 'confirm' ? (
          <>
            <Field
              keyboardType="numeric"
              label="Codigo recibido"
              maxLength={6}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 digitos"
              value={code}
            />
            <Field
              label="Nueva contrasena"
              onChangeText={setPassword}
              placeholder="Ingresa tu nueva clave"
              rightAccessory={(
                <Pressable
                  accessibilityLabel={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  onPress={() => setShowPassword((current) => !current)}
                  style={styles.eyeButton}
                >
                  <MaterialCommunityIcons
                    color={colors.onSurfaceVariant}
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                  />
                </Pressable>
              )}
              secureTextEntry={!showPassword}
              value={password}
            />
            <Field
              label="Confirmar contrasena"
              onChangeText={setConfirmPassword}
              placeholder="Repite tu nueva clave"
              rightAccessory={(
                <Pressable
                  accessibilityLabel={showConfirmPassword ? 'Ocultar confirmacion' : 'Mostrar confirmacion'}
                  onPress={() => setShowConfirmPassword((current) => !current)}
                  style={styles.eyeButton}
                >
                  <MaterialCommunityIcons
                    color={colors.onSurfaceVariant}
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                  />
                </Pressable>
              )}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
            />

            <View style={styles.rules}>
              {passwordRuleCopy.map(([key, label]) => (
                <View key={key} style={styles.ruleRow}>
                  <MaterialCommunityIcons
                    color={passwordStatus[key] ? '#73E6A2' : colors.onSurfaceVariant}
                    name={passwordStatus[key] ? 'check-circle' : 'circle-outline'}
                    size={18}
                  />
                  <Text style={[styles.rule, passwordStatus[key] && styles.ruleValid]}>{label}</Text>
                </View>
              ))}
              {confirmPassword ? (
                <View style={styles.ruleRow}>
                  <MaterialCommunityIcons
                    color={passwordStatus.matches ? '#73E6A2' : colors.onSurfaceVariant}
                    name={passwordStatus.matches ? 'check-circle' : 'circle-outline'}
                    size={18}
                  />
                  <Text style={[styles.rule, passwordStatus.matches && styles.ruleValid]}>Las contrasenas coinciden</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          disabled={loading || (step === 'request' ? !canRequest : !canConfirm)}
          onPress={step === 'request' ? requestCode : confirmReset}
          style={[
            styles.primaryButton,
            (step === 'request' ? !canRequest : !canConfirm) && styles.primaryButtonDisabled
          ]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryContainer]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.primaryButtonFill}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimaryFixed} />
            ) : (
              <Text style={styles.primaryButtonText}>{step === 'request' ? 'Enviar codigo' : 'Actualizar clave'}</Text>
            )}
          </LinearGradient>
        </Pressable>

        {step === 'confirm' ? (
          <Pressable disabled={loading} onPress={requestCode} style={styles.secondaryButton}>
            <MaterialCommunityIcons color={colors.primary} name="email-sync-outline" size={18} />
            <Text style={styles.secondaryButtonText}>Reenviar codigo</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, rightAccessory, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, rightAccessory && styles.inputWrapWithAccessory]}>
        <TextInput
          placeholderTextColor="rgba(201, 196, 211, 0.55)"
          style={[styles.input, rightAccessory && styles.inputWithAccessory]}
          {...props}
        />
        {rightAccessory}
      </View>
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
  eyeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  input: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 15,
    height: '100%',
    paddingHorizontal: 16
  },
  inputWithAccessory: {
    paddingRight: 4
  },
  inputWrap: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.4)',
    borderRadius: radii.md,
    borderWidth: 1,
    height: 54
  },
  inputWrapWithAccessory: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: 4
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
  primaryButtonDisabled: {
    opacity: 0.5
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
  secondaryButton: {
    alignItems: 'center',
    borderColor: 'rgba(147, 143, 156, 0.35)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 50,
    justifyContent: 'center',
    marginTop: 12
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
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
