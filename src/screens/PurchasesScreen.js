import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { getUserPurchases } from '../backend/auctionService';
import BottomNav, { bottomNavHeight } from '../components/BottomNav';
import { colors, radii } from '../theme';

export default function PurchasesScreen({ onBack, onNavigate, user }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const rows = await getUserPurchases(user.clienteId);

      if (mounted) {
        setPurchases(rows);
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [user.clienteId]);

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
            Adjudicaciones y pujas ganadoras pendientes de liquidacion.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : purchases.length ? (
          <View style={styles.list}>
            {purchases.map((purchase) => (
              <View key={purchase.id} style={styles.purchaseCard}>
                <Image source={{ uri: purchase.imageUrl }} style={styles.image} />
                <View style={styles.cardCopy}>
                  <View style={styles.statusRow}>
                    <MaterialCommunityIcons color="#73E6A2" name="check-circle-outline" size={18} />
                    <Text style={styles.status}>Adjudicacion pendiente</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.cardTitle}>
                    {purchase.title}
                  </Text>
                  <Text style={styles.price}>{formatMoney(purchase.amount)}</Text>
                  <Text style={styles.hint}>Incluye comision y envio al confirmar la compra.</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons color={colors.primary} name="shopping-outline" size={44} />
            <Text style={styles.emptyTitle}>No hay compras aun</Text>
            <Text style={styles.emptyText}>
              Cuando ganes una puja, vas a ver aca el estado de pago y entrega.
            </Text>
          </View>
        )}
      </ScrollView>

      <BottomNav activeTab="purchases" onNavigate={onNavigate} />
    </View>
  );
}

function formatMoney(value) {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: 0
  })}`;
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
    height: 146,
    width: 106
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
  price: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8
  },
  purchaseCard: {
    backgroundColor: colors.surfaceContainer,
    borderColor: 'rgba(72, 69, 81, 0.24)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden'
  },
  status: {
    color: '#73E6A2',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
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
