// components/profile/Skeleton.tsx
// Skeleton loading primitives. All skeletons share ONE pulse animation (native driver),
// and fall back to a static tint when the OS "reduce motion" setting is on.
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  DimensionValue,
  Easing,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

import { theme } from '../../constants/theme';
import { incomeStyles, monitoringStyles } from '../../constants/ui.styles';

/* ---------- shared pulse ---------- */
const pulse = new Animated.Value(0);
let consumers = 0;
let loop: Animated.CompositeAnimation | null = null;

function startPulse() {
  consumers += 1;
  if (consumers === 1) {
    loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
  }
}

function stopPulse() {
  consumers -= 1;
  if (consumers <= 0) {
    consumers = 0;
    loop?.stop();
    loop = null;
    pulse.setValue(0);
  }
}

let reduceMotionCache: boolean | null = null;

/* ---------- primitive ---------- */
type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 14, radius = 8, style }: SkeletonProps) {
  const [reduceMotion, setReduceMotion] = useState(reduceMotionCache ?? false);

  useEffect(() => {
    if (reduceMotionCache !== null) return;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduceMotionCache = value;
      if (active) setReduceMotion(value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    startPulse();
    return stopPulse;
  }, [reduceMotion]);

  const opacity = reduceMotion ? 0.7 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.border, opacity }, style]}
    />
  );
}

/** Wrap a whole skeleton screen so screen readers announce a single "Loading". */
export function SkeletonGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      importantForAccessibility="yes"
    >
      {children}
    </View>
  );
}

/* ---------- presets ---------- */

/** Full-width pill shaped like the primary button. */
export function SkeletonButton() {
  return <Skeleton height={52} radius={26} />;
}

/** Label + input shaped block. */
export function SkeletonField({ labelWidth = 90 }: { labelWidth?: number }) {
  return (
    <View style={{ marginBottom: theme.space[16] }}>
      <Skeleton width={labelWidth} height={12} style={{ marginBottom: theme.space[8] }} />
      <Skeleton height={52} radius={26} />
    </View>
  );
}

/** Activity log row. */
export function SkeletonLogItem() {
  return (
    <View style={incomeStyles.incomeCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Skeleton width={40} height={40} radius={12} />
        <View style={{ flex: 1, marginLeft: theme.space[12] }}>
          <Skeleton width="85%" height={14} />
          <Skeleton width={90} height={11} style={{ marginTop: theme.space[8] }} />
        </View>
      </View>
    </View>
  );
}

/** Archive list card. */
export function SkeletonArchiveCard() {
  return (
    <View style={incomeStyles.incomeCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Skeleton width={40} height={40} radius={12} />
          <Skeleton width="55%" height={16} style={{ marginLeft: theme.space[12] }} />
        </View>
        <Skeleton width={70} height={16} />
      </View>
      <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.space[12] }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton width="42%" height={12} />
        <View style={{ flexDirection: 'row', gap: theme.space[8] }}>
          <Skeleton width={34} height={34} radius={10} />
          <Skeleton width={34} height={34} radius={10} />
          <Skeleton width={34} height={34} radius={10} />
        </View>
      </View>
    </View>
  );
}

/** Expense / transaction row. */
export function SkeletonTxRow() {
  return (
    <View style={monitoringStyles.txRow}>
      <Skeleton width={40} height={40} radius={12} />
      <View style={{ flex: 1, marginHorizontal: theme.space[12] }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} style={{ marginTop: theme.space[8] }} />
      </View>
      <Skeleton width={56} height={14} />
    </View>
  );
}

/** Selectable option row (export screen). */
export function SkeletonOption() {
  return <Skeleton height={64} radius={16} style={{ marginVertical: theme.space[6] }} />;
}
