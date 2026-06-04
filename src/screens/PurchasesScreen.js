import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

import { getUserLots, submitUserLot } from '../backend/lotService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import ErrorDialog from '../components/ErrorDialog';
import { colors, radii } from '../theme';

const initialForm = {
  title: '',
  lotKind: 'unico',
  itemType: '',
  quantity: '1',
  estimatedValue: '',
  composition: '',
  description: '',
  condition: '',
  history: '',
  legalOrigin: '',
  payoutBank: '',
  payoutAccountHolder: '',
  payoutReference: '',
  ownershipDeclaration: false,
  returnChargeAccepted: false
};

const statusCopy = {
  aceptado: {
    icon: 'check-decagram',
    label: 'Aceptado',
    tone: '#73E6A2'
  },
  a_confirmar: {
    icon: 'clipboard-check-outline',
    label: 'A confirmar',
    tone: colors.primary
  },
  en_inspeccion: {
    icon: 'magnify-scan',
    label: 'En inspeccion',
    tone: '#F4C56A'
  },
  pendiente: {
    icon: 'clock-outline',
    label: 'Pendiente',
    tone: colors.primary
  },
  rechazado: {
    icon: 'close-octagon',
    label: 'Rechazado',
    tone: colors.error
  }
};

export default function PurchasesScreen({ onBack, onNavigate, user }) {
  const [activeView, setActiveView] = useState('form');
  const [errorDialog, setErrorDialog] = useState('');
  const [form, setForm] = useState(initialForm);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoUris, setPhotoUris] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  async function loadLots() {
    setLoading(true);
    try {
      const rows = await getUserLots(user.clienteId);
      setLots(rows);
    } catch (error) {
      setErrorDialog(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        const rows = await getUserLots(user.clienteId);
        if (mounted) {
          setLots(rows);
        }
      } catch (error) {
        if (mounted) {
          setErrorDialog(error.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  const totals = useMemo(() => {
    const pending = lots.filter((lot) => lot.status === 'pendiente').length;
    const accepted = lots.filter((lot) => lot.status === 'aceptado').length;
    const review = lots.filter((lot) => lot.status === 'en_inspeccion' || lot.status === 'a_confirmar').length;

    return { accepted, pending, review };
  }, [lots]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function pickPhoto(source) {
    setErrorDialog('');

    if (photoUris.length >= 10) {
      setErrorDialog('Carga hasta 10 fotos por solicitud.');
      return;
    }

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorDialog(
        source === 'camera'
          ? 'Necesitamos permiso para usar la camara del dispositivo.'
          : 'Necesitamos permiso para seleccionar fotos del dispositivo.'
      );
      return;
    }

    const picker = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({
      allowsEditing: false,
      base64: Platform.OS === 'web',
      mediaTypes: ['images'],
      quality: Platform.OS === 'web' ? 0.35 : 0.7
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const uri =
      Platform.OS === 'web' && asset.base64
        ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;

    setPhotoUris((current) => [...current, uri]);
  }

  function removePhoto(index) {
    setPhotoUris((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function validateForm() {
    const required = [
      ['title', 'Ingresa el nombre de la venta.'],
      ['itemType', 'Ingresa el tipo de lote o categoria principal.'],
      ['quantity', 'Ingresa la cantidad de productos o piezas.'],
      ['description', 'Describe la venta que queres subastar.'],
      ['condition', 'Indica el estado de conservacion.'],
      ['history', 'Agrega la historia o datos relevantes del bien.'],
      ['legalOrigin', 'Indica como podes acreditar el origen licito.'],
      ['payoutBank', 'Ingresa el banco de la cuenta de cobro.'],
      ['payoutAccountHolder', 'Ingresa el titular de la cuenta de cobro.'],
      ['payoutReference', 'Ingresa CBU, CVU, IBAN o alias de cobro.']
    ];

    for (const [key, message] of required) {
      if (!String(form[key] ?? '').trim()) {
        return message;
      }
    }
    if (Number(form.quantity) < 1 || Number(form.quantity) > 999) {
      return 'Ingresa una cantidad de piezas valida.';
    }
    if (form.lotKind === 'variado' && !form.composition.trim()) {
      return 'Detalla que productos distintos componen el lote variado.';
    }
    if (photoUris.length < 6) {
      return 'Carga al menos 6 fotos del bien o lote.';
    }
    if (!form.ownershipDeclaration) {
      return 'Debes declarar que el bien te pertenece y no tiene impedimentos.';
    }
    if (!form.returnChargeAccepted) {
      return 'Debes aceptar la devolucion con cargo si la empresa no acepta el bien.';
    }

    return '';
  }

  async function submitLot() {
    const validationError = validateForm();
    if (validationError) {
      setErrorDialog(validationError);
      return;
    }

    setSubmitting(true);
    setErrorDialog('');

    try {
      const rows = await submitUserLot(user.clienteId, {
        ...form,
        photoUris
      });
      setLots(rows);
      setForm(initialForm);
      setPhotoUris([]);
      setActiveView('status');
      setToast({ message: 'Lote cargado. Quedo pendiente de habilitacion.', tone: 'success' });
    } catch (error) {
      setErrorDialog(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
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
        <Text style={styles.logo}>Mis ventas</Text>
        <View style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="package-variant-closed" size={24} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>Ventas para subastar</Text>
          <Text style={styles.subtitle}>
            Carga un producto unico o un lote variado, adjunta fotos y segui la revision.
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <SummaryBlock label="Pendientes" value={totals.pending} />
          <SummaryBlock label="Revision" value={totals.review} />
          <SummaryBlock label="Aceptados" value={totals.accepted} />
        </View>

        <View style={styles.switcher}>
          <ModeButton active={activeView === 'form'} icon="plus-box" label="Cargar" onPress={() => setActiveView('form')} />
          <ModeButton active={activeView === 'status'} icon="clipboard-list" label="Estado" onPress={() => setActiveView('status')} />
        </View>

        {activeView === 'form' ? (
          <LotForm
            form={form}
            onPickPhoto={pickPhoto}
            onRemovePhoto={removePhoto}
            onSubmit={submitLot}
            photoUris={photoUris}
            submitting={submitting}
            updateField={updateField}
          />
        ) : (
          <LotStatusList loading={loading} lots={lots} onRefresh={loadLots} />
        )}
      </ScrollView>

      <BottomNav activeTab="purchases" onNavigate={onNavigate} />
      <AppToast
        bottom={bottomNavHeight + 12}
        message={toast?.message}
        onDone={() => setToast(null)}
        tone={toast?.tone}
        visible={Boolean(toast)}
      />
    </KeyboardAvoidingView>
  );
}

function LotForm({ form, onPickPhoto, onRemovePhoto, onSubmit, photoUris, submitting, updateField }) {
  return (
    <View style={styles.form}>
      <SectionHeader icon="package-variant" title="Datos de la venta" />
      <Text style={styles.label}>Tipo de venta</Text>
      <View style={styles.kindSelector}>
        <LotKindButton
          active={form.lotKind === 'unico'}
          icon="package"
          label="Producto unico"
          onPress={() => updateField('lotKind', 'unico')}
        />
        <LotKindButton
          active={form.lotKind === 'variado'}
          icon="package-variant-closed-plus"
          label="Lote variado"
          onPress={() => updateField('lotKind', 'variado')}
        />
      </View>
      <Field label="Nombre de la venta" onChangeText={(value) => updateField('title', value)} value={form.title} />
      <Field label="Categoria principal" onChangeText={(value) => updateField('itemType', value)} value={form.itemType} />
      <Field
        keyboardType="numeric"
        label="Cantidad de productos o piezas"
        onChangeText={(value) => updateField('quantity', value)}
        value={form.quantity}
      />
      <Field
        keyboardType="numeric"
        label="Valor estimado"
        onChangeText={(value) => updateField('estimatedValue', value)}
        placeholder="Opcional"
        value={form.estimatedValue}
      />
      <Field
        label={form.lotKind === 'variado' ? 'Productos incluidos' : 'Piezas o accesorios incluidos'}
        multiline
        onChangeText={(value) => updateField('composition', value)}
        placeholder={
          form.lotKind === 'variado'
            ? 'Ej. reloj de bolsillo, caja musical, dos bandejas de plata y seis copas.'
            : 'Ej. estuche original, certificado, repuestos o piezas del mismo conjunto.'
        }
        value={form.composition}
      />
      <Field
        label="Descripcion general"
        multiline
        onChangeText={(value) => updateField('description', value)}
        placeholder="Materiales, medidas, marcas, autores, detalles distintivos o contexto de la venta."
        value={form.description}
      />
      <Field
        label="Estado de conservacion"
        multiline
        onChangeText={(value) => updateField('condition', value)}
        placeholder="Detalle desgaste, restauraciones o faltantes."
        value={form.condition}
      />

      <SectionHeader icon="file-document-edit" title="Origen e historia" />
      <Field
        label="Historia o datos de interes"
        multiline
        onChangeText={(value) => updateField('history', value)}
        placeholder="Procedencia, duenios anteriores, contexto o curiosidades."
        value={form.history}
      />
      <Field
        label="Origen licito"
        multiline
        onChangeText={(value) => updateField('legalOrigin', value)}
        placeholder="Factura, sucesion, donacion, compra anterior u otra prueba disponible."
        value={form.legalOrigin}
      />

      <SectionHeader icon="camera-plus" title={`Fotos de la venta (${photoUris.length}/6 minimo)`} />
      <Text style={styles.sectionHint}>
        Inclui vistas generales y detalles de cada producto distinto del lote.
      </Text>
      <View style={styles.photoActions}>
        <Pressable onPress={() => onPickPhoto('camera')} style={styles.secondaryButton}>
          <MaterialCommunityIcons color={colors.onPrimaryFixed} name="camera" size={18} />
          <Text style={styles.secondaryButtonText}>Camara</Text>
        </Pressable>
        <Pressable onPress={() => onPickPhoto('library')} style={styles.secondaryButton}>
          <MaterialCommunityIcons color={colors.onPrimaryFixed} name="image-plus" size={18} />
          <Text style={styles.secondaryButtonText}>Galeria</Text>
        </Pressable>
      </View>
      <View style={styles.photoGrid}>
        {photoUris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={styles.photoTile}>
            <Image source={{ uri }} style={styles.photo} />
            <Pressable onPress={() => onRemovePhoto(index)} style={styles.removePhoto}>
              <MaterialCommunityIcons color={colors.onSurface} name="close" size={15} />
            </Pressable>
          </View>
        ))}
        {Array.from({ length: Math.max(0, 6 - photoUris.length) }).map((_, index) => (
          <View key={`empty-${index}`} style={styles.photoPlaceholder}>
            <MaterialCommunityIcons color={colors.onSurfaceVariant} name="image-outline" size={22} />
            <Text style={styles.photoPlaceholderText}>Foto {photoUris.length + index + 1}</Text>
          </View>
        ))}
      </View>

      <SectionHeader icon="bank" title="Cuenta de cobro" />
      <Field label="Titular" onChangeText={(value) => updateField('payoutAccountHolder', value)} value={form.payoutAccountHolder} />
      <Field label="Banco" onChangeText={(value) => updateField('payoutBank', value)} value={form.payoutBank} />
      <Field
        autoCapitalize="characters"
        label="CBU, CVU, IBAN o alias"
        onChangeText={(value) => updateField('payoutReference', value)}
        value={form.payoutReference}
      />

      <SectionHeader icon="shield-check" title="Declaraciones" />
      <CheckRow
        checked={form.ownershipDeclaration}
        label="Declaro que el bien me pertenece y no posee impedimentos para ser vendido."
        onPress={() => updateField('ownershipDeclaration', !form.ownershipDeclaration)}
      />
      <CheckRow
        checked={form.returnChargeAccepted}
        label="Acepto que, si la empresa no acepta el bien enviado, la devolucion queda a mi cargo."
        onPress={() => updateField('returnChargeAccepted', !form.returnChargeAccepted)}
      />

      <Pressable disabled={submitting} onPress={onSubmit} style={[styles.primaryButton, submitting && styles.disabled]}>
        <LinearGradient
          colors={[colors.primary, colors.primaryContainer]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.primaryButtonFill}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimaryFixed} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Enviar a revision</Text>
              <MaterialCommunityIcons color={colors.onPrimaryFixed} name="send-check" size={20} />
            </>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function LotStatusList({ loading, lots, onRefresh }) {
  if (loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }

  if (!lots.length) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons color={colors.primary} name="package-variant-closed" size={44} />
        <Text style={styles.emptyTitle}>Todavia no cargaste ventas</Text>
        <Text style={styles.emptyText}>
          Cuando envies un producto o lote a revision, vas a ver aca si esta pendiente, en inspeccion o aceptado.
        </Text>
        <Pressable onPress={onRefresh} style={styles.emptyButton}>
          <Text style={styles.emptyButtonText}>Actualizar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {lots.map((lot) => (
        <LotCard key={lot.id} lot={lot} />
      ))}
    </View>
  );
}

function LotCard({ lot }) {
  const status = statusCopy[lot.status] || statusCopy.pendiente;
  const photoUri = getDisplayPhotoUri(lot.photoUris?.[0]);

  return (
    <View style={styles.lotCard}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.lotImage} />
      ) : (
        <View style={[styles.lotImage, styles.lotImageFallback]}>
          <MaterialCommunityIcons color={colors.primary} name="image-off-outline" size={30} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { borderColor: `${status.tone}44` }]}>
            <MaterialCommunityIcons color={status.tone} name={status.icon} size={15} />
            <Text style={[styles.statusText, { color: status.tone }]}>{status.label}</Text>
          </View>
          <Text style={styles.photoCount}>{lot.photoUris?.length || 0} fotos</Text>
        </View>
        <Text numberOfLines={2} style={styles.cardTitle}>{lot.title}</Text>
        <Text style={styles.cardMeta}>
          {lot.lotKind === 'variado' ? 'Lote variado' : 'Producto unico'} / {lot.quantity} producto{Number(lot.quantity) === 1 ? '' : 's'}
        </Text>
        {lot.composition ? (
          <Text numberOfLines={2} style={styles.cardComposition}>{lot.composition}</Text>
        ) : null}
        <Text numberOfLines={3} style={styles.cardDescription}>{lot.description}</Text>
        <StatusDetail lot={lot} />
      </View>
    </View>
  );
}

function getDisplayPhotoUri(uri) {
  if (!uri) {
    return '';
  }
  if (Platform.OS === 'web' && /^file:\/\//i.test(uri)) {
    return '';
  }
  return uri;
}

function StatusDetail({ lot }) {
  if (lot.status === 'rechazado') {
    return <Text style={styles.statusDetail}>{lot.rejectionReason || 'La empresa informara el motivo del rechazo.'}</Text>;
  }

  if (lot.status === 'aceptado') {
    return (
      <Text style={styles.statusDetail}>
        Base: {formatMoney(lot.basePrice)} / Comision: {formatMoney(lot.commission)}
      </Text>
    );
  }

  if (lot.status === 'en_inspeccion') {
    return <Text style={styles.statusDetail}>La empresa esta revisando el bien y su documentacion.</Text>;
  }

  return <Text style={styles.statusDetail}>Quedo pendiente de habilitacion para una futura subasta.</Text>;
}

function Field({ label, multiline, style, ...props }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.onSurfaceVariant}
        style={[styles.input, multiline && styles.inputMultiline]}
        textAlignVertical={multiline ? 'top' : 'center'}
        multiline={multiline}
        {...props}
      />
    </View>
  );
}

function CheckRow({ checked, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.checkRow}>
      <MaterialCommunityIcons
        color={checked ? colors.primary : colors.onSurfaceVariant}
        name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
        size={24}
      />
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

function ModeButton({ active, icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}>
      <MaterialCommunityIcons color={active ? colors.onPrimaryFixed : colors.onSurfaceVariant} name={icon} size={18} />
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LotKindButton({ active, icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.kindButton, active && styles.kindButtonActive]}>
      <MaterialCommunityIcons color={active ? colors.onPrimaryFixed : colors.primary} name={icon} size={20} />
      <Text style={[styles.kindButtonText, active && styles.kindButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons color={colors.primary} name={icon} size={19} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SummaryBlock({ label, value }) {
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `$ ${amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

const styles = StyleSheet.create({
  cardBody: {
    flex: 1,
    minWidth: 0,
    padding: 13
  },
  cardDescription: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 8
  },
  cardComposition: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 8
  },
  cardMeta: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5,
    textTransform: 'uppercase'
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 10
  },
  checkRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(147, 143, 156, 0.22)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    padding: 13
  },
  checkText: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: bottomNavHeight + 34,
    paddingTop: 18
  },
  disabled: {
    opacity: 0.62
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 16,
    padding: 26
  },
  emptyButton: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  emptyButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center'
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center'
  },
  field: {
    flex: 1,
    marginBottom: 18,
    minWidth: 0
  },
  form: {
    gap: 6
  },
  hero: {
    marginBottom: 16,
    paddingHorizontal: 2
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  input: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(147, 143, 156, 0.22)',
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  inputMultiline: {
    minHeight: 128
  },
  kindButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(147, 143, 156, 0.28)',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 10
  },
  kindButtonActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer
  },
  kindButtonText: {
    color: colors.onSurface,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase'
  },
  kindButtonTextActive: {
    color: colors.onPrimaryFixed
  },
  kindSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18
  },
  label: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 9,
    textTransform: 'uppercase'
  },
  list: {
    gap: 12
  },
  loader: {
    marginTop: 40
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  lotCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(147, 143, 156, 0.18)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden'
  },
  lotImage: {
    backgroundColor: colors.surfaceHighest,
    height: 164,
    width: 108
  },
  lotImageFallback: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  modeButton: {
    alignItems: 'center',
    borderColor: 'rgba(147, 143, 156, 0.28)',
    borderRadius: radii.full,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 42,
    justifyContent: 'center'
  },
  modeButtonActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer
  },
  modeText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  modeTextActive: {
    color: colors.onPrimaryFixed
  },
  photo: {
    height: '100%',
    width: '100%'
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16
  },
  photoCount: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14
  },
  photoPlaceholderText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'uppercase'
  },
  photoPlaceholder: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(147, 143, 156, 0.22)',
    borderRadius: radii.sm,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 148,
    width: '48%'
  },
  photoTile: {
    aspectRatio: 1,
    borderRadius: radii.sm,
    overflow: 'hidden',
    position: 'relative',
    width: '48%'
  },
  primaryButton: {
    borderRadius: radii.full,
    marginTop: 14,
    overflow: 'hidden'
  },
  primaryButtonFill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    height: 56,
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  removePhoto: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 48,
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    marginTop: 24
  },
  sectionHint: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 14,
    marginTop: -6
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '900'
  },
  statusChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  statusDetail: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 10
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 6
  },
  summaryBlock: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 66,
    paddingHorizontal: 8
  },
  summaryLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase'
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  summaryValue: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900'
  },
  switcher: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  title: {
    color: colors.onSurface,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.95)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 42
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 10
  }
});
