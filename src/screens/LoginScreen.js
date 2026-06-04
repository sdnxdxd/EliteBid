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

import { login } from '../backend/authService';
import ErrorDialog from '../components/ErrorDialog';
import { colors, radii, shadows } from '../theme';

export default function LoginScreen({ onForgotPassword, onLogin, onRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorDialog, setErrorDialog] = useState('');

  async function handleLogin() {
    setErrorDialog('');

    if (!email.trim()) {
      setErrorDialog('Ingresa tu correo para iniciar sesion.');
      return;
    }
    if (!password.trim()) {
      setErrorDialog('Ingresa tu clave o codigo de verificacion.');
      return;
    }

    setLoading(true);

    try {
      const user = await login(email, password);
      onLogin(user);
    } catch (loginError) {
      setErrorDialog(loginError.message);
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandBlock}>
          <View style={styles.emblem}>
            <MaterialCommunityIcons color={colors.primary} name="diamond-stone" size={44} />
          </View>
          <Text style={styles.brand}>Elite Bid</Text>
          <Text style={styles.tagline}>Galeria nocturna de subastas premium</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Iniciar sesion</Text>
          <Text style={styles.panelCopy}>
            Ingresa con tu clave. Si tu cuenta esta pendiente, usa el codigo de un solo uso como clave.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="tu@email.com"
              placeholderTextColor="rgba(201, 196, 211, 0.55)"
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Clave o codigo</Text>
            <TextInput
              onChangeText={setPassword}
              placeholder="Clave o codigo de 6 digitos"
              placeholderTextColor="rgba(201, 196, 211, 0.55)"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          <Pressable onPress={onForgotPassword} style={styles.forgotButton}>
            <Text style={styles.forgotButtonText}>Olvide mi contrasena</Text>
          </Pressable>

          <Pressable disabled={loading} onPress={handleLogin} style={styles.primaryButton}>
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
                  <Text style={styles.primaryButtonText}>Ingresar</Text>
                  <MaterialCommunityIcons
                    color={colors.onPrimaryFixed}
                    name="arrow-right"
                    size={20}
                  />
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onRegister} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Registrarse</Text>
          </Pressable>

          <View style={styles.demoBox}>
            <Text style={styles.demoLabel}>Usuario de prueba</Text>
            <Text style={styles.demoText}>alejandro@elitebid.com / Elite1234</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.onSurface,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 18,
    textAlign: 'center'
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 34,
    marginTop: 32
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: 24
  },
  emblem: {
    alignItems: 'center',
    backgroundColor: 'rgba(49, 34, 73, 0.72)',
    borderColor: 'rgba(72, 69, 81, 0.35)',
    borderRadius: 48,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    width: 96,
    ...shadows.ambient
  },
  fieldGroup: {
    marginBottom: 16
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: -4,
    paddingVertical: 4
  },
  forgotButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
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
    fontWeight: '700',
    marginBottom: 8
  },
  panel: {
    backgroundColor: 'rgba(38, 24, 62, 0.92)',
    borderColor: 'rgba(72, 69, 81, 0.28)',
    borderRadius: 28,
    borderWidth: 1,
    padding: 22
  },
  panelCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24
  },
  panelTitle: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8
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
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: 'rgba(147, 143, 156, 0.35)',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    marginTop: 12
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  demoBox: {
    backgroundColor: 'rgba(49, 34, 73, 0.62)',
    borderRadius: radii.md,
    marginTop: 14,
    padding: 12
  },
  demoLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  demoText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '700'
  },
  tagline: {
    color: colors.onSurfaceVariant,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center'
  }
});
