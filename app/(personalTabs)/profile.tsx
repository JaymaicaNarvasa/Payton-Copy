// app/(personalTabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GradientBackground from '../../components/GradientBackground';
import { AlertConfig, PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { profileStyles as styles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

type MenuItem = { id: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string };
type MenuGroup = { title: string; items: MenuItem[] };

const MENU: MenuGroup[] = [
  {
    title: 'Account & Security',
    items: [
      { id: 'personal', label: 'Personal Details', icon: 'person-outline', route: '/profile/personal' },
      { id: 'password', label: 'Change Password', icon: 'shield-checkmark-outline', route: '/profile/change-password' },
      { id: 'logs', label: 'Activity Logs', icon: 'list-outline', route: '/profile/logs' },
    ],
  },
  {
    title: 'Data Ledger',
    items: [
      { id: 'archive', label: 'Archive Data', icon: 'archive-outline', route: '/profile/archive' },
      { id: 'export', label: 'Export Data', icon: 'cloud-download-outline', route: '/profile/export' },
    ],
  },
  {
    title: 'Support & Info',
    items: [
      { id: 'help', label: 'Help Desk', icon: 'chatbubbles-outline', route: '/profile/help' },
      { id: 'feedback', label: 'Send Feedback', icon: 'chatbox-ellipses-outline', route: '/profile/feedback' },
      { id: 'terms', label: 'Terms of Use', icon: 'document-attach-outline', route: '/profile/terms' },
      { id: 'about', label: 'App Version', icon: 'information-circle-outline', route: '/profile/about' },
    ],
  },
];

const ALERT_CLOSED: AlertConfig = { visible: false, title: '' };

export default function PersonalProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // single local-state alert (PaytonAlertDialog local-state API)
  const [alert, setAlert] = useState<AlertConfig>(ALERT_CLOSED);
  const closeAlert = useCallback(() => setAlert((p) => ({ ...p, visible: false })), []);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error('No active user session found.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', user.id)
        .single();
      if (profileError) throw profileError;

      if (profile) {
        setFullName(profile.full_name || '');
        setRole(profile.role || 'Personal');
        setAvatarUrl(profile.avatar_url || null);
      }
    } catch (error: any) {
      setAlert({
        visible: true,
        type: 'error',
        title: 'Profile Error',
        message: error?.message ?? 'Could not load your profile.',
        buttons: [{ text: 'Got it', onPress: closeAlert }],
      });
    } finally {
      setIsLoadingProfile(false);
      setIsRefreshing(false);
    }
  }, [closeAlert]);

  // refetch every time the screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchProfile();
  };

  const executeLogout = async () => {
    setIsLoggingOut(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('logs').insert({ user_id: user.id, details: 'signed out successfully.' });
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      closeAlert();
      router.replace('/');
    } catch (error: any) {
      setAlert({
        visible: true,
        type: 'error',
        title: 'Sign Out Failed',
        message: error?.message ?? 'Something went wrong. Please try again.',
        buttons: [{ text: 'Got it', onPress: closeAlert }],
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const confirmLogout = () =>
    setAlert({
      visible: true,
      type: 'warning',
      title: 'Sign Out',
      message: 'Are you sure you want to end your session? You will need to log back in to access your data.',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: closeAlert },
        { text: 'Sign Out', style: 'destructive', onPress: executeLogout },
      ],
    });

  if (isLoadingProfile) {
    return (
      <View style={[styles.container, styles.centerLoading]}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* gradient header */}
      <View style={[styles.modernHeader, { paddingTop: insets.top + theme.space[12] }]}>
        <View style={styles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity style={styles.backBtnTouchable} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Account</Text>
        <View style={{ width: 20 }} />
      </View>

      {/* content sheet sliding over the header */}
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
        >
          <View style={styles.modernHeroBlock}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
            ) : (
              <View style={styles.heroAvatarPlaceholder}>
                <Text style={styles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
              </View>
            )}
            <Text style={styles.heroName}>{fullName || 'User Account'}</Text>
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{role ? role.toUpperCase() : 'USER'}</Text>
            </View>
          </View>

          {MENU.map((group) => (
            <View key={group.title} style={styles.modernCardGroup}>
              <Text style={styles.groupContextLabel}>{group.title}</Text>
              <View style={styles.groupCard}>
                {group.items.map((item, index) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.rowItemFlat, index !== group.items.length - 1 && styles.rowDivider]}
                    onPress={() => router.push(item.route as any)}
                  >
                    <View style={styles.modernRowLeft}>
                      <View style={styles.iconWrapperSquare}>
                        <Ionicons name={item.icon} size={18} color={theme.colors.brand} />
                      </View>
                      <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSubtle} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.modernLogoutBtn} onPress={confirmLogout}>
            <Ionicons name="log-out-outline" size={18} color={theme.colors.dangerBright} style={{ marginRight: theme.space[8] }} />
            <Text style={styles.modernLogoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <PaytonAlertDialog {...alert} busy={isLoggingOut} onDismiss={closeAlert} />
    </View>
  );
}