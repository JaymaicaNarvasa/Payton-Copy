// components/Skeleton.tsx
// Pulsing placeholder block used while a screen is loading (same one the sponsor home uses).
import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, ViewStyle } from 'react-native';

import { theme } from '../constants/theme';

export function Skeleton({
  width,
  height,
  radius = 10,
  color = theme.colors.border,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  /** Use a translucent white on top of the gradient header. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: color, opacity }, style]}
    />
  );
}
