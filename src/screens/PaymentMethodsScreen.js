import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { deletePaymentMethod, getPaymentMethods } from '../backend/paymentService';
import { colors, radii, shadows } from '../theme';

export default function PaymentMethodsScreen({ onAdd, onBack, onUserUpdated, user }) {
  const [methods, setMethods] = useState([]);
  const [methodToDelete, setMethodToDelete] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const selectedMethod = useMemo(
    () =>
      methods.find((method) => method.id === selectedMethodId) ??
      methods.find((method) => method.verified === 'si') ??
      methods[0],
    [methods, selectedMethodId]
  );

  async function load() {
    const rows = await getPaymentMethods(user.clienteId);
    setMethods(rows);
    setSelectedMethodId((currentId) => {
      if (rows.some((method) => method.id === currentId)) {
        return currentId;
      }

      return rows.find((method) => method.verified === 'si')?.id ?? rows[0]?.id ?? null;
    });
  }

  useEffect(() => {
    load();
  }, [user.clienteId]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function removePayment(paymentId) {
    setDeletingId(paymentId);

    try {
      const paymentCount = await deletePaymentMethod(user.clienteId, paymentId);
      onUserUpdated?.({ ...user, paymentCount });
      setMethodToDelete(null);
      setSuccessMessage('Metodo de pago eliminado correctamente.');
      await load();
    } finally {
      setDeletingId(null);
    }
  }

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
        <Pressable style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="account-circle-outline" size={25} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={refresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Medios de Pago</Text>
          <Text style={styles.subtitle}>Gestiona tus tarjetas y cuentas para pujar con fluidez.</Text>
        </View>

        <View style={styles.walletCard}>
          <View style={styles.walletIcon}>
            <MaterialCommunityIcons color={colors.primary} name="wallet-outline" size={30} />
          </View>
          <View style={styles.walletCopy}>
            <Text style={styles.walletTitle}>Billetera Elite</Text>
            <Text style={styles.walletSubtitle}>
              {selectedMethod ? getMethodSummary(selectedMethod) : 'Sin metodo seleccionado'}
            </Text>
          </View>
          <Text style={styles.walletAmount}>{formatMoney(selectedMethod?.amount ?? 0, selectedMethod?.currency)}</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tarjetas y Cuentas</Text>
          <Text style={styles.sectionAction}>{methods.length} activos</Text>
        </View>

        {methods.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons color={colors.primary} name="credit-card-plus-outline" size={42} />
            <Text style={styles.emptyTitle}>Agrega tu primer medio</Text>
            <Text style={styles.emptyCopy}>
              Necesitas al menos un medio de pago para poder pujar en subastas habilitadas.
            </Text>
            <Pressable onPress={onAdd} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>Agregar metodo</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.carousel}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {methods.map((method) => (
              <PaymentCard
                deleting={deletingId === method.id}
                key={method.id}
                method={method}
                onDelete={() => setMethodToDelete(method)}
                onSelect={() => setSelectedMethodId(method.id)}
                selected={selectedMethod?.id === method.id}
              />
            ))}
          </ScrollView>
        )}
      </ScrollView>

      <View style={styles.bottomActions}>
        <Pressable onPress={onAdd} style={styles.fab}>
          <LinearGradient
            colors={[colors.primary, colors.primaryContainer]}
            style={styles.fabFill}
          >
            <MaterialCommunityIcons color={colors.onPrimaryFixed} name="plus" size={30} />
          </LinearGradient>
        </Pressable>
      </View>

      <ConfirmDeleteModal
        deleting={Boolean(deletingId)}
        method={methodToDelete}
        onCancel={() => setMethodToDelete(null)}
        onConfirm={() => removePayment(methodToDelete.id)}
      />
      <SuccessModal message={successMessage} onClose={() => setSuccessMessage('')} />
    </View>
  );
}

