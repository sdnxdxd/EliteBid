import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { enterAuctionRoom, getAuctionDetail, toggleFavoriteAuction } from '../backend/auctionService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii, shadows } from '../theme';

const categoryLabel = {
  comun: 'Comun',
  especial: 'Especial',
  oro: 'Oro',
  plata: 'Plata',
  platino: 'Platino'
};

export default function AuctionDetailScreen({ auctionId, onBack, onEnterRoom, onNavigate, onOpenNotifications, onRequireAccount, user }) {
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const detail = await getAuctionDetail(auctionId, user.clienteId);

    setAuction(detail);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        const detail = await getAuctionDetail(auctionId, user.clienteId);

        if (mounted) {
          setAuction(detail);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError.message);
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
  }, [auctionId, user.clienteId]);

  const suggestedBid = useMemo(() => {
    if (!auction) return 0;

    return Number(auction.currentBid || auction.basePrice || 0) + Number(auction.basePrice || 0) * 0.01;
  }, [auction]);

  async function joinRoom() {
    if (user?.guestMode) {
      onRequireAccount?.();
      return;
    }

    setError('');
    setJoining(true);

    try {
      await enterAuctionRoom(user.clienteId, auctionId);
      onEnterRoom?.(auctionId);
    } catch (joinError) {
      setError(joinError.message);
      await load();
    } finally {
      setJoining(false);
    }
  }

  async function toggleFavorite() {
    if (user?.guestMode) {
      setToast('Registrate para guardar favoritos y participar.');
      return;
    }

    setSavingFavorite(true);
    setError('');

    try {
      const wasFavorite = auction.isFavorite;
      await toggleFavoriteAuction(user.clienteId, auctionId);
      setAuction((current) =>
        current ? { ...current, isFavorite: !current.isFavorite } : current
      );
      setToast(wasFavorite ? 'Quitado de favoritos.' : 'Agregado a favoritos.');
    } catch (favoriteError) {
      setError(favoriteError.message);
    } finally {
      setSavingFavorite(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error || 'No se pudo cargar la subasta.'}</Text>
      </View>
    );
  }

  const live = auction.status === 'abierta';
  const guest = user.rol === 'invitado';
  const publicGuest = user?.guestMode || !user?.clienteId;
  const canJoin =
    !guest && live && auction.eligibility.categoryOk && auction.eligibility.verifiedPayments > 0 && !joining;

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
        <Text style={styles.logo}>Detalle</Text>
        {publicGuest ? (
          <View style={styles.iconButton} />
        ) : (
          <Pressable onPress={onOpenNotifications} style={styles.iconButton}>
            <MaterialCommunityIcons color={colors.primary} name="bell-outline" size={24} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: auction.imageUrl }} style={styles.image} />
          <LinearGradient
            colors={['rgba(20, 5, 43, 0.02)', 'rgba(20, 5, 43, 0.96)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.statusChip, live && styles.statusLive]}>
            <MaterialCommunityIcons
              color={live ? colors.error : colors.primary}
              name={live ? 'broadcast' : 'calendar-clock'}
              size={15}
            />
            <Text style={[styles.statusText, live && styles.statusTextLive]}>
              {live ? 'En vivo' : 'Programada'}
            </Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Text style={styles.category}>{categoryLabel[auction.category] ?? auction.category}</Text>
            {publicGuest ? null : (
              <Pressable
                disabled={savingFavorite}
                onPress={toggleFavorite}
                style={[styles.favoriteButton, auction.isFavorite && styles.favoriteButtonActive]}
              >
                <MaterialCommunityIcons
                  color={auction.isFavorite ? colors.secondary : colors.onSurfaceVariant}
                  name={auction.isFavorite ? 'heart' : 'heart-outline'}
                  size={23}
                />
              </Pressable>
            )}
          </View>
          <Text style={styles.title}>{auction.itemTitle || auction.title}</Text>
          <Text style={styles.description}>{auction.fullDescription}</Text>

          {auction.status !== 'abierta' ? <View style={styles.catalogCard}>
            <View style={styles.catalogHeader}>
              <MaterialCommunityIcons color={colors.primary} name="format-list-bulleted" size={19} />
              <Text style={styles.catalogTitle}>Catalogo de productos</Text>
            </View>
            {(auction.catalog || []).map((item, index) => (
              <View key={item.itemId || item.productId || index} style={styles.catalogItem}>
                <Image source={{ uri: item.imageUrl || auction.imageUrl }} style={styles.catalogImage} />
                <View style={styles.catalogCopy}>
                  <Text style={styles.catalogItemTitle}>Pieza {index + 1}</Text>
                  <Text numberOfLines={2} style={styles.catalogDescription}>{item.description}</Text>
                  <Text style={styles.catalogPrice}>
                    {item.basePrice == null ? 'Precio reservado para usuarios registrados' : `Base ${formatMoney(item.basePrice)}`}
                  </Text>
                </View>
              </View>
            ))}
          </View> : null}

          <View style={styles.infoGrid}>
            <InfoBlock label="Base" value={formatMoney(auction.basePrice)} />
            <InfoBlock label="Actual" value={formatMoney(auction.currentBid || auction.basePrice)} />
            <InfoBlock label="Fecha" value={formatDate(auction.date)} />
            <InfoBlock label="Hora" value={auction.time} />
          </View>

          <View style={styles.ruleCard}>
            {guest ? (
              <RuleRow
                ok={false}
                text={publicGuest
                  ? 'Invitado: podes ver catalogos publicos de subastas futuras. Registrate para ver precios y participar.'
                  : 'Cuenta invitada: verifica tu email para ver precios, editar datos y participar.'}
              />
            ) : null}
            {!publicGuest ? <RuleRow
              ok={auction.eligibility.categoryOk}
              text={
                auction.eligibility.categoryOk
                  ? `Categoria habilitada: ${categoryLabel[user.categoria] ?? user.categoria}`
                  : 'Tu categoria no permite entrar a esta sala'
              }
            /> : null}
            {!publicGuest ? <RuleRow
              ok={auction.eligibility.verifiedPayments > 0}
              text={
                auction.eligibility.verifiedPayments > 0
                  ? `${auction.eligibility.verifiedPayments} medio de pago verificado`
                  : 'Necesitas un medio de pago verificado'
              }
            /> : null}
            {!guest ? <RuleRow
              ok={live}
              text={live ? `Puja sugerida desde ${formatMoney(suggestedBid)}` : 'La sala abre en la fecha indicada'}
            /> : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={!canJoin && !publicGuest}
            onPress={joinRoom}
            style={[styles.primaryButton, !canJoin && styles.primaryButtonDisabled]}
          >
            {joining ? (
              <ActivityIndicator color={colors.onPrimaryFixed} />
            ) : (
              <>
                <MaterialCommunityIcons color={colors.onPrimaryFixed} name="door-open" size={22} />
                <Text style={styles.primaryButtonText}>
                  {live ? 'Ingresar a sala' : 'Subasta programada'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <BottomNav activeTab="auctions" onNavigate={onNavigate} />
      <AppToast
        bottom={bottomNavHeight + 12}
        message={toast}
        onDone={() => setToast(null)}
        visible={Boolean(toast)}
      />
    </View>
  );
}

function InfoBlock({ label, value }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function RuleRow({ ok, text }) {
  return (
    <View style={styles.ruleRow}>
      <MaterialCommunityIcons
        color={ok ? '#73E6A2' : colors.error}
        name={ok ? 'check-circle-outline' : 'alert-circle-outline'}
        size={20}
      />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

function formatMoney(value) {
  if (value == null) return 'Reservado';

  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(`${date}T12:00:00`));
}

const styles = StyleSheet.create({
  category: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  catalogCard: {
    backgroundColor: 'rgba(34, 20, 57, 0.72)',
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 13
  },
  catalogCopy: {
    flex: 1,
    minWidth: 0
  },
  catalogDescription: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3
  },
  catalogHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2
  },
  catalogImage: {
    backgroundColor: colors.surfaceHighest,
    borderRadius: radii.sm,
    height: 54,
    width: 54
  },
  catalogItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 64
  },
  catalogItemTitle: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '900'
  },
  catalogPrice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5
  },
  catalogTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    paddingBottom: bottomNavHeight + 34
  },
  description: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 10
  },
  detailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38
  },
  detailCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: 24,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: -34,
    padding: 18,
    ...shadows.ambient
  },
  error: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 10,
    textAlign: 'center'
  },
  favoriteButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  favoriteButtonActive: {
    backgroundColor: 'rgba(244, 180, 212, 0.12)',
    borderColor: 'rgba(244, 180, 212, 0.28)'
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  image: {
    height: '100%',
    width: '100%'
  },
  imageWrap: {
    backgroundColor: colors.surfaceHighest,
    height: 330,
    overflow: 'hidden'
  },
  infoBlock: {
    backgroundColor: colors.surfaceLow,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minWidth: '45%',
    padding: 12
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18
  },
  infoLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  infoValue: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 5
  },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLowest,
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 8,
    height: 54,
    justifyContent: 'center',
    marginTop: 16
  },
  primaryButtonDisabled: {
    opacity: 0.48
  },
  primaryButtonText: {
    color: colors.onPrimaryFixed,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  ruleCard: {
    backgroundColor: 'rgba(34, 20, 57, 0.82)',
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 13
  },
  ruleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  ruleText: {
    color: colors.onSurfaceVariant,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17
  },
  statusChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(49, 34, 73, 0.88)',
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 6,
    left: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    top: 18
  },
  statusLive: {
    backgroundColor: 'rgba(147, 0, 10, 0.76)'
  },
  statusText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  statusTextLive: {
    color: colors.error
  },
  title: {
    color: colors.onSurface,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 32,
    marginTop: 6
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
