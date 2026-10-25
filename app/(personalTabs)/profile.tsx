// app/(personalTabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { theme } from '@/constants/theme';
import { profileStyles as styles } from '@/constants/ui.styles';
import { GradientBackground } from '../../components/GradientBackground';
import { useAlert } from '../../components/PaytonAlert';
import { supabase } from '../../lib/supabase';

export const colors = {
  headerDark: theme.colors.brand,  
  headerDarker: theme.colors.brandDark, 
  primary: theme.colors.accent,      
  primaryTint: theme.colors.accentTint,
  cyan: theme.colors.accentSoft,
  olive: theme.colors.olive,
  oliveTint: theme.colors.oliveTint,    
  yellowGreen: theme.colors.lime,
  positive: theme.colors.success,
  positiveBg: theme.colors.successBg,
  danger: theme.colors.danger,
  textDark: theme.colors.textStrong,
  textMuted: theme.colors.textMuted,
  textFaint: theme.colors.textSubtle,
  border: theme.colors.border,
  surface: theme.colors.white,
  surfaceMuted: theme.colors.background,
  background: theme.colors.background,
  overlay: theme.colors.overlay,
};

export default function PersonalProfileScreen() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // State for controlling the custom sign-out modal visibility
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Automatically fetch profile data every time the screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("No active user session found.");

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
      showAlert({ type: 'error', title: 'Profile Error', message: error.message });
    } finally {
      setIsLoadingProfile(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchProfile();
  };

  const executeLogout = async () => {
    setIsLoggingOut(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        await supabase.from('logs').insert({
          user_id: user.id,
          details: `signed out successfully .`,
        });
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setShowLogoutModal(false);
      router.replace('/');
    } catch (error: any) {
      showAlert({ type: 'error', title: 'Sign-out Failed', message: error.message });
    } finally {
      setIsLoggingOut(false);
    }
  };

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
      <View style={styles.modernHeader}>
        <View style={styles.headerGradientFill}>
          <GradientBackground />
        </View>
        <TouchableOpacity style={styles.backBtnTouchable} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Account</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView 
        style={styles.sheet}
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
          <Text style={styles.heroName}>{fullName || "User Account"}</Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{role ? role.toUpperCase() : "USER"}</Text>
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Account & Security</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'personal', label: 'Personal Details', icon: 'person-outline', action: () => router.push('/profile/personal' as any) },
              { id: 'password', label: 'Change Password', icon: 'shield-checkmark-outline', action: () => router.push('/profile/change-password' as any) },
              { id: 'logs', label: 'Activity Logs', icon: 'list-outline', action: () => router.push('/profile/logs' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color={theme.colors.black} />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.brandDark} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Data Ledger</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'archive', label: 'Archive Data', icon: 'archive-outline', action: () => router.push('/profile/archive' as any) },
              { id: 'export', label: 'Export Data', icon: 'cloud-download-outline', action: () => router.push('/profile/export' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color={theme.colors.black} />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.brandDark} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Support & Info</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'help', label: 'Help Desk', icon: 'chatbubbles-outline', action: () => router.push('/profile/help' as any) },
              { id: 'feedback', label: 'Send Feedback', icon: 'chatbox-ellipses-outline', action: () => router.push('/profile/feedback' as any) },
              { id: 'terms', label: 'Terms of Use', icon: 'document-attach-outline', action: () => router.push('/profile/terms' as any) },
              { id: 'about', label: 'App Version', icon: 'information-circle-outline', action: () => router.push('/profile/about' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color={theme.colors.black} />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.brandDark} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          style={styles.modernLogoutBtn} 
          onPress={() => setShowLogoutModal(true)} 
        >
          <Ionicons name="log-out-outline" size={18} color={theme.colors.dangerBright} style={{ marginRight: theme.space[8] }} />
          <Text style={styles.modernLogoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Modern Professional Custom Sign Out Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isLoggingOut && setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            
            {/* Top Icon Badge */}
            <View style={styles.modalIconContainer}>
              <Ionicons name="log-out-outline" size={26} color={theme.colors.dangerBright} />
            </View>

            {/* Title & Subtitle */}
            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to end your session? You will need to log back in to access your data.
            </Text>

            {/* Actions */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, isLoggingOut && styles.disabledButton]}
                onPress={executeLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

    </View>
  );
}