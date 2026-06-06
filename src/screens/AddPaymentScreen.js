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
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { addPaymentMethod } from '../backend/paymentService';
import ErrorDialog from '../components/ErrorDialog';
import { colors, radii, shadows } from '../theme';

const initialForm = {
  type: 'tarjeta',
  cardNumber: '',
  cardHolder: '',
  expiry: '',
  cvv: '',
  bank: '',
  accountType: '',
  cbu: '',
  alias: '',
  checkNumber: '',
  issueDate: '',
  checkImageUri: '',
  amount: ''
};

const tabs = [
  { label: 'Cuenta', value: 'cuenta' },
  { label: 'Tarjeta', value: 'tarjeta' },
  { label: 'Cheque', value: 'cheque' }
];

export default function AddPaymentScreen({ onBack, onSaved, user }) {
  const [form, setForm] = useState(initialForm);
  const [errorDialog, setErrorDialog] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeTab(type) {
    setErrorDialog('');
    setForm((current) => ({ ...current, type }));
  }

  async function pickCheckImage() {
    setErrorDialog('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorDialog('Necesitamos permiso para seleccionar la foto del cheque.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      base64: Platform.OS === 'web',
      mediaTypes: ['images'],
      quality: 0.75
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const checkImageUri =
        Platform.OS === 'web' && asset.base64
          ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;

      updateField('checkImageUri', checkImageUri);
    }
  }

  async function save() {
    setErrorDialog('');
    setLoading(true);

    try {
      const paymentCount = await addPaymentMethod(user.clienteId, form);
      onSaved({ ...user, paymentCount });
    } catch (saveError) {
      setErrorDialog(saveError.message);
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
      <ErrorDialog
        message={errorDialog}
        onClose={() => setErrorDialog('')}
        visible={Boolean(errorDialog)}
      />

      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-left" size={25} />
        </Pressable>
        <Text style={styles.logo}>Elite Bid</Text>
        <View style={styles.iconButtonGhost} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Metodo de Pago</Text>
        <Text style={styles.subtitle}>Configura tus opciones para participar en subastas.</Text>

        <View style={styles.tabs}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.value}
              onPress={() => changeTab(tab.value)}
              style={[styles.tab, form.type === tab.value && styles.tabActive]}
            >
              <Text style={[styles.tabText, form.type === tab.value && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {form.type === 'tarjeta' ? (
          <CardForm form={form} updateField={updateField} />
        ) : form.type === 'cuenta' ? (
          <BankForm form={form} updateField={updateField} />
        ) : (
          <CheckForm form={form} pickCheckImage={pickCheckImage} updateField={updateField} />
        )}

        <View style={styles.commonFields}>
          <Field
            keyboardType="numeric"
            label="Monto garantia en pesos argentinos"
            onChangeText={(value) => updateField('amount', value)}
            placeholder="500000"
            value={form.amount}
          />
          <View style={styles.currencyNotice}>
            <MaterialCommunityIcons color={colors.primary} name="cash-multiple" size={19} />
            <Text style={styles.currencyNoticeText}>Todas las operaciones se manejan en pesos argentinos.</Text>
          </View>
        </View>

        <Pressable disabled={loading} onPress={save} style={styles.primaryButton}>
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
                <Text style={styles.primaryButtonText}>{getSaveLabel(form.type)}</Text>
                <MaterialCommunityIcons
                  color={colors.onPrimaryFixed}
                  name={form.type === 'cheque' ? 'shield-check' : 'check-circle-outline'}
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

function CardForm({ form, updateField }) {
  return (
    <>
      <View style={styles.cardPreview}>
        <View style={styles.cardTopRow}>
          <MaterialCommunityIcons color={colors.primary} name="contactless-payment" size={30} />
          <Text style={styles.previewBrand}>Elite</Text>
        </View>
        <Text style={styles.previewNumber}>{maskCard(form.cardNumber)}</Text>
        <View style={styles.cardBottomRow}>
          <View>
            <Text style={styles.previewLabel}>Titular</Text>
            <Text style={styles.previewValue}>{form.cardHolder || 'Nombre del Titular'}</Text>
          </View>
          <View>
            <Text style={styles.previewLabel}>Vence</Text>
            <Text style={styles.previewValue}>{form.expiry || 'MM/AA'}</Text>
          </View>
        </View>
      </View>

      <Field
        keyboardType="numeric"
        label="Numero de tarjeta"
        maxLength={19}
        onChangeText={(value) => updateField('cardNumber', formatCardNumber(value))}
        placeholder="0000 0000 0000 0000"
        value={form.cardNumber}
      />
      <Field
        label="Nombre del titular"
        onChangeText={(value) => updateField('cardHolder', value)}
        placeholder="Como aparece en la tarjeta"
        value={form.cardHolder}
      />
      <View style={styles.row}>
        <Field
          keyboardType="numeric"
          label="Vencimiento"
          maxLength={5}
          onChangeText={(value) => updateField('expiry', formatExpiry(value))}
          placeholder="MM/AA"
          value={form.expiry}
        />
        <Field
          keyboardType="numeric"
          label="CVV"
          maxLength={4}
          onChangeText={(value) => updateField('cvv', onlyDigits(value).slice(0, 4))}
          placeholder="123"
          secureTextEntry
          value={form.cvv}
        />
      </View>
    </>
  );
}

function BankForm({ form, updateField }) {
  return (
    <View style={styles.formCard}>
      <Field
        label="Banco"
        onChangeText={(value) => updateField('bank', value)}
        placeholder="Ej. Santander"
        value={form.bank}
      />
      <Field
        label="Tipo de cuenta"
        onChangeText={(value) => updateField('accountType', value)}
        placeholder="Cuenta corriente / Caja de ahorro"
        value={form.accountType}
      />
      <Field
        keyboardType="numeric"
        label="CBU / CVU"
        maxLength={22}
        onChangeText={(value) => updateField('cbu', onlyDigits(value).slice(0, 22))}
        placeholder="22 digitos"
        value={form.cbu}
      />
      <Field
        autoCapitalize="characters"
        label="Alias"
        onChangeText={(value) => updateField('alias', value)}
        placeholder="JUAN.PEREZ.BANCO"
        value={form.alias}
      />
    </View>
  );
}

function CheckForm({ form, pickCheckImage, updateField }) {
  return (
    <View style={styles.formCard}>
      <Field
        label="Banco emisor"
        onChangeText={(value) => updateField('bank', value)}
        placeholder="Ej. Banco Nacional"
        value={form.bank}
      />
      <Field
        keyboardType="numeric"
        label="Numero de cheque"
        onChangeText={(value) => updateField('checkNumber', onlyDigits(value).slice(0, 20))}
        placeholder="0000 0000 0000"
        value={form.checkNumber}
      />
      <Field
        keyboardType="numeric"
        label="Fecha de emision del cheque"
        maxLength={10}
        onChangeText={(value) => updateField('issueDate', formatIssueDate(value))}
        placeholder="DD/MM/AAAA"
        value={form.issueDate}
      />
      <Text style={styles.fieldHint}>No puede ser posterior a la fecha actual.</Text>
      <Pressable onPress={pickCheckImage} style={styles.uploadBox}>
        <MaterialCommunityIcons color={colors.primary} name="camera-plus-outline" size={32} />
        <Text style={styles.uploadTitle}>
          {form.checkImageUri ? 'Cheque cargado' : 'Capturar o subir'}
        </Text>
        <Text style={styles.uploadCopy}>Foto clara del cheque certificado.</Text>
      </Pressable>
    </View>
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

function getSaveLabel(type) {
  if (type === 'cuenta') return 'Guardar cuenta';
  if (type === 'cheque') return 'Guardar cheque';
  return 'Guardar tarjeta';
}

function maskCard(value) {
  const digits = String(value).replace(/\D/g, '').padEnd(16, '*').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function onlyDigits(value) {
  return String(value).replace(/\D/g, '');
}

function formatCardNumber(value) {
  const digits = onlyDigits(value).slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = onlyDigits(value).slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatIssueDate(value) {
  const digits = onlyDigits(value).slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const styles = StyleSheet.create({
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  cardPreview: {
    backgroundColor: colors.surfaceHighest,
    borderColor: 'rgba(72, 69, 81, 0.28)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 24,
    marginBottom: 22,
    padding: 22,
    ...shadows.ambient
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  commonFields: {
    marginTop: 4
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 34
  },
  currencyNotice: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.28)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 16,
    padding: 13
  },
  currencyNoticeText: {
    color: colors.onSurfaceVariant,
    flex: 1,
    fontSize: 13,
    fontWeight: '800'
  },
  field: {
    flex: 1,
    marginBottom: 15
  },
  fieldHint: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 12,
    marginTop: -8
  },
  formCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.25)',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16
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
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.38)',
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.onSurface,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 15
  },
  label: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  previewBrand: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: '900'
  },
  previewLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  previewNumber: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0
  },
  previewValue: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4
  },
  primaryButton: {
    borderRadius: radii.full,
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
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 24
  },
  tab: {
    alignItems: 'center',
    borderRadius: radii.full,
    flex: 1,
    height: 42,
    justifyContent: 'center'
  },
  tabActive: {
    backgroundColor: colors.surfaceHighest
  },
  tabText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '800'
  },
  tabTextActive: {
    color: colors.primary
  },
  tabs: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 24,
    padding: 5
  },
  title: {
    color: colors.primary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 7
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.88)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 42
  },
  uploadBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.42)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    marginBottom: 8,
    padding: 22
  },
  uploadCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600'
  },
  uploadTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900'
  }
});
