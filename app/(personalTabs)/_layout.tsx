// app/(personalTabs)/_layout.tsx
import { tabLayoutStyles as styles } from '@/constants/ui.styles';
import { BlurTargetView } from 'expo-blur';
import { Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';
import type { View as RNView } from 'react-native';
import { View } from 'react-native';

import { GlassTabBar, type GlassTabItem } from '../../components/GlassTabBarBackground';

const TAB_GROUP = '(personalTabs)';

const TAB_ITEMS: GlassTabItem[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'transaction', title: 'Transactions', icon: 'wallet-outline', iconActive: 'wallet' },
  { name: 'scan', title: 'Scan', icon: 'scan-outline', iconActive: 'scan', center: true },
  { name: 'split', title: 'Split', icon: 'people-outline', iconActive: 'people' },
  { name: 'insight', title: 'Coach', icon: 'chatbox-ellipses-outline', iconActive: 'chatbox-ellipses' },
];

export default function PersonalLayout() {
  const pathname = usePathname();
  const blurTargetRef = useRef<RNView>(null);

  const hideTabBar = pathname.includes('scan') || pathname.includes('insight');

  return (
    <View style={styles.layoutRoot}>
      <StatusBar style="light" />

      <BlurTargetView ref={blurTargetRef} style={styles.layoutBlurTarget}>
        <Tabs
          tabBar={() => null}
          screenOptions={{
            headerShown: false,
            animation: 'shift', // or 'fade'
          }}
        >
          <Tabs.Screen name="home" options={{ title: 'Home' }} />
          <Tabs.Screen name="transaction" options={{ title: 'Transactions' }} />
          <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
          <Tabs.Screen name="split" options={{ title: 'Split' }} />
          <Tabs.Screen name="insight" options={{ title: 'Coach' }} />

          {/* Hidden routes (still reachable with router.push) */}
          <Tabs.Screen name="profile" options={{ href: null }} />
          <Tabs.Screen name="income" options={{ href: null }} />
        </Tabs>
      </BlurTargetView>

      {!hideTabBar && <GlassTabBar group={TAB_GROUP} items={TAB_ITEMS} blurTarget={blurTargetRef} />}
    </View>
  );
}