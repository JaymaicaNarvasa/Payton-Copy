// app/profile/about.tsx
// Version info comes from app.json at runtime; status comes from the latest system_heartbeat row.
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';

import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { profileStyles as styles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Treat the system as down if the newest heartbeat is older than this.
// Set it to a bit more than twice the interval of the job that writes system_heartbeat.
const HEARTBEAT_STALE_MS = 15 * 60 * 1000;

type SystemStatus = 'checking' | 'operational' | 'disrupted' | 'unknown';

const config = Constants.expoConfig;
const APP_VERSION = config?.version ?? '1.0.0';
const BUILD_NUMBER =
  Platform.OS === 'ios' ? config?.ios?.buildNumber : config?.android?.versionCode != null ? String(config.android.versionCode) : undefined;
const RELEASE_STAGE = String(config?.extra?.releaseStage ?? '').toUpperCase(); // e.g. "BETA"; empty at launch

const INFO: { label: string; value: string; icon: IconName }[] = [
  { label: 'Version', value: APP_VERSION, icon: 'pricetag-outline' },
  { label: 'Build', value: BUILD_NUMBER || '-', icon: 'construct-outline' },
  {
    label: 'Platform',
    value: `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
    icon: 'phone-portrait-outline',
  },
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
  const [status, setStatus] = useState<SystemStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('system_heartbeat')
        .select('beat_at')
        .order('beat_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data?.beat_at) return setStatus('unknown');

      const age = Date.now() - new Date(data.beat_at).getTime();
      setStatus(age <= HEARTBEAT_STALE_MS ? 'operational' : 'disrupted');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusView: Record<SystemStatus, { label: string; color: string }> = {
    checking: { label: 'Checking...', color: theme.colors.textMuted },
    operational: { label: 'Operational', color: theme.colors.success },
    disrupted: { label: 'Service disruption', color: theme.colors.danger },
    unknown: { label: 'Unavailable', color: theme.colors.textMuted },
  };
  const { label: statusLabel, color: statusColor } = statusView[status];

  return (
    <ProfileScreen title="App Version" onBack={() => router.back()}>
      <View style={styles.modernHeroBlock}>
        <View style={[styles.heroAvatarPlaceholder, { borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandDark, overflow: 'hidden' }]}>
          <Image source={require('../../assets/images/logo-light1.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
        <Text style={styles.heroName}>Payton Mobile Edition</Text>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{`v${APP_VERSION}${RELEASE_STAGE ? ` (${RELEASE_STAGE})` : ''}`}</Text>
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
                  backgroundColor: statusColor,
                  marginRight: 6,
                }}
              />
              <Text style={[styles.rowPrimaryLabel, { color: statusColor, fontFamily: theme.fontFamily.bold }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={[styles.groupContextLabel, { textAlign: 'center', textTransform: 'none', marginTop: theme.space[24] }]}>
        {`© ${new Date().getFullYear()} Payton. All rights reserved.`}
      </Text>
    </ProfileScreen>
  );
}
