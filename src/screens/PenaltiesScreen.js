import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getUserPenalties, presentPenaltyFunds, settlePenalty } from '../backend/penaltyService';
import AppToast from '../components/AppToast';
import { colors, radii } from '../theme';

export default function PenaltiesScreen({ onBack, user }) {
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settlingKey, setSettlingKey] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const rows = await getUserPenalties(user.clienteId);

        if (mounted) {
          setPenalties(rows);
        }
      } catch (error) {
        if (mounted) {
          setToast(error.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  async function handleSettle(penalty, mode) {
    setSettlingKey(`${penalty.id}:${mode}`);

    try {
      const rows = mode === 'funds'
        ? await presentPenaltyFunds(user.clienteId, penalty.id)
        : await settlePenalty(user.clienteId, penalty.id);
      setPenalties(rows);
      setToast(
        mode === 'pay'
          ? 'Multa abonada. Si todavia no presentaste fondos, la restriccion sigue activa.'
          : 'Fondos presentados. Tu cuenta queda actualizada.'
      );
    } catch (settleError) {
      setToast(settleError.message);
    } finally {
      setSettlingKey(null);
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
        <Text style={styles.logo}>Penalidades</Text>
        <View style={styles.iconButton} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Estado de cuenta</Text>
          <Text style={styles.subtitle}>Listado de penalidades asociadas a tu usuario.</Text>

          {penalties.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons color={colors.primary} name="shield-check-outline" size={46} />
              <Text style={styles.emptyTitle}>Sin penalidades</Text>
              <Text style={styles.emptyCopy}>Tu cuenta no tiene restricciones activas.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {penalties.map((penalty) => (
                <PenaltyCard
                  key={penalty.id}
                  onSettle={handleSettle}
                  penalty={penalty}
                  settlingKey={settlingKey}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <AppToast
        bottom={24}
        message={toast}
        onDone={() => setToast(null)}
        tone={toast?.includes('No encontramos') || toast?.includes('ya esta') ? 'danger' : 'success'}
        visible={Boolean(toast)}
      />
    </View>
  );
}

function PenaltyCard({ onSettle, penalty, settlingKey }) {
  const active = penalty.status === 'activa' || penalty.status === 'vencida';
  const finePaid = Boolean(penalty.finePaidAt);
  const fundsPresented = penalty.fundsPresented === 'si';
  const payLoading = settlingKey === `${penalty.id}:pay`;
  const fundsLoading = settlingKey === `${penalty.id}:funds`;
  const payBlocked = Boolean(settlingKey) || !active || finePaid || penalty.status === 'vencida';
  const fundsBlocked = Boolean(settlingKey) || !active || fundsPresented || penalty.status === 'vencida';

  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <View style={styles.cardIcon}>
        <MaterialCommunityIcons
          color={active ? colors.error : colors.onSurfaceVariant}
          name={active ? 'alert-circle-outline' : 'check-circle-outline'}
          size={28}
        />
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{penalty.title}</Text>
          <Text style={styles.amount}>{formatMoney(penalty.amount)}</Text>
        </View>
        <Text style={styles.description}>{penalty.description}</Text>
        {penalty.type === 'falta_fondos' ? (
          <View style={styles.obligationList}>
            <Obligation done={finePaid} text={`Multa ${finePaid ? 'abonada' : `pendiente: ${formatMoney(penalty.amount)}`}`} />
            <Obligation
              done={fundsPresented}
              text={fundsPresented ? 'Fondos presentados' : `Presentar fondos: ${formatMoney(penalty.totalRequired)}`}
            />
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={[styles.status, active && styles.statusActive]}>{penalty.status}</Text>
          <Text style={styles.dueDate}>Vence: {formatDateTime(penalty.dueAt ?? penalty.dueDate)}</Text>
        </View>
        {active ? (
          <View style={styles.actionRow}>
            <Pressable
              disabled={payBlocked}
              onPress={() => onSettle?.(penalty, 'pay')}
              style={[styles.primaryAction, payBlocked && styles.actionDisabled]}
            >
              {payLoading ? (
                <ActivityIndicator color={colors.onPrimaryFixed} />
              ) : (
                <Text style={styles.primaryActionText}>{finePaid ? 'Multa paga' : 'Pagar multa'}</Text>
              )}
            </Pressable>
            <Pressable
              disabled={fundsBlocked}
              onPress={() => onSettle?.(penalty, 'funds')}
              style={[styles.secondaryAction, fundsBlocked && styles.actionDisabled]}
            >
              {fundsLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.secondaryActionText}>{fundsPresented ? 'Fondos OK' : 'Presentar fondos'}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Obligation({ done, text }) {
  return (
    <View style={styles.obligationRow}>
      <MaterialCommunityIcons
        color={done ? '#73E6A2' : colors.error}
        name={done ? 'check-circle-outline' : 'clock-alert-outline'}
        size={16}
      />
      <Text style={[styles.obligationText, done && styles.obligationDone]}>{text}</Text>
    </View>
  );
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

function formatDateTime(date) {
  if (!date) return 'sin fecha';

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(String(date).includes(' ') ? date.replace(' ', 'T') : `${date}T12:00:00`));
}

const styles = StyleSheet.create({
  amount: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '900'
  },
  actionDisabled: {
    opacity: 0.55
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  card: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.28)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 16
  },
  cardActive: {
    borderColor: 'rgba(255, 180, 171, 0.26)'
  },
  cardCopy: {
    flex: 1
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 180, 171, 0.1)',
    borderRadius: radii.full,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  cardTitle: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 16,
    fontWeight: '900'
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    padding: 22,
    paddingBottom: 44
  },
  description: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 7
  },
  dueDate: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800'
  },
  emptyCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center'
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderRadius: 24,
    marginTop: 20,
    padding: 28
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  list: {
    gap: 13,
    marginTop: 20
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
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  obligationDone: {
    color: '#73E6A2'
  },
  obligationList: {
    gap: 7,
    marginTop: 12
  },
  obligationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7
  },
  obligationText: {
    color: colors.onSurfaceVariant,
    flex: 1,
    fontSize: 12,
    fontWeight: '800'
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flex: 1,
    height: 40,
    justifyContent: 'center'
  },
  primaryActionText: {
    color: colors.onPrimaryFixed,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: 'rgba(204, 193, 255, 0.28)',
    borderRadius: radii.full,
    borderWidth: 1,
    flex: 1,
    height: 40,
    justifyContent: 'center'
  },
  secondaryActionText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  status: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  statusActive: {
    color: colors.error
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
    marginBottom: 8
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
