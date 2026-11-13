// components/GlassTabBar.tsx
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { usePathname, useRouter } from 'expo-router';
import type { ComponentProps, RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // 1. Import this
import { theme } from '../constants/theme';
import { tabLayoutStyles as styles } from '../constants/ui.styles';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type GlassTabItem = {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
  center?: boolean;
};

export const glass = {
  intensity: 60,
  tint: 'dark',
  blurMethod: 'dimezisBlurView',
  blurReductionFactor: 4,
} as const;

type Props = {
  group: string;
  items: GlassTabItem[];
  blurTarget: RefObject<View | null>;
};

export function GlassTabBar({ group, items, blurTarget }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets(); // 2. Hook to get system navigation bar height

  // 3. Dynamically calculate bottom offset based on whether 3-button or gesture navigation is active
  const bottomOffset = Math.max(insets.bottom, 12);

  const isActive = (name: string) =>
    pathname === `/${name}` ||
    pathname.endsWith(`/${name}`) ||
    (name === 'home' && pathname === '/');

  return (
    <View 
      style={[styles.tabBar, { bottom: bottomOffset }]} // 4. Apply dynamic bottom positioning here
      pointerEvents="box-none"
    >
      <View style={styles.tabBarGlassClip} pointerEvents="none">
        <BlurView
          blurTarget={blurTarget}
          blurMethod={glass.blurMethod}
          intensity={glass.intensity}
          tint={glass.tint}
          blurReductionFactor={glass.blurReductionFactor}
          style={styles.tabBarGlassBlur}
        />
        <View style={styles.tabBarGlassTint} />
      </View>

      <View style={styles.tabBarRow}>
        {items.map((item) => {
          const focused = isActive(item.name);
          const labelColor = focused ? theme.colors.white : theme.colors.alpha.white[60];
          return (
            <Pressable
              key={item.name}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityState={{ selected: focused }}
              onPress={() => router.navigate(`/${group}/${item.name}` as never)}
              android_ripple={{ color: 'transparent' }}
              style={styles.tabBarItem}
            >
              {item.center ? (
                <View style={[styles.floatingButton, focused && styles.floatingButtonActive]}>
                  <Ionicons name={focused ? item.iconActive : item.icon} size={30} color={theme.colors.white} />
                </View>
              ) : (
                <View style={styles.iconContainer}>
                  <Ionicons name={focused ? item.iconActive : item.icon} size={21} color={labelColor} />
                </View>
              )}
              <Text style={[styles.tabLabel, item.center && styles.scanLabel, { color: labelColor }]}>{item.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default GlassTabBar;