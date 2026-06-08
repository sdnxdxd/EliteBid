import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { completeVerification, resendVerificationEmail } from '../backend/authService';
import ErrorDialog from './ErrorDialog';
import { colors, radii } from '../theme';
import { getPasswordStatus, isPasswordReady, passwordRuleCopy } from '../utils/passwordRules';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const passwordStatus = useMemo(() => getPasswordStatus(form.password, form.confirmPassword), [form.password, form.confirmPassword]);
  const canSubmit = form.code.length === 6 && isPasswordReady(passwordStatus);

  function updateField(key, value) {
    const nextValue = key === 'code' ? value.replace(/\D/g, '').slice(0, 6) : value;
    setForm((current) => ({ ...current, [key]: nextValue }));
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
          : 'No pudimos reenviar el codigo. Revisa SMTP, app password o el puerto 465.'
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
    if (form.code.length !== 6) {
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
        value={form.password}
      />
      <View style={styles.passwordRules}>
        {passwordRuleCopy.map(([key, label]) => (
          <PasswordRule checked={passwordStatus[key]} key={key} label={label} />
        ))}
      </View>
      <Field
        label="Confirmar contrasena"
        onChangeText={(value) => updateField('confirmPassword', value)}
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
  eyeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
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
    color: colors.onSurface,
    flex: 1,
    fontSize: 14,
    height: '100%',
    paddingHorizontal: 14
  },
  inputWithAccessory: {
    paddingRight: 4
  },
  inputWrap: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.36)',
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 50
  },
  inputWrapWithAccessory: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingRight: 4
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
