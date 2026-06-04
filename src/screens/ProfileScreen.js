import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
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

import { getUserSummary } from '../backend/auctionService';
import { getUserProfile, updateProfilePhoto, updateUserProfile } from '../backend/profileService';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import VerificationPanel from '../components/VerificationPanel';
import { colors, radii, shadows } from '../theme';

export default function ProfileScreen({
  onBack,
  onGoHome,
  onNavigate,
  onOpenPayments,
  onOpenNotifications,
  onOpenPenalties,
  onSignOut,
  onUserUpdated,
  user
}) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    documento: '',
    legalAddress: ''
  });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categorySummary, setCategorySummary] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [data, summary] = await Promise.all([
        getUserProfile(user.clienteId),
        user.rol === 'invitado' ? Promise.resolve(null) : getUserSummary(user.clienteId)
      ]);

      if (!mounted) return;

      setProfile(data);
      setCategorySummary(summary);
      setForm({
        firstName: data?.identityFirstName ?? '',
        lastName: data?.identityLastName ?? '',
        email: data?.email ?? '',
        documento: data?.documento ?? '',
        legalAddress: data?.legalAddress ?? ''
      });
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile() {
    setError('');
    setMessage('');
    setSaving(true);

    try {
      const updated = await updateUserProfile(user.id, user.clienteId, form);
      const nextUser = { ...user, ...updated };
      const data = await getUserProfile(user.clienteId);

      setProfile(data);
      onUserUpdated(nextUser);
      setEditing(false);
      setMessage('Perfil actualizado correctamente.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePhoto() {
    setError('');
    setMessage('');
    setSavingPhoto(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError('Necesitamos permiso para seleccionar tu foto de perfil.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ['images'],
        quality: 0.45
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const photoUri = asset.base64
        ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;

      await updateProfilePhoto(user.clienteId, photoUri);
      const data = await getUserProfile(user.clienteId);
      setProfile(data);
      setMessage('Foto de perfil guardada.');
    } catch (photoError) {
      setError(photoError.message);
    } finally {
      setSavingPhoto(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const guest = user.rol === 'invitado';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.surfaceLowest, colors.surface, colors.surfaceLow]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="arrow-left" size={25} />
        </Pressable>
        <Text style={styles.logo}>Elite Bid</Text>
        <Pressable onPress={onOpenNotifications} style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="bell-outline" size={24} />
        </Pressable>
      </View>
      <CategoryModal
        onClose={() => setCategoryModalVisible(false)}
        summary={categorySummary}
        visible={categoryModalVisible}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.spotlight}>
          <Pressable onPress={changePhoto} style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {getDisplayPhotoUri(profile?.photoUri) ? (
                <Image source={{ uri: getDisplayPhotoUri(profile?.photoUri) }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials(profile?.fullName)}</Text>
              )}
            </View>
            <View style={styles.cameraBadge}>
              {savingPhoto ? (
                <ActivityIndicator color={colors.onPrimaryFixed} size="small" />
              ) : (
                <MaterialCommunityIcons color={colors.onPrimaryFixed} name="camera" size={17} />
              )}
            </View>
          </Pressable>
          <Text style={styles.name}>{profile?.fullName}</Text>
          <Pressable
            disabled={guest}
            onPress={() => setCategoryModalVisible(true)}
            style={[styles.badge, guest && styles.badgeDisabled]}
          >
            <MaterialCommunityIcons color={colors.primary} name="check-decagram" size={16} />
            <Text style={styles.badgeText}>{profile?.categoria ?? 'comun'}</Text>
            {!guest ? <MaterialCommunityIcons color={colors.primary} name="chevron-right" size={15} /> : null}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Stat value={profile?.auctionsAttended ?? 0} label="Asistidas" tone="primary" />
          <Stat value={profile?.auctionsWon ?? 0} label="Ganadas" tone="tertiary" />
          <Stat value={formatCompactMoney(profile?.invested ?? 0)} label="Invertido" tone="light" />
        </View>

        <View style={styles.quickActions}>
          <QuickAction icon="gavel" label="Mis Pujas" />
          <QuickAction
            disabled={guest}
            icon="credit-card-outline"
            label="Pagos"
            onPress={guest ? undefined : onOpenPayments}
          />
          <QuickAction icon="alert-circle-outline" label="Penalidades" onPress={onOpenPenalties} />
        </View>

        {guest ? (
          <VerificationPanel
            compact
            email={form.email}
            onVerified={onUserUpdated}
          />
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Datos de cuenta</Text>
          {!editing && !guest ? (
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.sectionAction}>Modificar</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.formCard}>
          <Field
            editable={false}
            label="Nombre"
            locked
            onChangeText={(value) => updateField('firstName', value)}
            value={form.firstName}
          />
          <Field
            editable={false}
            label="Apellido"
            locked
            onChangeText={(value) => updateField('lastName', value)}
            value={form.lastName}
          />
          <Field
            autoCapitalize="none"
            editable={editing}
            keyboardType="email-address"
            label="Correo"
            onChangeText={(value) => updateField('email', value)}
            value={form.email}
          />
          <Field
            editable={false}
            keyboardType="numeric"
            label="Documento"
            locked
            onChangeText={(value) => updateField('documento', value)}
            value={form.documento}
          />
          <Field
            editable={editing}
            label="Domicilio legal"
            onChangeText={(value) => updateField('legalAddress', value)}
            value={form.legalAddress}
          />
          <View style={styles.readOnlyRow}>
            <Text style={styles.readOnlyLabel}>Pais de origen</Text>
            <Text style={styles.readOnlyValue}>{profile?.countryName ?? 'Argentina'}</Text>
          </View>
          <View style={styles.readOnlyRow}>
            <Text style={styles.readOnlyLabel}>Medios de pago</Text>
            <Text style={styles.readOnlyValue}>{profile?.paymentCount ?? 0}</Text>
          </View>
          <Text style={styles.lockedCopy}>
            {guest
              ? 'Cuenta invitada: confirma el codigo de un solo uso para modificar datos, agregar pagos y participar.'
              : 'Nombre, apellido y documento estan bloqueados por verificacion de identidad.'}
          </Text>

          {!guest && error ? <Text style={styles.error}>{error}</Text> : null}
          {!guest && message ? <Text style={styles.message}>{message}</Text> : null}

          {editing ? (
            <View style={styles.editActions}>
              <Pressable
                onPress={() => {
                  setEditing(false);
                  setError('');
                  setMessage('');
                  setForm({
                    firstName: profile?.identityFirstName ?? '',
                    lastName: profile?.identityLastName ?? '',
                    email: profile?.email ?? '',
                    documento: profile?.documento ?? '',
                    legalAddress: profile?.legalAddress ?? ''
                  });
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={saving} onPress={saveProfile} style={styles.primaryButton}>
                {saving ? (
                  <ActivityIndicator color={colors.onPrimaryFixed} />
                ) : (
                  <Text style={styles.primaryButtonText}>Guardar</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>

        <Pressable onPress={onOpenPenalties} style={styles.penaltyCard}>
          <MaterialCommunityIcons color={colors.error} name="alert-circle-outline" size={30} />
          <View style={styles.penaltyCopy}>
            <View style={styles.penaltyRow}>
              <Text style={styles.penaltyTitle}>Penalidades</Text>
              <Text style={styles.penaltyAmount}>{formatMoney(profile?.activePenaltyAmount ?? 0)}</Text>
            </View>
            <Text style={styles.penaltyText}>
              {(profile?.activePenaltyCount ?? 0) > 0
                ? `${profile.activePenaltyCount} penalidad activa. Toca para ver el detalle.`
                : 'No tenes penalidades activas en este momento.'}
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={onSignOut} style={styles.logoutButton}>
          <View style={styles.logoutIcon}>
            <MaterialCommunityIcons color={colors.error} name="logout" size={26} />
          </View>
          <View style={styles.logoutCopy}>
            <Text style={styles.logoutTitle}>Cerrar Sesion</Text>
            <Text style={styles.logoutText}>Finalizar sesion en este dispositivo</Text>
          </View>
          <MaterialCommunityIcons color={colors.outline} name="chevron-right" size={24} />
        </Pressable>
      </ScrollView>

      <BottomNav activeTab="profile" onNavigate={onNavigate ?? ((tab) => tab === 'home' && onGoHome?.())} />
    </View>
  );
}

function Field({ editable, label, locked, ...props }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {locked ? (
          <View style={styles.lockedPill}>
            <MaterialCommunityIcons color={colors.primary} name="lock-outline" size={12} />
            <Text style={styles.lockedPillText}>Bloqueado</Text>
          </View>
        ) : null}
      </View>
      <TextInput
        editable={editable}
        placeholderTextColor="rgba(201, 196, 211, 0.55)"
        style={[styles.input, !editable && styles.inputDisabled]}
        {...props}
      />
    </View>
  );
}

function Stat({ label, tone, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, tone === 'tertiary' && styles.statTertiary]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ disabled, icon, label, onPress }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.quickAction, disabled && styles.quickActionDisabled]}>
      <View style={styles.quickIcon}>
        <MaterialCommunityIcons color={colors.primary} name={icon} size={24} />
      </View>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function CategoryModal({ onClose, summary, visible }) {
  const currentRule = summary?.categoryRequirements?.find((rule) => rule.category === summary.currentCategory);
  const nextRule = summary?.nextCategoryRequirement;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.categoryDialog}>
          <View style={styles.categoryDialogHeader}>
            <View>
              <Text style={styles.modalEyebrow}>Categoria actual</Text>
              <Text style={styles.modalTitle}>{currentRule?.label ?? summary?.currentCategory ?? 'Comun'}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <MaterialCommunityIcons color={colors.primary} name="close" size={22} />
            </Pressable>
          </View>
          <Text style={styles.modalCopy}>
            {currentRule?.description ?? 'La categoria define en que subastas podes participar.'}
          </Text>

          {nextRule ? (
            <>
              <View style={styles.nextCategoryBox}>
                <Text style={styles.nextCategoryLabel}>Proxima categoria</Text>
                <Text style={styles.nextCategoryTitle}>{nextRule.label}</Text>
                <Text style={styles.nextCategoryText}>{nextRule.description}</Text>
              </View>
              <View style={styles.progressList}>
                <CategoryProgress current={summary.totalBids} label="Pujas registradas" target={nextRule.minBids} />
                <CategoryProgress current={summary.totalWins} label="Subastas ganadas" target={nextRule.minWins} />
                <CategoryProgress current={summary.invested} format={formatMoney} label="Plata invertida" target={nextRule.minInvested} />
                <CategoryProgress current={summary.activePenaltyCount} inverted label="Penalidades activas" target={nextRule.maxActivePenalties} />
              </View>
            </>
          ) : (
            <View style={styles.nextCategoryBox}>
              <Text style={styles.nextCategoryLabel}>Categoria maxima</Text>
              <Text style={styles.nextCategoryTitle}>Platino</Text>
              <Text style={styles.nextCategoryText}>Ya estas en el rango mas alto disponible para participar.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function CategoryProgress({ current = 0, format = (value) => value, inverted = false, label, target }) {
  if (target == null) return null;

  const done = inverted ? current <= target : current >= target;
  const ratio = inverted ? (done ? 1 : 0) : Math.min(1, Number(current || 0) / Number(target || 1));

  return (
    <View style={styles.progressItem}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, done && styles.progressValueDone]}>
          {inverted ? `${current}/${target}` : `${format(current)} / ${format(target)}`}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%` }, done && styles.progressFillDone]} />
      </View>
    </View>
  );
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
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

function formatCompactMoney(value) {
  const amount = Number(value || 0);

  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }

  return `$${amount.toLocaleString('es-AR')}`;
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.primary,
    borderRadius: 48,
    borderWidth: 2,
    height: 96,
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    width: 96
  },
  avatarImage: {
    height: '100%',
    width: '100%'
  },
  avatarText: {
    color: colors.primary,
    fontSize: 30,
    fontWeight: '900'
  },
  avatarWrap: {
    marginBottom: 16,
    position: 'relative'
  },
  cameraBadge: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderColor: colors.surfaceContainer,
    borderRadius: radii.full,
    borderWidth: 3,
    bottom: 0,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 34
  },
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(65, 50, 89, 0.62)',
    borderColor: 'rgba(72, 69, 81, 0.3)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  badgeDisabled: {
    opacity: 0.72
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: bottomNavHeight + 34,
    paddingTop: 20
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  error: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10
  },
  field: {
    marginBottom: 14
  },
  formCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  iconButton: {
    alignItems: 'center',
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
  inputDisabled: {
    color: colors.onSurfaceVariant,
    opacity: 0.82
  },
  label: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7
  },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLowest,
    flex: 1,
    justifyContent: 'center'
  },
  lockedCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 12
  },
  lockedPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(204, 193, 255, 0.1)',
    borderColor: 'rgba(204, 193, 255, 0.18)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  lockedPillText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.26)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 10,
    padding: 16
  },
  logoutCopy: {
    flex: 1
  },
  logoutIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.11)',
    borderRadius: radii.full,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  logoutText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3
  },
  logoutTitle: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '900'
  },
  message: {
    color: '#73E6A2',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10
  },
  name: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0
  },
  penaltyAmount: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '900'
  },
  penaltyCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(49, 34, 73, 0.5)',
    borderColor: 'rgba(255, 180, 171, 0.18)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: 15
  },
  penaltyCopy: {
    flex: 1
  },
  penaltyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  penaltyText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 5
  },
  penaltyTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '900'
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flex: 1,
    height: 48,
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderColor: 'rgba(72, 69, 81, 0.2)',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 96,
    justifyContent: 'center',
    padding: 12
  },
  quickActionDisabled: {
    opacity: 0.45
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20
  },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.full,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  quickText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800'
  },
  readOnlyLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  readOnlyRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(72, 69, 81, 0.28)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13
  },
  readOnlyValue: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '800'
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
  sectionAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900'
  },
  spotlight: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.22)',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 24,
    ...shadows.ambient
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 22,
    flex: 1,
    justifyContent: 'center',
    minHeight: 78,
    padding: 10
  },
  statLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 5,
    textTransform: 'uppercase'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  statTertiary: {
    color: colors.tertiary
  },
  statValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900'
  },
  categoryDialog: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(204, 193, 255, 0.24)',
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 460,
    padding: 18,
    width: '100%'
  },
  categoryDialogHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 5, 43, 0.78)',
    flex: 1,
    justifyContent: 'center',
    padding: 18
  },
  modalClose: {
    alignItems: 'center',
    borderColor: 'rgba(204, 193, 255, 0.18)',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  modalCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 14
  },
  modalEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  modalTitle: {
    color: colors.onSurface,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 3,
    textTransform: 'capitalize'
  },
  nextCategoryBox: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.28)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14
  },
  nextCategoryLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  nextCategoryText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4
  },
  nextCategoryTitle: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3
  },
  progressFill: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: '100%'
  },
  progressFillDone: {
    backgroundColor: '#73E6A2'
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7
  },
  progressItem: {
    marginBottom: 12
  },
  progressLabel: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 12,
    fontWeight: '800'
  },
  progressList: {
    marginTop: 2
  },
  progressTrack: {
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    height: 8,
    overflow: 'hidden'
  },
  progressValue: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900'
  },
  progressValueDone: {
    color: '#73E6A2'
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
 
});
