import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors, radii } from '../theme';

const tabs = [
  {
    activeIcon: 'home-variant',
    icon: 'home-variant-outline',
    key: 'home',
    label: 'Inicio'
  },
  {
    activeIcon: 'gavel',
    icon: 'gavel',
    key: 'auctions',
    label: 'Subastas'
  },
  {
    activeIcon: 'heart',
    icon: 'heart-outline',
    key: 'favorites',
    label: 'Favoritos'
  },
  {
    activeIcon: 'shopping',
    icon: 'shopping-outline',
    key: 'purchases',
    label: 'Compras'
  },
  {
    activeIcon: 'account',
    icon: 'account-outline',
    key: 'profile',
    label: 'Perfil'
  }
];

export default function BottomNav({ activeTab, onNavigate }) {
  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;

        return (
          <Pressable
            accessibilityRole="button"
            key={tab.key}
            onPress={() => onNavigate?.(tab.key)}
            style={[styles.navItem, active && styles.navItemActive]}
          >
            <MaterialCommunityIcons
              color={active ? colors.onPrimaryFixed : colors.onSurfaceVariant}
              name={active ? tab.activeIcon : tab.icon}
              size={25}
            />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const bottomNavHeight = 88;

const styles = StyleSheet.create({
  bottomNav: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLowest,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: bottomNavHeight,
    justifyContent: 'space-between',
    left: 0,
    paddingBottom: 14,
    paddingHorizontal: 8,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 20
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    height: 58,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 6
  },
  navItemActive: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    flex: 1.04,
    marginHorizontal: 2,
    paddingHorizontal: 8
  },
  navLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  navLabelActive: {
    color: colors.onPrimaryFixed
  }
});
