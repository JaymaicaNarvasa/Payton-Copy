import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname } from "expo-router";
import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

type TabIconProps = {
  focused: boolean;
  color: string;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
};

function TabIcon({ focused, color, activeIcon, inactiveIcon }: TabIconProps) {
  return (
    <View style={[styles.iconContainer, focused && styles.activeIconContainer]}>
      <Ionicons
        name={focused ? activeIcon : inactiveIcon}
        size={20} // Gi-usab gikan sa 15 ngadto sa 24 para matarong ang porma ug gidak-on
        color={focused ? "#4CA771" : "#8E9A92"}
      />
    </View>
  );
}

export default function SponsorTabsLayout() {
  const pathname = usePathname();

  const isMonitoringScreen =
    pathname === "/monitoring" || pathname.includes("monitoring");

  const shouldHideTabBar =
    isMonitoringScreen

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#4CA771",
        tabBarInactiveTintColor: "#8E9A92",
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
          shouldHideTabBar ? { display: "none" as const } : null,
        ],
      }}
    >
      {/* Home Tab */}
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

      {/* Allowances Tab */}
      <Tabs.Screen
        name="allowances"
        options={{
          title: "Allowances",
          tabBarIcon: ({ color, focused }: any) => (
            <TabIcon
              color={color}
              focused={focused}
              activeIcon="stats-chart"
              inactiveIcon="stats-chart-outline"
            />
          ),
        }}
      />

      

      {/* Profile Tab */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }: any) => (
            <TabIcon
              color={color}
              focused={focused}
              activeIcon="person"
              inactiveIcon="person-outline"
            />
          ),
        }}
      />

      <Tabs.Screen name="monitoring" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "relative",
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 90 : 75,
    paddingTop: 15,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    elevation: 50,
    shadowOpacity: 0,
  },

  tabBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    overflow: "visible",
  },

  activeIconContainer: {},

  cardActiveBox: {
    backgroundColor: "#4CA771",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});