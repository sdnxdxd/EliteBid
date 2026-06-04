import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { completeVerification, resendVerificationEmail } from '../backend/authService';
import ErrorDialog from './ErrorDialog';
import { colors, radii } from '../theme';

export default function VerificationPanel({
  compact = false,
  email,
  onMessage,
  onVerified,
  showHeader = true
}) {
  const [form, setForm] = useState({ code: '', password: '', confirmPassword: '' });
  const [resending, setResending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorDialog, setErrorDialog] = useState('');
  const passwordStatus = useMemo(() => getPasswordStatus(form.password, form.confirmPassword), [form.password, form.confirmPassword]);
  const canSubmit =
    form.code.replace(/\D/g, '').length === 6 &&
    passwordStatus.length &&
    passwordStatus.letter &&
    passwordStatus.number &&
    passwordStatus.symbol &&
    passwordStatus.noSpaces &&
    passwordStatus.matches;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setFeedback(nextMessage, nextError = '') {
    setMessage(nextMessage);
    setErrorDialog(nextError);
    onMessage?.(nextMessage || nextError);
  }

  async function resendCode() {
    setFeedback('');
    setResending(true);

    try {
      const result = await resendVerificationEmail(email);
      setFeedback(
        result.verificationEmailSent
          ? 'Te reenviamos el codigo de un solo uso.'
          : 'La cuenta sigue pendiente. No se pudo enviar el mail real.'
      );
    } catch (resendError) {
      setFeedback('', resendError.message);
    } finally {
      setResending(false);
    }
  }

  async function submitCode() {
    setFeedback('');

    if (!form.code.trim()) {
      setFeedback('', 'Ingresa el codigo de un solo uso que recibiste por mail.');
      return;
    }
    if (form.code.replace(/\D/g, '').length !== 6) {
      setFeedback('', 'El codigo debe tener 6 digitos.');
      return;
    }
    if (!form.password.trim()) {
      setFeedback('', 'Ingresa una nueva contrasena.');
      return;
    }
    if (!form.confirmPassword.trim()) {
      setFeedback('', 'Confirma tu nueva contrasena.');
      return;
    }
    if (!canSubmit) {
      setFeedback('', 'Revisa los requisitos de la contrasena antes de confirmar.');
      return;
    }

    setSubmitting(true);

    try {
      const user = await completeVerification({
        email,
        code: form.code,
        password: form.password,
        confirmPassword: form.confirmPassword
      });
      setForm({ code: '', password: '', confirmPassword: '' });
      setFeedback('Cuenta verificada. Ya podes agregar medios de pago y participar.');
      onVerified(user);
    } catch (verificationError) {
      setFeedback('', verificationError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <ErrorDialog
        message={errorDialog}
        onClose={() => setErrorDialog('')}
        visible={Boolean(errorDialog)}
      />
      {showHeader ? (
        <View style={styles.header}>
          <View style={styles.icon}>
            <MaterialCommunityIcons color={colors.onPrimaryFixed} name="shield-key-outline" size={22} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Cuenta pendiente</Text>
            <Text style={styles.text}>Revisa tu mail, ingresa el codigo de un solo uso y crea tu contrasena.</Text>
          </View>
        </View>
      ) : null}

      <Field
        keyboardType="numeric"
        label="Codigo de un solo uso"
        maxLength={6}
        onChangeText={(value) => updateField('code', value)}
        value={form.code}
      />
      <Field
        label="Nueva contrasena"
        onChangeText={(value) => updateField('password', value)}
        secureTextEntry
        value={form.password}
      />
      <View style={styles.passwordRules}>
        <PasswordRule checked={passwordStatus.length} label="Entre 8 y 72 caracteres" />
        <PasswordRule checked={passwordStatus.letter} label="Al menos una letra" />
        <PasswordRule checked={passwordStatus.number} label="Al menos un numero" />
        <PasswordRule checked={passwordStatus.symbol} label="Al menos un simbolo" />
        <PasswordRule checked={passwordStatus.noSpaces} label="Sin espacios" />
      </View>
      <Field
        label="Confirmar contrasena"
        onChangeText={(value) => updateField('confirmPassword', value)}
        secureTextEntry
        value={form.confirmPassword}
      />
      {form.confirmPassword ? <PasswordRule checked={passwordStatus.matches} label="Las contrasenas coinciden" /> : null}

      <View style={styles.actions}>
        <Pressable disabled={resending} onPress={resendCode} style={styles.secondaryButton}>
          {resending ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>Reenviar codigo</Text>}
        </Pressable>
        <Pressable
          disabled={submitting}
          onPress={submitCode}
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        >
          {submitting ? <ActivityIndicator color={colors.onPrimaryFixed} /> : <Text style={styles.primaryButtonText}>Confirmar</Text>}
        </Pressable>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="rgba(201, 196, 211, 0.55)" style={styles.input} {...props} />
    </View>
  );
}

function PasswordRule({ checked, label }) {
  return (
    <View style={styles.passwordRule}>
      <MaterialCommunityIcons
        color={checked ? '#73E6A2' : colors.onSurfaceVariant}
        name={checked ? 'check-circle' : 'circle-outline'}
        size={15}
      />
      <Text style={[styles.passwordRuleText, checked && styles.passwordRuleTextOk]}>{label}</Text>
    </View>
  );
}

function getPasswordStatus(password = '', confirmPassword = '') {
  return {
    length: password.length >= 8 && password.length <= 72,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
    noSpaces: password.length > 0 && !/\s/.test(password),
    matches: password.length > 0 && password === confirmPassword
  };
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2
  },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(204, 193, 255, 0.24)',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16
  },
  cardCompact: {
    marginBottom: 20
  },
  copy: {
    flex: 1
  },
  field: {
    marginBottom: 14
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.36)',
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.onSurface,
    fontSize: 14,
    minHeight: 50,
    paddingHorizontal: 14
  },
  label: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 7,
    textTransform: 'uppercase'
  },
  message: {
    color: '#73E6A2',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 12
  },
  passwordRule: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 22
  },
  passwordRules: {
    gap: 5,
    marginBottom: 14,
    marginTop: -6
  },
  passwordRuleText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700'
  },
  passwordRuleTextOk: {
    color: '#73E6A2'
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flex: 1,
    height: 48,
    justifyContent: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: 'rgba(147, 143, 156, 0.34)',
    borderRadius: radii.full,
    borderWidth: 1,
    flex: 1,
    height: 48,
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  text: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 3
  },
  title: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '900'
  }
});
