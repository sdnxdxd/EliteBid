import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors, radii } from '../theme';

export default function AppToast({ bottom = 22, message, onDone, tone = 'success', visible }) {
  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      onDone?.();
    }, 2200);

    return () => clearTimeout(timeout);
  }, [onDone, visible]);

  if (!visible) {
    return null;
  }

  const icon = tone === 'danger' ? 'alert-circle-outline' : 'check-circle-outline';

  return (
    <Pressable onPress={onDone} style={[styles.toast, { bottom }]}>
      <View style={[styles.iconBubble, tone === 'danger' && styles.iconBubbleDanger]}>
        <MaterialCommunityIcons
          color={tone === 'danger' ? colors.error : '#73E6A2'}
          name={icon}
          size={18}
        />
      </View>
      <Text numberOfLines={2} style={styles.message}>
        {message}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(115, 230, 162, 0.12)',
    borderRadius: radii.full,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  iconBubbleDanger: {
    backgroundColor: 'rgba(255, 180, 171, 0.12)'
  },
  message: {
    color: colors.onSurface,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18
  },
  toast: {
    alignItems: 'center',
    backgroundColor: 'rgba(38, 24, 62, 0.98)',
    borderColor: 'rgba(204, 193, 255, 0.22)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    left: 16,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 11,
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 22
  }
});
