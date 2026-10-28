import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

type TabIconProps = {
  focused: boolean;
  color: string;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
};

// Imong mga messages (Ang pinaka-una kay mao ang mugawas sa 1st open)
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
        color={focused ? "#ffffff" : color}
      />
    </View>
  );
}

export default function PersonalLayout() {
  const router = useRouter();
  const pathname = usePathname();

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
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#ffffff",
          tabBarInactiveTintColor: "rgba(255, 255, 255, 0.6)",
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

          tabBarStyle: [
            styles.tabBar,
            shouldHideAiButton ? { display: "none" as const } : null,
          ],
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
                  color="#FFFFFF"
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
        <Tabs.Screen name="income" options={{ href: null }} />
      </Tabs>


    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    left: 12,
    right: 12,
    height: Platform.OS === "ios" ? 70 : 66,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    paddingHorizontal: 3,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: "#1F4F59",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
    overflow: "visible",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  tabBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scanLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: -1,
    marginBottom: Platform.OS === "ios" ? -2 : 0,
  },
  floatingButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#1B494E",
    justifyContent: "center",
    alignItems: "center",
    top: -25,
    borderWidth: 5,
    borderColor: "#F8FAFC",
    shadowColor: "#1B494E",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  floatingButtonActive: {
    backgroundColor: "#123236",
  },
  aiContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 98 : 88,
    right: 20,
    alignItems: "flex-end",
  },
  floatingAiButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgb(255, 255, 255)",
    borderWidth: 2,
    borderColor: "#43E7A3",
    shadowColor: "#1B494E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 7,
  },
  paytonLogo: {
    width: 50,
    height: 50,
  },
  speechBubble: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    maxWidth: 220,
  },
  speechBubbleText: {
    color: "#1F4F59",
    fontWeight: "700",
    fontSize: 13,
  },
  speechBubbleArrow: {
    position: "absolute",
    bottom: -6,
    right: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },
});