// app/profile/about.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ComponentProps } from 'react';
import { Image, Text, View } from 'react-native';

import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { profileStyles as styles } from '../../constants/ui.styles';

type IconName = ComponentProps<typeof Ionicons>['name'];

const INFO: { label: string; value: string; icon: IconName }[] = [
  { label: 'Database', value: 'Supabase v2.75', icon: 'server-outline' },
  { label: 'Framework', value: 'React Native v0.87', icon: 'logo-react' },
  { label: 'App Simulation', value: 'Expo v57.0.9', icon: 'phone-portrait-outline' },
  { label: 'AI Model', value: 'Gemini 3.5 Flash Lite', icon: 'sparkles-outline' },
];

function IconBox({ name }: { name: IconName }) {
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.brandWash,
        marginRight: theme.space[12],
      }}
    >
      <Ionicons name={name} size={16} color={theme.colors.brand} />
    </View>
  );
}

export default function AboutScreen() {
  const router = useRouter();

  return (
    <ProfileScreen title="App Version" onBack={() => router.back()}>
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconBox name={item.icon} />
                <Text style={[styles.rowPrimaryLabel, { color: theme.colors.textMuted }]}>{item.label}</Text>
              </View>
              <Text style={styles.rowPrimaryLabel}>{item.value}</Text>
            </View>
          ))}
          <View style={styles.rowItemFlat}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconBox name="pulse-outline" />
              <Text style={[styles.rowPrimaryLabel, { color: theme.colors.textMuted }]}>System Status</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.success,
                  marginRight: 6,
                }}
              />
              <Text style={[styles.rowPrimaryLabel, { color: theme.colors.success, fontFamily: theme.fontFamily.bold }]}>
                Operational
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={[styles.groupContextLabel, { textAlign: 'center', textTransform: 'none', marginTop: theme.space[24] }]}>
        © 2026 Payton. All rights reserved.
      </Text>
    </ProfileScreen>
  );
}
