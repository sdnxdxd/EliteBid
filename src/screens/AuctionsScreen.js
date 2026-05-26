import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {
  getAuctionList,
  getFavoriteAuctionIds,
  toggleFavoriteAuction
} from '../backend/auctionService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii } from '../theme';

const filters = [
  { key: 'todas', label: 'Todas' },
  { key: 'abierta', label: 'En vivo' },
  { key: 'programada', label: 'Proximas' }
];

const categoryLabel = {
  comun: 'Comun',
  especial: 'Especial',
  oro: 'Oro',
  plata: 'Plata',
  platino: 'Platino'
};

export default function AuctionsScreen({ onBack, onNavigate, onOpenAuctionDetail, user }) {
  const [auctions, setAuctions] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [filter, setFilter] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [rows, favorites] = await Promise.all([
        getAuctionList(),
        getFavoriteAuctionIds(user.clienteId)
      ]);

      if (mounted) {
        setAuctions(rows);
        setFavoriteIds(favorites);
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  const filteredAuctions = useMemo(() => {
    if (filter === 'todas') return auctions;

    return auctions.filter((auction) => auction.status === filter);
  }, [auctions, filter]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  async function toggleFavorite(auctionId) {
    const wasFavorite = favoriteIds.includes(auctionId);
    const nextIds = await toggleFavoriteAuction(user.clienteId, auctionId);

    setFavoriteIds(nextIds);
    setToast(wasFavorite ? 'Quitado de favoritos.' : 'Agregado a favoritos.');
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
        <Text style={styles.logo}>Subastas</Text>
        <View style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="gavel" size={24} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Catalogo conectado</Text>
          <Text style={styles.title}>Elegir sala, ver detalle y pujar</Text>
          <Text style={styles.subtitle}>
            Listado con estado, categoria, precio base y acceso a la sala de pujas.
          </Text>
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
        ) : (
          <View style={styles.list}>
            {filteredAuctions.map((auction) => (
              <AuctionRow
                auction={auction}
                isFavorite={favoriteSet.has(auction.id)}
                key={auction.id}
                onPress={() => onOpenAuctionDetail?.(auction.id, 'auctions')}
                onToggleFavorite={() => toggleFavorite(auction.id)}
              />
            ))}
          </View>
        )}
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

function AuctionRow({ auction, isFavorite, onPress, onToggleFavorite }) {
  const live = auction.status === 'abierta';

  return (
    <Pressable onPress={onPress} style={styles.auctionRow}>
      <Image source={{ uri: auction.imageUrl }} style={styles.image} />
      <View style={styles.rowCopy}>
        <View style={styles.rowMeta}>
          <View style={[styles.statusChip, live && styles.statusLive]}>
            <Text style={[styles.statusText, live && styles.statusTextLive]}>
              {live ? 'En vivo' : 'Programada'}
            </Text>
          </View>
          <Text style={styles.category}>{categoryLabel[auction.category] ?? auction.category}</Text>
        </View>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {auction.title}
        </Text>
        <Text numberOfLines={1} style={styles.location}>
          {auction.location}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{live ? 'Puja actual' : 'Precio base'}</Text>
          <Text style={styles.price}>
            {formatMoney(live ? auction.currentBid : auction.basePrice)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={(event) => {
          event?.stopPropagation?.();
          onToggleFavorite?.();
        }}
        style={styles.favoriteButton}
      >
        <MaterialCommunityIcons
          color={isFavorite ? colors.secondary : colors.onSurfaceVariant}
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={22}
        />
      </Pressable>
    </Pressable>
  );
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

const styles = StyleSheet.create({
  auctionRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 12
  },
  category: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
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
  eyebrow: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
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
  favoriteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(60, 45, 84, 0.64)',
    borderRadius: radii.full,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18
  },
  hero: {
    backgroundColor: 'rgba(49, 34, 73, 0.58)',
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  image: {
    backgroundColor: colors.surfaceHighest,
    borderRadius: radii.sm,
    height: 96,
    width: 88
  },
  list: {
    gap: 12
  },
  loader: {
    marginTop: 40
  },
  location: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4
  },
  logo: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  price: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900'
  },
  priceLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800'
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },
  rowCopy: {
    flex: 1,
    minWidth: 0
  },
  rowMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  rowTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20
  },
  statusChip: {
    backgroundColor: colors.surfaceHighest,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusLive: {
    backgroundColor: 'rgba(147, 0, 10, 0.7)'
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
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 8
  },
  title: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 5
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
