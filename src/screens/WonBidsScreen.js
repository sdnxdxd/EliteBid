import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getUserPurchases, savePurchaseDeliveryAddress, settlePurchase } from '../backend/auctionService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii } from '../theme';

export default function WonBidsScreen({ onBack, onNavigate, user }) {
  const [addresses, setAddresses] = useState({});
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [payingId, setPayingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    const rows = await getUserPurchases(user.clienteId);
    setPurchases(rows);
    setAddresses(
      Object.fromEntries(rows.map((purchase) => [purchase.id, purchase.deliveryAddress || '']))
    );
  }

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        const rows = await getUserPurchases(user.clienteId);
        if (mounted) {
          setPurchases(rows);
          setAddresses(Object.fromEntries(rows.map((purchase) => [purchase.id, purchase.deliveryAddress || ''])));
        }
      } catch (error) {
        if (mounted) setToast({ message: error.message, tone: 'danger' });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function updateAddress(bidId, value) {
    setAddresses((current) => ({ ...current, [bidId]: value }));
  }

  async function saveAddress(purchase) {
    const deliveryAddress = addresses[purchase.id]?.trim() || '';
    if (!deliveryAddress) {
      setToast({ message: 'Ingresa una direccion de entrega.', tone: 'danger' });
      return;
    }

    setSavingId(purchase.id);
    try {
      const rows = await savePurchaseDeliveryAddress(user.clienteId, purchase.id, deliveryAddress);
      setPurchases(rows);
      setAddresses(Object.fromEntries(rows.map((item) => [item.id, item.deliveryAddress || ''])));
      setToast({ message: 'Direccion de entrega guardada.', tone: 'success' });
    } catch (error) {
      setToast({ message: error.message, tone: 'danger' });
    } finally {
      setSavingId(null);
    }
  }

  async function confirmPayment(purchase) {
    setPayingId(purchase.id);
    try {
      const rows = await settlePurchase(user.clienteId, purchase.id);
      setPurchases(rows);
      setAddresses(Object.fromEntries(rows.map((item) => [item.id, item.deliveryAddress || ''])));
      setToast({ message: 'Pago confirmado. La compra quedo registrada.', tone: 'success' });
    } catch (error) {
      setToast({ message: error.message, tone: 'danger' });
      try {
        await load();
      } catch {
        // El mensaje principal es el error de pago; el usuario puede refrescar manualmente.
      }
    } finally {
      setPayingId(null);
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
        <Text style={styles.logo}>Mis Pujas</Text>
        <View style={styles.iconButton} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={refresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Pujas ganadas</Text>
            <Text style={styles.subtitle}>Carga la direccion de entrega de cada pieza adjudicada.</Text>
          </View>

          {purchases.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons color={colors.primary} name="gavel" size={42} />
              <Text style={styles.emptyTitle}>Sin pujas ganadas</Text>
              <Text style={styles.emptyCopy}>Cuando ganes una subasta finalizada, va a aparecer aca.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {purchases.map((purchase) => (
                <View key={purchase.id} style={styles.card}>
                  <Image source={{ uri: purchase.imageUrl }} style={styles.image} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={styles.cardMeta}>Subasta ganada</Text>
                        <Text numberOfLines={2} style={styles.cardTitle}>{purchase.title}</Text>
                      </View>
                      <View style={[styles.statusPill, purchase.paymentStatus === 'multa' && styles.statusDanger]}>
                        <Text style={styles.statusText}>{getPaymentStatusLabel(purchase)}</Text>
                      </View>
                    </View>

                    <View style={styles.amountGrid}>
                      <Amount label="Puja" value={formatMoney(purchase.amount)} />
                      <Amount label="Comision" value={formatMoney(purchase.commission)} />
                      <Amount label="Envio" value={formatMoney(purchase.shippingCost)} />
                    </View>
                    <Text style={styles.total}>Total a pagar {formatMoney(purchase.totalDue)}</Text>
                    <Pressable
                      disabled={payingId === purchase.id || purchase.paymentStatus === 'pagada'}
                      onPress={() => confirmPayment(purchase)}
                      style={[
                        styles.payButton,
                        purchase.paymentStatus === 'pagada' && styles.buttonDisabled
                      ]}
                    >
                      {payingId === purchase.id ? (
                        <ActivityIndicator color={colors.onPrimaryFixed} />
                      ) : (
                        <>
                          <Text style={styles.payButtonText}>
                            {purchase.paymentStatus === 'pagada' ? 'Pago confirmado' : 'Confirmar pago'}
                          </Text>
                          <MaterialCommunityIcons color={colors.onPrimaryFixed} name="cash-check" size={18} />
                        </>
                      )}
                    </Pressable>

                    <Text style={styles.fieldLabel}>Direccion de entrega</Text>
                    <TextInput
                      multiline
                      onChangeText={(value) => updateAddress(purchase.id, value)}
                      placeholder="Calle, numero, piso/depto, ciudad"
                      placeholderTextColor="rgba(201, 196, 211, 0.55)"
                      style={styles.input}
                      value={addresses[purchase.id] || ''}
                    />
                    <Pressable
                      disabled={savingId === purchase.id}
                      onPress={() => saveAddress(purchase)}
                      style={styles.saveButton}
                    >
                      {savingId === purchase.id ? (
                        <ActivityIndicator color={colors.onPrimaryFixed} />
                      ) : (
                        <>
                          <Text style={styles.saveButtonText}>Guardar entrega</Text>
                          <MaterialCommunityIcons color={colors.onPrimaryFixed} name="truck-delivery-outline" size={18} />
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <BottomNav activeTab="profile" onNavigate={onNavigate} />
      <AppToast
        bottom={bottomNavHeight + 12}
        message={toast?.message}
        onDone={() => setToast(null)}
        tone={toast?.tone}
        visible={Boolean(toast)}
      />
    </View>
  );
}

function getPaymentStatusLabel(purchase) {
  if (purchase.paymentStatus === 'pagada') return 'Pago confirmado';
  if (purchase.paymentStatus === 'multa') return 'Multa activa';
  return purchase.deliveryAddress ? 'Falta pago' : 'Falta pago y entrega';
}

function Amount({ label, value }) {
  return (
    <View style={styles.amountBox}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={styles.amountValue}>{value}</Text>
    </View>
  );
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

const styles = StyleSheet.create({
  amountBox: {
    flex: 1
  },
  amountGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14
  },
  amountLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  amountValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 3
  },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(204, 193, 255, 0.18)',
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden'
  },
  cardBody: {
    padding: 16
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  cardMeta: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 5,
    textTransform: 'uppercase'
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  buttonDisabled: {
    opacity: 0.55
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 18,
    paddingBottom: bottomNavHeight + 34
  },
  emptyCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center'
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(204, 193, 255, 0.18)',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 22
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12
  },
  fieldLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase'
  },
  header: {
    marginBottom: 18
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  image: {
    backgroundColor: colors.surfaceHighest,
    height: 156,
    width: '100%'
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.42)',
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.onSurface,
    fontSize: 14,
    minHeight: 76,
    padding: 12,
    textAlignVertical: 'top'
  },
  payButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    justifyContent: 'center',
    marginTop: 12
  },
  payButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  list: {
    gap: 16
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 8,
    height: 50,
    justifyContent: 'center',
    marginTop: 12
  },
  saveButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  statusPill: {
    backgroundColor: 'rgba(204, 193, 255, 0.12)',
    borderColor: 'rgba(204, 193, 255, 0.22)',
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  statusDanger: {
    backgroundColor: 'rgba(255, 180, 171, 0.14)',
    borderColor: 'rgba(255, 180, 171, 0.38)'
  },
  statusText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 8
  },
  title: {
    color: colors.onSurface,
    fontSize: 30,
    fontWeight: '900'
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 11, 49, 0.95)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 38
  },
  total: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 12
  }
});
