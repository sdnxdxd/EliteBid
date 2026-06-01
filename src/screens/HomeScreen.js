import React, { useEffect, useMemo, useState } from 'react';
import {
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

import {
  getFavoriteAuctionIds,
  getHomeAuctions,
  getUserSummary,
  toggleFavoriteAuction
} from '../backend/auctionService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii, shadows } from '../theme';

const categoryLabel = {
  comun: 'Comun',
  especial: 'Especial',
  plata: 'Plata',
  oro: 'Oro',
  platino: 'Platino'
};

export default function HomeScreen({
  user,
  onNavigate,
  onOpenAuctionDetail,
  onOpenAuctions,
  onSignOut
}) {
  const [liveAuctions, setLiveAuctions] = useState([]);
  const [upcomingAuctions, setUpcomingAuctions] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [summary, setSummary] = useState({ verifiedPayments: 0, totalBids: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos dias';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }, []);

  async function load() {
    const [auctions, userSummary, favorites] = await Promise.all([
      getHomeAuctions(user.clienteId),
      getUserSummary(user.clienteId),
      getFavoriteAuctionIds(user.clienteId)
    ]);

    setLiveAuctions(auctions.live);
    setUpcomingAuctions(auctions.upcoming);
    setFavoriteIds(favorites);
    setSummary(userSummary);
  }

  useEffect(() => {
    load();
  }, [user.clienteId]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleFavorite(auctionId) {
    const wasFavorite = favoriteIds.includes(auctionId);
    const nextIds = await toggleFavoriteAuction(user.clienteId, auctionId);

    setFavoriteIds(nextIds);
    setToast(wasFavorite ? 'Quitado de favoritos.' : 'Agregado a favoritos.');
  }

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.surfaceLowest, colors.surface, colors.surfaceLow]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={refresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.logo}>Elite Bid</Text>
          <Pressable onPress={onSignOut} style={styles.iconButton}>
            <MaterialCommunityIcons color={colors.onSurfaceVariant} name="logout" size={22} />
          </Pressable>
        </View>

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.userName}>{user.nombre}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialCommunityIcons color={colors.tertiary} name="seal-variant" size={16} />
            <Text style={styles.badgeText}>{categoryLabel[user.categoria] ?? user.categoria}</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <MaterialCommunityIcons color={colors.outline} name="magnify" size={22} />
          <TextInput
            placeholder="Buscar arte, relojes, motores..."
            placeholderTextColor="rgba(201, 196, 211, 0.52)"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.statsRow}>
          <MetricCard label="Medios verificados" value={summary.verifiedPayments} />
          <MetricCard label="Pujas realizadas" value={summary.totalBids} />
        </View>

        <SectionHeader action="Ver todas" onAction={onOpenAuctions} title="Subastas abiertas" />
        <ScrollView
          contentContainerStyle={styles.horizontalContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {liveAuctions.map((auction) => (
            <AuctionCard
              auction={auction}
              isFavorite={favoriteSet.has(auction.id)}
              key={auction.id}
              onPress={() => onOpenAuctionDetail?.(auction.id, 'home')}
              onToggleFavorite={() => toggleFavorite(auction.id)}
            />
          ))}
        </ScrollView>

        <SectionHeader title="Proximas subastas" />
        <View style={styles.list}>
          {upcomingAuctions.map((auction) => (
            <AuctionListItem
              auction={auction}
              isFavorite={favoriteSet.has(auction.id)}
              key={auction.id}
              onPress={() => onOpenAuctionDetail?.(auction.id, 'home')}
              onToggleFavorite={() => toggleFavorite(auction.id)}
            />
          ))}
        </View>
      </ScrollView>

      <BottomNav activeTab="home" onNavigate={onNavigate} />
      <AppToast
        bottom={bottomNavHeight + 12}
        message={toast}
        onDone={() => setToast(null)}
        visible={Boolean(toast)}
      />
    </View>
  );
}

function SectionHeader({ action, onAction, title }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MetricCard({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AuctionCard({ auction, isFavorite, onPress, onToggleFavorite }) {
  const priceAvailable = auction.currentBid != null;

  return (
    <Pressable onPress={onPress} style={styles.auctionCard}>
      <View style={styles.cardImageWrap}>
        <Image source={{ uri: auction.imageUrl }} style={styles.cardImage} />
        <LinearGradient
          colors={['rgba(20, 5, 43, 0.04)', 'rgba(20, 5, 43, 0.96)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.liveChip}>
          <MaterialCommunityIcons color={colors.error} name="clock-outline" size={14} />
          <Text style={styles.liveChipText}>En vivo</Text>
        </View>
        <Pressable
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggleFavorite?.();
          }}
          style={styles.favoriteButton}
        >
          <MaterialCommunityIcons
            color={isFavorite ? colors.secondary : colors.onSurface}
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={20}
          />
        </Pressable>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardMeta}>{auction.location}</Text>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {auction.title}
        </Text>
        <Text style={styles.cardLabel}>{priceAvailable ? 'Puja actual' : 'Precio reservado'}</Text>
        <Text style={styles.cardPrice}>{priceAvailable ? formatMoney(auction.currentBid) : 'Verificacion pendiente'}</Text>
      </View>
    </Pressable>
  );
}

function AuctionListItem({ auction, isFavorite, onPress, onToggleFavorite }) {
  const priceAvailable = auction.basePrice != null;

  return (
    <Pressable onPress={onPress} style={styles.listItem}>
      <Image source={{ uri: auction.imageUrl }} style={styles.listImage} />
      <View style={styles.listCopy}>
        <Text style={styles.cardMeta}>{auction.category}</Text>
        <Text numberOfLines={1} style={styles.listTitle}>
          {auction.title}
        </Text>
        <Text style={styles.listEstimate}>
          {priceAvailable ? `Base ${formatMoney(auction.basePrice)}` : 'Precio reservado'}
        </Text>
      </View>
      <View style={styles.datePill}>
        <Text style={styles.dateText}>{formatShortDate(auction.date)}</Text>
      </View>
      <Pressable
        onPress={(event) => {
          event?.stopPropagation?.();
          onToggleFavorite?.();
        }}
        style={styles.listFavoriteButton}
      >
        <MaterialCommunityIcons
          color={isFavorite ? colors.secondary : colors.onSurfaceVariant}
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={20}
        />
      </Pressable>
    </Pressable>
  );
}

function formatMoney(value) {
  if (value == null) return 'Reservado';

  const amount = Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  });

  return `$ ${amount}`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(`${date}T12:00:00`));
}

