import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';

// Swap these to match your brand / sponsor home palette.
const COLORS = {
  primary: '#013237',
  primaryPressed: '#0f4349',
  primarySoft: '#E6F4EA',
  gradientStart: '#75C093',
  gradientEnd: '#013237',
  accent: '#4ADE80',
  onPrimary: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  background: '#FFFFFF',
};

type Status = 'checking' | 'landing';

// Feature chips shown in the hero illustration.
const CHIPS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'scan', label: 'Scan receipts', icon: 'scan' },
  { key: 'insights', label: 'AI insights', icon: 'sparkles' },
  { key: 'split', label: 'Split expenses', icon: 'people' },
  { key: 'budget', label: 'Smart budgets', icon: 'pie-chart' },
];

// One slot per chip: two above the card, two below, staggered left/right.
// Kept inside the illustration bounds (16px gutters) so nothing is clipped.
const CHIP_POSITIONS = [
  { top: 0, left: 16 },
  { top: 28, right: 16 },
  { bottom: 28, left: 16 },
  { bottom: 0, right: 16 },
];

// A gently bobbing wrapper used for the floating chips.
function Floating({
  children,
  delay = 0,
  distance = 8,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: any;
}) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, {
          toValue: -distance,
          duration: 1800,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [y, delay, distance]);

  return <Animated.View style={[style, { transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [status, setStatus] = useState<Status>('checking');

  // Splash logo animation
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;

  // Landing content animation
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoFade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    let cancelled = false;

    // Returns a route for signed-in users, or null to show the landing page.
    const resolveDestination = async (): Promise<string | null> => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return null;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        switch (profile?.role) {
          case 'Personal':
            return '/(personalTabs)/home';
          case 'Spender':
            return '/(spenderTabs)/home';
          case 'Sponsor':
            return '/(sponsorTabs)/home';
          default:
            return '/role-selection';
        }
      } catch {
        return null;
      }
    };

    // Keep the splash visible briefly so it doesn't flash.
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 1200));

    Promise.all([resolveDestination(), minDelay]).then(([destination]) => {
      if (cancelled) return;
      if (destination) {
        router.replace(destination as any);
      } else {
        setStatus('landing');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [logoFade, logoScale, router]);

  useEffect(() => {
    if (status !== 'landing') return;
    Animated.parallel([
      Animated.timing(contentFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(contentSlide, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [status, contentFade, contentSlide]);

  if (status === 'checking') {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <Animated.Image
          source={require('../assets/images/logo-light1.png')}
          style={[styles.splashLogo, { opacity: logoFade, transform: [{ scale: logoScale }] }]}
          resizeMode="contain"
        />
      </View>
    );
  }

  const heroHeight = Math.max(430, Math.min(height * 0.58, 540));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Visual hero */}
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.hero, { height: heroHeight, paddingTop: insets.top }]}
      >
        {/* Decorative background shapes */}
        <View style={[styles.orb, styles.orbLarge]} />
        <View style={[styles.orb, styles.orbSmall]} />
        <View style={styles.ring} />

        <Animated.View
          style={[
            styles.illustration,
            { opacity: contentFade, transform: [{ translateY: contentSlide }] },
          ]}
        >
          {/* Feature chips: laid out above and below the card so every one stays visible */}
          {CHIPS.map((chip, i) => (
            <Floating
              key={chip.key}
              style={[styles.chip, CHIP_POSITIONS[i]]}
              delay={i * 350}
              distance={6 + (i % 2) * 3}
            >
              <View style={styles.chipIcon}>
                <Ionicons name={chip.icon} size={16} color={COLORS.primary} />
              </View>
              <Text style={styles.chipText}>{chip.label}</Text>
            </Floating>
          ))}

          {/* Back card */}
          <View style={[styles.card, styles.cardBack]} />

          {/* Front card */}
          <Floating style={[styles.card, styles.cardFront]} distance={5}>
            <View style={styles.cardHeader}>
              <View style={styles.brandRow}>
                <Image_Logo />
                <Text style={styles.brandText}>Payton</Text>
              </View>
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={12} color={COLORS.onPrimary} />
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            </View>

            {/* Spending summary + mini chart */}
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryLabel}>Spent this month</Text>
                <Text style={styles.summaryAmount}>₱1,284</Text>
                <View style={styles.trendPill}>
                  <Ionicons name="trending-down" size={12} color={COLORS.primaryPressed} />
                  <Text style={styles.trendText}>12% vs last month</Text>
                </View>
              </View>

              <View style={styles.chart}>
                {[0.4, 0.62, 0.48, 0.8, 0.58, 1].map((h, i) => (
                  <View
                    key={i}
                    style={[
                      styles.chartBar,
                      {
                        height: 52 * h,
                        backgroundColor: i === 5 ? COLORS.primary : COLORS.primarySoft,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* AI insight */}
            <View style={styles.insight}>
              <View style={styles.insightIcon}>
                <Ionicons name="sparkles" size={12} color={COLORS.onPrimary} />
              </View>
              <Text style={styles.insightText} numberOfLines={1}>
                Your overall status is good! You spent 12% less than last month. Keep it up!
              </Text>
            </View>
          </Floating>
        </Animated.View>
      </LinearGradient>

      {/* Minimal copy + CTA */}
      <Animated.View
        style={[
          styles.bottom,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            opacity: contentFade,
          },
        ]}
      >
        <View style={styles.textBlock}>
          <Text style={styles.headline}>Track expense,{'\n'}easily with Payton</Text>
          <Text style={styles.subheadline}>Your AI-assisted financial management</Text>
        </View>

        <View>
          <Pressable
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            accessibilityLabel="Get started"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.onPrimary} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            hitSlop={8}
            style={styles.signInWrap}
          >
            
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function Image_Logo() {
  return (
    <Animated.Image
      source={require('../assets/images/logo-light1.png')}
      style={styles.cardLogo}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  // Splash
  splash: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: { width: 200, height: 200 },

  // Landing
  container: { flex: 1, backgroundColor: COLORS.background },

  // Hero
  hero: {
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
  },
  orbLarge: { width: 320, height: 320, top: -90, right: -110 },
  orbSmall: { width: 200, height: 200, bottom: -70, left: -70 },
  ring: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  illustration: {
    width: '100%',
    height: 350,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cards
  card: {
    position: 'absolute',
    width: 244,
    borderRadius: 24,
    backgroundColor: COLORS.background,
  },
  cardBack: {
    height: 196,
    backgroundColor: 'rgba(255,255,255,0.22)',
    transform: [{ rotate: '-8deg' }, { translateY: 6 }],
  },
  cardFront: {
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
    transform: [{ rotate: '3deg' }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLogo: { width: 32, height: 32 },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.3,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  aiBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.onPrimary },
  summaryRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  summaryAmount: {
    marginTop: 2,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  trendPill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.primarySoft,
  },
  trendText: { fontSize: 10, fontWeight: '700', color: COLORS.primaryPressed },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 52,
  },
  chartBar: { width: 9, borderRadius: 4 },
  insight: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  insightIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightText: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.text },

  // Chips
  chip: {
    position: 'absolute',
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: COLORS.background,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  // Bottom
  bottom: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  textBlock: { alignItems: 'center' },
  headline: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subheadline: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buttonPressed: { backgroundColor: COLORS.primaryPressed, transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 16, fontWeight: '700', color: COLORS.onPrimary },
  signInWrap: { alignItems: 'center', marginTop: 14 },
  footnote: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  footnoteLink: { color: COLORS.primary, fontWeight: '700' },
});
