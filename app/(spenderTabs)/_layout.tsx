import { theme } from '@/constants/theme';
import { tabLayoutStyles as styles } from '@/constants/ui.styles';
import { Ionicons } from "@expo/vector-icons";
import { BlurTargetView } from "expo-blur";
import { Tabs, usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  View
} from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { GlassTabBar, type GlassTabItem } from "../../components/GlassTabBarBackground";
import { PaytonAlertProvider } from "../../components/PaytonAlert";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

type TabIconProps = {
  focused: boolean;
  color: string;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
};

// Imong mga messages (Ang pinaka-una kay mao ang mugawas sa 1st open)
const TAB_ITEMS: GlassTabItem[] = [
  { name: "home", title: "Home", icon: "home-outline", iconActive: "home" },
  { name: "transaction", title: "Transactions", icon: "wallet-outline", iconActive: "wallet" },
  { name: "scan", title: "Scan", icon: "scan-outline", iconActive: "scan", center: true },
  { name: "split", title: "Split", icon: "people-outline", iconActive: "people" },
  { name: "insight", title: "Coach", icon: "chatbox-ellipses-outline", iconActive: "chatbox-ellipses" },
];

const PAYTON_MESSAGES = [
  "Hello there, I'm Payton how can I assist with you today?",
  "Having trouble with your finance? I'm here to help.",
  "I'm here to assist you, just press this button.",
  "Trust Payton to keep your budget on track every single day.",
  "Need quick financial insights? I got your back.",
];

function TabIcon({
  focused,
  color,
  activeIcon,
  inactiveIcon,
}: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons
        name={focused ? activeIcon : inactiveIcon}
        size={21}
        color={focused ? theme.colors.white : color}
      />
    </View>
  );
}

export default function SpenderLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const blurTargetRef = useRef<View | null>(null);

  const isScanScreen = pathname === "/scan" || pathname.includes("scan");
  const isInsightScreen = pathname === "/insight" || pathname.includes("insight");
  const shouldHideAiButton = isScanScreen || isInsightScreen;

  const [currentMessage, setCurrentMessage] = useState(PAYTON_MESSAGES[0]);
  
  // Track kung 1st time ba ni abli sa app/session
  const isFirstOpen = useRef(true);

  // Animation values (gamit ang dili kaayo bouncy nga settings)
  const bubbleScale = useSharedValue(0);
  const bubbleOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  const isHome = pathname === "/home" || pathname === "/" || pathname.endsWith("/home");

  useEffect(() => {
    if (isHome && !shouldHideAiButton) {
      if (isFirstOpen.current) {
        // Kung 1st time pa lang naabli ang home, gamita ang pinaka-unang sentence
        setCurrentMessage(PAYTON_MESSAGES[0]);
        // Human ani, i-false na nato aron sa sunod, mag-randomize na
        isFirstOpen.current = false;
      } else {
        // Kung nibalik-balik na siya sa home, mag-randomize na gikan sa index 1 pataas (o sa tanan)
        const randomIndex = Math.floor(Math.random() * PAYTON_MESSAGES.length);
        setCurrentMessage(PAYTON_MESSAGES[randomIndex]);
      }

      // Smooth ug dili kaayo bouncy nga animation
      bubbleScale.value = withSequence(
        withSpring(1.05, { damping: 20, stiffness: 90 }),
        withSpring(1, { damping: 18 })
      );
      bubbleOpacity.value = withTiming(1, { duration: 200 });

      buttonScale.value = withSequence(
        withSpring(1.08, { damping: 18 }),
        withSpring(1, { damping: 18 })
      );

      const timer = setTimeout(() => {
        bubbleScale.value = withTiming(0, { duration: 250 });
        bubbleOpacity.value = withTiming(0, { duration: 200 });
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      bubbleScale.value = 0;
      bubbleOpacity.value = 0;
    }
  }, [isHome, shouldHideAiButton]);

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ scale: bubbleScale.value }, { translateY: 0 }],
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <PaytonAlertProvider>
      <View style={styles.layoutRoot}>
      <BlurTargetView ref={blurTargetRef} style={styles.layoutBlurTarget}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.white,
          tabBarInactiveTintColor: theme.colors.alpha.white[60],
          tabBarItemStyle: styles.tabBarItem,

          tabBarButton: (props: any) => {
            const { children, style, ...rest } = props;

            return (
              <Pressable
                {...rest}
                style={style as any}
                android_ripple={{ color: "transparent" }}
              >
                {children}
              </Pressable>
            );
          },

          tabBarStyle: { display: "none" as const },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
                color={color}
                focused={focused}
                activeIcon="home"
                inactiveIcon="home-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="transaction"
          options={{
            title: "Transactions",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
                color={color}
                focused={focused}
                activeIcon="wallet"
                inactiveIcon="wallet-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="scan"
          options={{
            title: "Scan",
            tabBarLabelStyle: styles.scanLabel,
            tabBarIcon: ({ focused }: any) => (
              <View
                style={[
                  styles.floatingButton,
                  focused && styles.floatingButtonActive,
                ]}
              >
                <Ionicons
                  name={focused ? "scan" : "scan-outline"}
                  size={30}
                  color={theme.colors.white}
                />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="split"
          options={{
            title: "Split",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
                color={color}
                focused={focused}
                activeIcon="people"
                inactiveIcon="people-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="insight"
          options={{
            title: "Coach",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
                color={color}
                focused={focused}
                activeIcon="chatbox-ellipses"
                inactiveIcon="chatbox-ellipses-outline"
              />
            ),
          }}
        />

        {/* Hidden routes */}
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>
      </BlurTargetView>
      {!shouldHideAiButton && (
        <GlassTabBar group="(spenderTabs)" items={TAB_ITEMS} blurTarget={blurTargetRef} />
      )}
      </View>
    </PaytonAlertProvider>
  );
}