import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getFavoriteAuctions, toggleFavoriteAuction } from '../backend/auctionService';
import AppToast from '../components/AppToast';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii } from '../theme';

export default function FavoritesScreen({ onBack, onNavigate, onOpenAuctionDetail, user }) {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  async function load() {
    const rows = await getFavoriteAuctions(user.clienteId);
    setFavorites(rows);
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function run() {
      const rows = await getFavoriteAuctions(user.clienteId);

      if (mounted) {
        setFavorites(rows);
        setLoading(false);
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

  async function removeFavorite(auctionId) {
    await toggleFavoriteAuction(user.clienteId, auctionId);
    setFavorites((current) => current.filter((auction) => auction.id !== auctionId));
    setToast('Quitado de favoritos.');
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
        <Text style={styles.logo}>Favoritos</Text>
        <View style={styles.iconButton}>
          <MaterialCommunityIcons color={colors.primary} name="heart" size={24} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>Favoritos</Text>
            <Text style={styles.subtitle}>
              Coleccion curada de obras maestras en seguimiento.
            </Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countValue}>{favorites.length}</Text>
            <Text style={styles.countLabel}>Lotes</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : favorites.length ? (
          <View style={styles.list}>
            {favorites.map((auction) => (
              <Pressable
                key={auction.id}
                onPress={() => onOpenAuctionDetail?.(auction.id, 'favorites')}
                style={styles.favoriteCard}
              >
                <Image source={{ uri: auction.imageUrl }} style={styles.image} />
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.meta}>{getCategoryLabel(auction.category)}</Text>
                    <Pressable
                      onPress={(event) => {
                        event?.stopPropagation?.();
                        removeFavorite(auction.id);
                      }}
                      style={styles.heartButton}
                    >
                      <MaterialCommunityIcons color={colors.primary} name="heart" size={22} />
                    </Pressable>
                  </View>
                  <Text numberOfLines={2} style={styles.cardTitle}>
                    {auction.title}
                  </Text>
                  <Text style={styles.cardCopy}>{auction.location}</Text>
                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={styles.priceLabel}>Puja actual</Text>
                      <Text style={styles.price}>{formatMoney(auction.currentBid || auction.basePrice)}</Text>
                    </View>
                    <View style={styles.endsIn}>
                      <MaterialCommunityIcons color={colors.onSurfaceVariant} name="timer-outline" size={14} />
                      <Text style={styles.endsInLabel}>Termina en</Text>
                      <Text style={styles.endsInValue}>{getRemainingCopy(auction.date)}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons color={colors.primary} name="heart-outline" size={42} />
            <Text style={styles.emptyTitle}>Todavia no guardaste favoritos</Text>
            <Text style={styles.emptyText}>Marca subastas para volver a ellas desde esta seccion.</Text>
            <Pressable onPress={load} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>Actualizar</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <BottomNav activeTab="favorites" onNavigate={onNavigate} />
      <AppToast
        bottom={bottomNavHeight + 12}
        message={toast}
        onDone={() => setToast(null)}
        visible={Boolean(toast)}
      />
    </View>
  );
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
}

function getCategoryLabel(category) {
  const labels = {
    comun: 'Comun',
    especial: 'Especial',
    oro: 'Oro',
    plata: 'Plata',
    platino: 'Platino'
  };

  return labels[category] ?? category;
}

function getRemainingCopy(date) {
  const today = new Date();
  const auctionDate = new Date(`${date}T23:59:00`);
  const diff = Math.max(0, auctionDate.getTime() - today.getTime());
  const hours = Math.ceil(diff / 3600000);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.ceil(hours / 24)}d`;
}

const styles = StyleSheet.create({
  cardBody: {
    flex: 1,
    minWidth: 0,
    padding: 14
  },
  cardCopy: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  cardFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21
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
  countLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800'
  },
  countPill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.32)',
    borderRadius: 28,
    borderWidth: 1,
    minWidth: 76,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  countValue: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: '900'
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
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center'
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
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center'
  },
  favoriteCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden'
  },
  endsIn: {
    alignItems: 'flex-end',
    gap: 2
  },
  endsInLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '700'
  },
  endsInValue: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: '900'
  },
  heartButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  hero: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 2
  },
  heroCopy: {
    flex: 1,
    paddingRight: 18
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  image: {
    backgroundColor: colors.surfaceHighest,
    height: 148,
    width: 110
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
  meta: {
    color: colors.tertiary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  price: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3
  },
  priceLabel: {
    color: colors.onSurfaceVariant,
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
