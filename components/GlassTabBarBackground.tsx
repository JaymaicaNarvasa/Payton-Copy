// components/GlassTabBar.tsx
// Floating frosted-glass tab bar. ONE file: glass settings + the bar itself.
// Needs:  npx expo install expo-blur   (SDK 55+ API: BlurTargetView + blurTarget + blurMethod)
//
// Why it is not a normal `tabBarBackground`: on Android the blur only works when the content behind it is wrapped
// in <BlurTargetView> and the <BlurView> sits NEXT to it (not inside it). So the layout does:
//   <View>
//     <BlurTargetView ref={ref}><Tabs /></BlurTargetView>
//     <GlassTabBar blurTarget={ref} ... />
//   </View>
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { usePathname, useRouter } from 'expo-router';
import type { ComponentProps, RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import { tabLayoutStyles as styles } from '../constants/ui.styles';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type GlassTabItem = {
  name: string; // route file name, e.g. "home"
  title: string;
  icon: IconName; // inactive
  iconActive: IconName;
  center?: boolean; // the raised scan button
};

// ---- glass settings (edit here) ----
export const glass = {
  intensity: 60,
  tint: 'dark',
  blurMethod: 'dimezisBlurView', // Android. 'dimezisBlurViewSdk31Plus' = no blur on Android 11 and older
  blurReductionFactor: 4,
} as const;

type Props = {
  group: string; // route group folder, e.g. "(spenderTabs)"
  items: GlassTabItem[];
  blurTarget: RefObject<View | null>;
};

export function GlassTabBar({ group, items, blurTarget }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (name: string) =>
    pathname === `/${name}` ||
    pathname.endsWith(`/${name}`) ||
    (name === 'home' && pathname === '/');

  return (
    <View style={styles.tabBar} pointerEvents="box-none">
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