const styles = StyleSheet.create({
  auctionCard: {
    backgroundColor: colors.surfaceLow,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.lg,
    borderWidth: 1,
    marginRight: 16,
    overflow: 'hidden',
    width: 282,
    ...shadows.ambient
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderColor: 'rgba(72, 69, 81, 0.32)',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  badgeText: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  cardBody: {
    marginTop: -26,
    padding: 18,
    paddingTop: 0
  },
  cardImage: {
    height: '100%',
    width: '100%'
  },
  cardImageWrap: {
    aspectRatio: 0.86,
    backgroundColor: colors.surfaceHighest
  },
  cardLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 18
  },
  cardMeta: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  cardPrice: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 3
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23
  },
  container: {
    backgroundColor: colors.surfaceLowest,
    flex: 1
  },
  content: {
    paddingBottom: bottomNavHeight + 30,
    paddingHorizontal: 20,
    paddingTop: 42
  },
  datePill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHighest,
    borderColor: 'rgba(72, 69, 81, 0.35)',
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  dateText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  favoriteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 5, 43, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: 12,
    width: 38
  },
  greeting: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4
  },
  greetingRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    marginTop: 30
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  horizontalContent: {
    paddingBottom: 10,
    paddingRight: 20
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLow,
    borderRadius: radii.full,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  headerSpacer: {
    height: 44,
    width: 44
  },
  list: {
    gap: 14
  },
  listCopy: {
    flex: 1,
    minWidth: 0
  },
  listEstimate: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5
  },
  listImage: {
    backgroundColor: colors.surfaceHighest,
    borderRadius: radii.sm,
    height: 76,
    width: 76
  },
  listItem: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.22)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 12
  },
  listFavoriteButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 28
  },
  listTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '900'
  },
  liveChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(147, 0, 10, 0.72)',
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 5,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    top: 12
  },
  liveChipText: {
    color: colors.onSurface,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  logo: {
    color: colors.primaryContainer,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  metricCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.26)',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    padding: 16
  },
  metricLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 4
  },
  metricValue: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '900'
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceHighest,
    borderColor: 'rgba(72, 69, 81, 0.45)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 54,
    paddingHorizontal: 16
  },
  searchInput: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 14,
    height: '100%'
  },
  sectionAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900'
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 26
  },
  sectionTitle: {
    color: colors.onBackground,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16
  },
  userName: {
    color: colors.onSurface,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0
  }
});
