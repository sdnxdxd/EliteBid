import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getUserPurchases, settlePurchase } from '../backend/auctionService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import ConfirmDialog from '../components/ConfirmDialog';
import { colors, radii } from '../theme';

const filters = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendiente', label: 'Ganadas' },
  { key: 'pagada', label: 'Pagadas' }
];

export default function PurchasesScreen({ onBack, onNavigate, user }) {
  const [purchases, setPurchases] = useState([]);
  const [filter, setFilter] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [settlingId, setSettlingId] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    const rows = await getUserPurchases(user.clienteId);

    setPurchases(rows);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function run() {
      const rows = await getUserPurchases(user.clienteId);

      if (mounted) {
        setPurchases(rows);
        setLoading(false);
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  const totals = useMemo(() => {
    const paid = purchases.filter((purchase) => purchase.paymentStatus === 'pagada');
    const pending = purchases.filter((purchase) => purchase.paymentStatus !== 'pagada');

    return {
      paid: paid.length,
      pending: pending.length,
      totalPaid: paid.reduce((total, purchase) => total + Number(purchase.amount || 0), 0)
    };
  }, [purchases]);

  const visiblePurchases = useMemo(() => {
    if (filter === 'todas') {
      return purchases;
    }

    return purchases.filter((purchase) => purchase.paymentStatus === filter);
  }, [filter, purchases]);

  async function confirmPayment() {
    if (!pendingPayment) {
      return;
    }

    setSettlingId(pendingPayment.id);

    try {
      const rows = await settlePurchase(user.clienteId, pendingPayment.id);
      setPurchases(rows);
      setToast({ message: 'Compra pagada y registrada.', tone: 'success' });
      setPendingPayment(null);
    } catch (paymentError) {
      setToast({ message: paymentError.message, tone: 'danger' });
    } finally {
      setSettlingId(null);
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
        <Text style={styles.logo}>Compras</Text>
        <View style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="shopping" size={24} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>Mis compras</Text>
          <Text style={styles.subtitle}>
            Separa pujas ganadoras pendientes de las compras ya pagadas.
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <SummaryBlock label="Ganadas" value={totals.pending} />
          <SummaryBlock label="Pagadas" value={totals.paid} />
          <SummaryBlock label="Liquidado" value={formatCompactMoney(totals.totalPaid)} />
        </View>

        <View style={styles.filters}>
          {filters.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.filter, filter === item.key && styles.filterActive]}
            >
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : visiblePurchases.length ? (
          <View style={styles.list}>
            {visiblePurchases.map((purchase) => (
              <PurchaseCard
                key={purchase.id}
                onConfirmPayment={setPendingPayment}
                purchase={purchase}
                settling={settlingId === purchase.id}
              />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons color={colors.primary} name="shopping-outline" size={44} />
            <Text style={styles.emptyTitle}>No hay compras en este estado</Text>
            <Text style={styles.emptyText}>
              Cuando ganes o liquides una puja, la vas a ver aca con su estado.
            </Text>
            <Pressable onPress={load} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>Actualizar</Text>
            </Pressable>
          </View>
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
      <ConfirmDialog
        confirmLabel="Confirmar pago"
        icon="cash-check"
        loading={Boolean(pendingPayment && settlingId === pendingPayment.id)}
        message={
          pendingPayment
            ? `Vas a registrar el pago de ${formatMoney(pendingPayment.amount)} para ${pendingPayment.title}.`
            : ''
        }
        onCancel={() => setPendingPayment(null)}
        onConfirm={confirmPayment}
        title="Confirmar pago"
        visible={Boolean(pendingPayment)}
      />
    </View>
  );
}

function PurchaseCard({ onConfirmPayment, purchase, settling }) {
  const paid = purchase.paymentStatus === 'pagada';

  return (
    <View style={[styles.purchaseCard, paid && styles.purchaseCardPaid]}>
      <Image source={{ uri: purchase.imageUrl }} style={styles.image} />
      <View style={styles.cardCopy}>
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, paid && styles.statusChipPaid]}>
            <MaterialCommunityIcons
              color={paid ? '#73E6A2' : colors.error}
              name={paid ? 'check-decagram' : 'gavel'}
              size={14}
            />
            <Text style={[styles.status, paid && styles.statusPaid]}>
              {paid ? 'Compra pagada' : 'Puja ganadora'}
            </Text>
          </View>
          <Text style={styles.receipt}>{paid ? `Recibo #${purchase.receiptId}` : 'Pendiente'}</Text>
        </View>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {purchase.title}
        </Text>
        <Text style={styles.price}>{formatMoney(purchase.amount)}</Text>
        <Text style={styles.hint}>
          {paid
            ? 'Pago confirmado y registrado en el historial de subasta.'
            : 'Confirma el pago para mover esta adjudicacion a compras pagadas.'}
        </Text>
        {!paid ? (
          <Pressable
            disabled={settling}
            onPress={() => onConfirmPayment?.(purchase)}
            style={[styles.payButton, settling && styles.payButtonDisabled]}
          >
            {settling ? (
              <ActivityIndicator color={colors.onPrimaryFixed} />
            ) : (
              <>
                <MaterialCommunityIcons color={colors.onPrimaryFixed} name="cash-check" size={18} />
                <Text style={styles.payButtonText}>Confirmar pago</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SummaryBlock({ label, value }) {
  return (
    <View style={styles.summaryBlock}>
      <Text numberOfLines={1} style={styles.summaryValue}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

function formatCompactMoney(value) {
  const amount = Number(value || 0);

  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }

  return `$${amount.toLocaleString('es-AR')}`;
}

const styles = StyleSheet.create({
  cardCopy: {
    flex: 1,
    minWidth: 0,
    padding: 14
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
    marginTop: 9
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
  filter: {
    alignItems: 'center',
    borderColor: 'rgba(147, 143, 156, 0.28)',
    borderRadius: radii.full,
    borderWidth: 1,
    flex: 1,
    height: 38,
    justifyContent: 'center'
  },
  filterActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer
  },
  filterText: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '900'
  },
  filterTextActive: {
    color: colors.onPrimaryFixed
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18
  },
  hero: {
    marginBottom: 16,
    paddingHorizontal: 2
  },
  hint: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 8
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  image: {
    backgroundColor: colors.surfaceHighest,
    height: 168,
    width: 108
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
  payButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 7,
    height: 40,
    justifyContent: 'center',
    marginTop: 12
  },
  payButtonDisabled: {
    opacity: 0.58
  },
  payButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  price: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8
  },
  purchaseCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(255, 180, 171, 0.18)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden'
  },
  purchaseCardPaid: {
    borderColor: 'rgba(115, 230, 162, 0.2)'
  },
  receipt: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '800'
  },
  status: {
    color: colors.error,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  statusChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.1)',
    borderColor: 'rgba(255, 180, 171, 0.2)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  statusChipPaid: {
    backgroundColor: 'rgba(115, 230, 162, 0.1)',
    borderColor: 'rgba(115, 230, 162, 0.2)'
  },
  statusPaid: {
    color: '#73E6A2'
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
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
    minHeight: 66,
    justifyContent: 'center',
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
  }
});
