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
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { registerUser } from '../backend/authService';
import { colors, radii, shadows } from '../theme';

const initialForm = {
  firstName: '',
  lastName: '',
  documentNumber: '',
  documentFrontUri: '',
  documentBackUri: '',
  legalAddress: '',
  countryNumber: '32',
  email: '',
  password: '',
  confirmPassword: '',
  paymentType: 'tarjeta',
  paymentDetail: '',
  paymentCurrency: 'ARS',
  paymentAmount: ''
};

const countries = [
  { label: 'Argentina', value: '32' },
  { label: 'Espana', value: '724' },
  { label: 'Mexico', value: '484' },
  { label: 'Colombia', value: '170' },
  { label: 'Chile', value: '152' }
];

const paymentTypes = [
  { icon: 'credit-card-outline', label: 'Tarjeta', value: 'tarjeta' },
  { icon: 'bank-outline', label: 'Cuenta', value: 'cuenta' },
  { icon: 'file-document-outline', label: 'Cheque', value: 'cheque' }
];

export default function RegisterScreen({ onBack, onRegistered }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const progress = useMemo(() => (step === 1 ? '50%' : '100%'), [step]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function pickDocument(side) {
    setError('');

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError('Necesitamos permiso para seleccionar la foto del documento.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ['images'],
      quality: 0.75
    });

    if (result.canceled) {
      return;
    }

    updateField(side === 'frente' ? 'documentFrontUri' : 'documentBackUri', result.assets[0].uri);
  }

  function continueToCredentials() {
    setError('');
    const required = [
      ['firstName', 'Ingresa tu nombre.'],
      ['lastName', 'Ingresa tu apellido.'],
      ['documentNumber', 'Ingresa tu documento.'],
      ['documentFrontUri', 'Carga la foto del frente del documento.'],
      ['documentBackUri', 'Carga la foto del dorso del documento.'],
      ['legalAddress', 'Ingresa tu domicilio legal.'],
      ['countryNumber', 'Selecciona tu pais de origen.']
    ];

    for (const [key, message] of required) {
      if (!String(form[key] ?? '').trim()) {
        setError(message);
        return;
      }
    }

    setStep(2);
  }

  async function submit() {
    setError('');
    setLoading(true);

    try {
      const user = await registerUser(form);
      onRegistered(user);
    } catch (registrationError) {
      setError(registrationError.message);
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
        colors={[colors.surfaceLowest, colors.surface, colors.surfaceLow]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.topBar}>
        <Pressable onPress={step === 1 ? onBack : () => setStep(1)} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-left" size={26} />
        </Pressable>
        <Text style={styles.logo}>Registro</Text>
        <View style={styles.iconButtonGhost} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.progressBlock}>
          <Text style={styles.progressLabel}>PASO {step === 1 ? '01' : '02'} // 02</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progress }]} />
          </View>
        </View>

        {step === 1 ? (
          <PersonalStep form={form} pickDocument={pickDocument} updateField={updateField} />
        ) : (
          <CredentialsStep form={form} updateField={updateField} />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={loading}
          onPress={step === 1 ? continueToCredentials : submit}
          style={styles.primaryButton}
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
              <>
                <Text style={styles.primaryButtonText}>
                  {step === 1 ? 'Continuar' : 'Confirmar'}
                </Text>
                <MaterialCommunityIcons
                  color={colors.onPrimaryFixed}
                  name={step === 1 ? 'arrow-right' : 'check'}
                  size={21}
                />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PersonalStep({ form, pickDocument, updateField }) {
  return (
    <>
      <Text style={styles.title}>Datos personales</Text>
      <View style={styles.row}>
        <Field
          label="Nombre completo"
          onChangeText={(value) => updateField('firstName', value)}
          placeholder="Ej. Juan Carlos"
          value={form.firstName}
        />
        <Field
          label="Apellido"
          onChangeText={(value) => updateField('lastName', value)}
          placeholder="Ej. Perez"
          value={form.lastName}
        />
      </View>

      <Field
        keyboardType="numeric"
        label="Documento"
        onChangeText={(value) => updateField('documentNumber', value)}
        placeholder="DNI o pasaporte"
        value={form.documentNumber}
      />

      <View style={styles.documentSection}>
        <View>
          <Text style={styles.groupTitle}>Documento de identidad</Text>
          <Text style={styles.groupCopy}>Sube una foto clara del frente y dorso.</Text>
        </View>
        <View style={styles.documentRow}>
          <DocumentButton
            done={Boolean(form.documentFrontUri)}
            icon="badge-account-horizontal-outline"
            label="Frente"
            onPress={() => pickDocument('frente')}
          />
          <DocumentButton
            done={Boolean(form.documentBackUri)}
            icon="credit-card-outline"
            label="Dorso"
            onPress={() => pickDocument('dorso')}
          />
        </View>
      </View>

      <Field
        label="Domicilio legal"
        onChangeText={(value) => updateField('legalAddress', value)}
        placeholder="Calle, numero, ciudad"
        value={form.legalAddress}
      />

      <Text style={styles.label}>Pais de origen</Text>
      <View style={styles.segmentGrid}>
        {countries.map((country) => (
          <Chip
            active={form.countryNumber === country.value}
            key={country.value}
            label={country.label}
            onPress={() => updateField('countryNumber', country.value)}
          />
        ))}
      </View>
    </>
  );
}

function CredentialsStep({ form, updateField }) {
  return (
    <>
      <Text style={styles.title}>Crear clave</Text>
      <View style={styles.verifiedBox}>
        <MaterialCommunityIcons color={colors.primaryContainer} name="check-circle" size={26} />
        <Text style={styles.verifiedText}>
          Tu cuenta fue verificada. Crea tu clave y registra un medio de pago para pujar.
        </Text>
      </View>

      <Field
        autoCapitalize="none"
        keyboardType="email-address"
        label="Correo"
        onChangeText={(value) => updateField('email', value)}
        placeholder="tu@email.com"
        value={form.email}
      />
      <Field
        label="Nueva contrasena"
        onChangeText={(value) => updateField('password', value)}
        placeholder="Ingresa tu clave"
        secureTextEntry
        value={form.password}
      />
      <Field
        label="Confirmar contrasena"
        onChangeText={(value) => updateField('confirmPassword', value)}
        placeholder="Repite tu clave"
        secureTextEntry
        value={form.confirmPassword}
      />

      <View style={styles.rules}>
        <Text style={styles.rule}>Minimo 8 caracteres</Text>
        <Text style={styles.rule}>Al menos un numero</Text>
        <Text style={styles.rule}>Al menos un simbolo</Text>
      </View>

      <Text style={styles.groupTitle}>Medio de pago</Text>
      <View style={styles.paymentTypes}>
        {paymentTypes.map((type) => (
          <PaymentTypeButton
            active={form.paymentType === type.value}
            icon={type.icon}
            key={type.value}
            label={type.label}
            onPress={() => updateField('paymentType', type.value)}
          />
        ))}
      </View>
      <Field
        label="Detalle"
        onChangeText={(value) => updateField('paymentDetail', value)}
        placeholder="Visa terminada en 1234, CBU o cheque certificado"
        value={form.paymentDetail}
      />
      <View style={styles.row}>
        <Field
          keyboardType="numeric"
          label="Monto garantia"
          onChangeText={(value) => updateField('paymentAmount', value)}
          placeholder="500000"
          value={form.paymentAmount}
        />
        <View style={styles.field}>
          <Text style={styles.label}>Moneda</Text>
          <View style={styles.currencyRow}>
            <Chip
              active={form.paymentCurrency === 'ARS'}
              label="ARS"
              onPress={() => updateField('paymentCurrency', 'ARS')}
            />
            <Chip
              active={form.paymentCurrency === 'USD'}
              label="USD"
              onPress={() => updateField('paymentCurrency', 'USD')}
            />
          </View>
        </View>
      </View>
    </>
  );
}

function Field({ label, style, ...props }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="rgba(201, 196, 211, 0.55)"
        style={styles.input}
        {...props}
      />
    </View>
  );
}

function DocumentButton({ done, icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.documentButton, done && styles.documentDone]}>
      <MaterialCommunityIcons color={colors.primary} name={done ? 'check-circle' : icon} size={30} />
      <Text style={styles.documentLabel}>{label}</Text>
      <Text style={styles.documentAction}>{done ? 'Cargado' : 'Subir foto'}</Text>
    </Pressable>
  );
}

function Chip({ active, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PaymentTypeButton({ active, icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.paymentType, active && styles.paymentTypeActive]}>
      <MaterialCommunityIcons color={active ? colors.onPrimaryFixed : colors.primary} name={icon} size={22} />
      <Text style={[styles.paymentTypeText, active && styles.paymentTypeTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.34)',
    borderRadius: radii.full,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  chipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer
  },
  chipText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800'
  },
  chipTextActive: {
    color: colors.onPrimaryFixed
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 36
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 8
  },
  documentAction: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  documentButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderColor: 'rgba(72, 69, 81, 0.25)',
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 126,
    justifyContent: 'center',
    padding: 14
  },
  documentDone: {
    backgroundColor: colors.surfaceContainer
  },
  documentLabel: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '800'
  },
  documentRow: {
    flexDirection: 'row',
    gap: 12
  },
  documentSection: {
    gap: 14,
    marginBottom: 16
  },
  error: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 14
  },
  field: {
    flex: 1,
    marginBottom: 16
  },
  groupCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 3
  },
  groupTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  iconButtonGhost: {
    height: 44,
    width: 44
  },
  input: {
    backgroundColor: colors.surfaceHighest,
    borderBottomColor: 'rgba(147, 143, 156, 0.38)',
    borderBottomWidth: 1,
    borderRadius: radii.md,
    color: colors.onSurface,
    fontSize: 15,
    minHeight: 54,
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
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  paymentType: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.34)',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 72,
    justifyContent: 'center'
  },
  paymentTypeActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer
  },
  paymentTypeText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '800'
  },
  paymentTypeTextActive: {
    color: colors.onPrimaryFixed
  },
  paymentTypes: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  primaryButton: {
    borderRadius: radii.full,
    marginTop: 6,
    overflow: 'hidden',
    ...shadows.ambient
  },
  primaryButtonFill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    height: 58,
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  progressBlock: {
    gap: 9,
    marginBottom: 28
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    height: '100%'
  },
  progressLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900'
  },
  progressTrack: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.full,
    height: 5,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  rule: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 22
  },
  rules: {
    marginBottom: 22,
    marginTop: -4
  },
  segmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  title: {
    color: colors.onSurface,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 26
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.88)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 42,
    paddingBottom: 12
  },
  verifiedBox: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceContainer,
    borderRadius: 28,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 26,
    padding: 20
  },
  verifiedText: {
    color: colors.onSurfaceVariant,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 23
  }
});
