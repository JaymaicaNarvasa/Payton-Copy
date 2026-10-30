// app/(sponsorTabs)/_layout.tsx
// Floating frosted-glass tab bar, same setup as the Spender layout.
import { tabLayoutStyles as styles } from '@/constants/ui.styles';
import { BlurTargetView } from 'expo-blur';
import { Tabs, usePathname } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { GlassTabBar, type GlassTabItem } from '../../components/GlassTabBarBackground';
import { PaytonAlertProvider } from '../../components/PaytonAlert';

const TAB_ITEMS: GlassTabItem[] = [
  { name: 'home', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'allowances', title: 'Allowances', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function SponsorTabsLayout() {
  const pathname = usePathname();
  const blurTargetRef = useRef<View | null>(null);

  // the bar is hidden on the monitoring screen
  const shouldHideTabBar = pathname.includes('monitoring');

  return (
    // useAlert() in home.tsx needs this provider (the Spender layout mounts it the same way)
    <PaytonAlertProvider>
      <View style={styles.layoutRoot}>
        {/* everything the glass blurs must be inside BlurTargetView; the bar sits NEXT to it */}
        <BlurTargetView ref={blurTargetRef} style={styles.layoutBlurTarget}>
          <Tabs
            screenOptions={{
              headerShown: false,
              // the built-in bar is hidden; <GlassTabBar /> replaces it
              tabBarStyle: { display: 'none' as const },
            }}
          >
            <Tabs.Screen name="home" options={{ title: 'Home' }} />
            <Tabs.Screen name="allowances" options={{ title: 'Allowances' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
            <Tabs.Screen name="monitoring" options={{ href: null }} />
          </Tabs>
        </BlurTargetView>

        {!shouldHideTabBar && (
          <GlassTabBar group="(sponsorTabs)" items={TAB_ITEMS} blurTarget={blurTargetRef} />
        )}
      </View>
    </PaytonAlertProvider>
  );
}