function PaymentCard({ deleting, method, onDelete, onSelect, selected }) {
  const pending = method.verified !== 'si';
  const title = getMethodTitle(method);
  const mask = getMethodMask(method);

  return (
    <Pressable
      onPress={onSelect}
      style={[styles.paymentCard, pending && styles.paymentCardPending, selected && styles.paymentCardSelected]}
    >
      <View style={styles.paymentCardTop}>
        <View>
          <Text style={styles.paymentBrand}>{title}</Text>
          <Text style={styles.paymentKind}>{getKindLabel(method.type)}</Text>
        </View>
        <View style={[styles.statusChip, pending && styles.statusChipPending]}>
          <MaterialCommunityIcons
            color={pending ? colors.onSurfaceVariant : colors.tertiary}
            name={pending ? 'clock-outline' : 'check-circle-outline'}
            size={13}
          />
          <Text style={[styles.statusText, pending && styles.statusTextPending]}>
            {pending ? 'Pendiente' : 'Verificado'}
          </Text>
        </View>
      </View>

      <View style={styles.paymentCardBottom}>
        <Text style={styles.paymentMask}>{mask}</Text>
        <View style={styles.paymentFooter}>
          <Text style={styles.paymentAmount}>{formatMoney(method.amount, method.currency)}</Text>
          <Pressable disabled={deleting} onPress={onDelete} style={styles.deleteButton}>
            <MaterialCommunityIcons
              color={colors.error}
              name={deleting ? 'timer-sand' : 'trash-can-outline'}
              size={18}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function ConfirmDeleteModal({ deleting, method, onCancel, onConfirm }) {
  return (
    <Modal transparent animationType="fade" visible={Boolean(method)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconDanger}>
            <MaterialCommunityIcons color={colors.error} name="trash-can-outline" size={30} />
          </View>
          <Text style={styles.modalTitle}>Eliminar medio de pago</Text>
          <Text style={styles.modalCopy}>
            {method
              ? `Vas a eliminar ${getKindLabel(method.type)} ${getMethodMask(method)}. Esta accion no se puede deshacer.`
              : ''}
          </Text>
          <View style={styles.modalActions}>
            <Pressable disabled={deleting} onPress={onCancel} style={styles.modalSecondary}>
              <Text style={styles.modalSecondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable disabled={deleting} onPress={onConfirm} style={styles.modalDanger}>
              <Text style={styles.modalDangerText}>{deleting ? 'Eliminando...' : 'Eliminar'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SuccessModal({ message, onClose }) {
  return (
    <Modal transparent animationType="fade" visible={Boolean(message)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconSuccess}>
            <MaterialCommunityIcons color="#73E6A2" name="check-circle-outline" size={32} />
          </View>
          <Text style={styles.modalTitle}>Listo</Text>
          <Text style={styles.modalCopy}>{message}</Text>
          <Pressable onPress={onClose} style={styles.modalPrimary}>
            <Text style={styles.modalPrimaryText}>Aceptar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function getMethodTitle(method) {
  if (method.type === 'tarjeta') return method.parsedDetail.brand ?? 'Tarjeta';
  if (method.type === 'cuenta') return method.parsedDetail.bank ?? 'Cuenta bancaria';
  return method.parsedDetail.bank ?? 'Cheque certificado';
}

function getMethodMask(method) {
  if (method.type === 'tarjeta') return `**** ${method.parsedDetail.cardNumberLast4 ?? '0000'}`;
  if (method.type === 'cuenta') return `CBU **** ${method.parsedDetail.cbuLast4 ?? '0000'}`;
  return `Cheque **** ${method.parsedDetail.checkNumberLast4 ?? '0000'}`;
}

function getKindLabel(type) {
  if (type === 'tarjeta') return 'Tarjeta';
  if (type === 'cuenta') return 'Cuenta bancaria';
  return 'Validacion fisica';
}

function getMethodSummary(method) {
  return `${getKindLabel(method.type)} seleccionado - ${getMethodMask(method)}`;
}

function formatMoney(value, currency = 'ARS') {
  const prefix = currency === 'USD' ? 'USD' : '$';
  return `${prefix} ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

const styles = StyleSheet.create({
  bottomActions: {
    alignItems: 'center',
    bottom: 24,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'flex-end',
    left: 24,
    position: 'absolute',
    right: 24
  },
  carousel: {
    gap: 14,
    paddingBottom: 120,
    paddingRight: 24
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 24,
    paddingBottom: 150,
    paddingTop: 26
  },
  emptyCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center'
  },
  emptyButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 46,
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 22
  },
  emptyButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.26)',
    borderRadius: 24,
    borderWidth: 1,
    padding: 28
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12
  },
  fab: {
    borderRadius: radii.full,
    overflow: 'hidden',
    ...shadows.ambient
  },
  fabFill: {
    alignItems: 'center',
    height: 58,
    justifyContent: 'center',
    width: 58
  },
  header: {
    marginBottom: 22
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  modalCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.34)',
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    width: '86%'
  },
  modalCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 18,
    textAlign: 'center'
  },
  modalDanger: {
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: radii.full,
    flex: 1,
    height: 48,
    justifyContent: 'center'
  },
  modalDangerText: {
    color: colors.onError,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  modalIconDanger: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.12)',
    borderRadius: radii.full,
    height: 58,
    justifyContent: 'center',
    marginBottom: 14,
    width: 58
  },
  modalIconSuccess: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(115, 230, 162, 0.12)',
    borderRadius: radii.full,
    height: 58,
    justifyContent: 'center',
    marginBottom: 14,
    width: 58
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 5, 43, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  modalPrimary: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    height: 48,
    justifyContent: 'center'
  },
  modalPrimaryText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  modalSecondary: {
    alignItems: 'center',
    borderColor: 'rgba(147, 143, 156, 0.38)',
    borderRadius: radii.full,
    borderWidth: 1,
    flex: 1,
    height: 48,
    justifyContent: 'center'
  },
  modalSecondaryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  modalTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center'
  },
  paymentAmount: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800'
  },
  paymentBrand: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900'
  },
  paymentCard: {
    backgroundColor: colors.surfaceBright,
    borderColor: 'rgba(72, 69, 81, 0.28)',
    borderRadius: 24,
    borderWidth: 1,
    height: 176,
    justifyContent: 'space-between',
    padding: 20,
    width: 288,
    ...shadows.ambient
  },
  paymentCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2
  },
  paymentCardBottom: {
    gap: 6
  },
  paymentFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.12)',
    borderRadius: radii.full,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  paymentCardPending: {
    backgroundColor: colors.surfaceContainer
  },
  paymentCardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  paymentKind: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase'
  },
  paymentMask: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0
  },
  sectionAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800'
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 19,
    fontWeight: '900'
  },
  statusChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(49, 34, 73, 0.8)',
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  statusChipPending: {
    backgroundColor: colors.surfaceLowest
  },
  statusText: {
    color: colors.tertiary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  statusTextPending: {
    color: colors.onSurfaceVariant
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20
  },
  title: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8
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
  walletAmount: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 16
  },
  walletCard: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 30,
    padding: 20
  },
  walletCopy: {
    marginTop: 14
  },
  walletIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.full,
    height: 52,
    justifyContent: 'center',
    width: 52
  },
  walletSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
  },
  walletTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900'
  }
});
