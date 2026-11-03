// app/about.tsx
// Uses ONLY the shared profileStyles from constants/ui.styles.ts (same header + sheet as the Profile screen).
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { theme } from '../../constants/theme';
import { profileStyles as styles } from '../../constants/ui.styles';

const INFO = [
  { label: 'Database', value: 'Supabase v2.75' },
  { label: 'Framework', value: 'React Native v0.87' },
  { label: 'App Simulation', value: 'Expo v57.0.9' },
  { label: 'AI Model', value: 'Gemini 3.5 Flash Lite' },
];

export default function AboutScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Gradient header: gradient fill + "<" + title (same as Profile) */}
      <View style={styles.modernHeader}>
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>App Version</Text>
        <View style={styles.backBtnTouchable} />
      </View>

      {/* Mint sheet sliding over the gradient (same as Profile) */}
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.modernHeroBlock}>
            <View style={[styles.heroAvatarPlaceholder, { borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandDark, overflow: 'hidden' }]}>
              <Image source={require('../../assets/images/logo-light1.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
            <Text style={styles.heroName}>Payton Mobile Edition</Text>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>v1.0.0 (BETA)</Text>
            </View>
          </View>

          <View style={styles.modernCardGroup}>
            <View style={styles.groupCard}>
              {INFO.map((item) => (
                <View key={item.label} style={[styles.rowItemFlat, styles.rowDivider]}>
                  <Text style={[styles.rowPrimaryLabel, { color: theme.colors.textMuted }]}>{item.label}</Text>
                  <Text style={styles.rowPrimaryLabel}>{item.value}</Text>
                </View>
              ))}
              <View style={styles.rowItemFlat}>
                <Text style={[styles.rowPrimaryLabel, { color: theme.colors.textMuted }]}>System Status</Text>
                <Text style={[styles.rowPrimaryLabel, { color: theme.colors.success, fontFamily: theme.fontFamily.bold }]}>Operational</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.groupContextLabel, { textAlign: 'center', textTransform: 'none', marginTop: theme.space[24] }]}>
            © 2026 Payton. All rights reserved.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}