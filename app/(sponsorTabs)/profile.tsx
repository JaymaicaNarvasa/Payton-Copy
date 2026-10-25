// app/(sponsorTabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { supabase } from '../../lib/supabase';

/* ---------- Design Tokens ---------- */
const COLORS = {
  bgLight: '#F3F4F6',
  lightGreen: '#C0E6BA',
  mediumGreen: '#4CA771',
  darkTeal: '#013237',
  bg: '#F9FAFB',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textPrimary: '#111827',
  textMuted: '#6B7280',
  danger: '#DC2626',
  borderLight: '#E5E7EB',
  success: '#2E7D32',
};

export default function SponsorProfileScreen() {
  const router = useRouter();
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
        setRole(profile.role || 'Sponsor');
        setAvatarUrl(profile.avatar_url || null);
      }
    } catch (error: any) {
      Alert.alert("Profile Error", error.message);
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
          details: `signed out successfully.`,
        });
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setShowLogoutModal(false);
      router.replace('/');
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <View style={[styles.container, styles.centerLoading]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color={COLORS.textPrimary} />
      </View>
    );
  }

  const initials = fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const roleText = (role || 'Sponsor').toUpperCase();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER */}
      <LinearGradient
        colors={[COLORS.lightGreen, COLORS.bgLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.heroContainer}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={COLORS.darkTeal} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.profileHeroContent}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
          ) : (
            <View style={styles.heroAvatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.heroName} numberOfLines={1}>{fullName || "User Account"}</Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{roleText}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh} 
            tintColor={COLORS.textPrimary} 
            colors={[COLORS.textPrimary]} 
          />
        }
      >
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
                activeOpacity={0.7}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color={COLORS.textPrimary} />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
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
                activeOpacity={0.7}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color={COLORS.textPrimary} />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
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
                activeOpacity={0.7}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color={COLORS.textPrimary} />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          style={styles.modernLogoutBtn} 
          onPress={() => setShowLogoutModal(true)} 
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={COLORS.danger} style={{ marginRight: 8 }} />
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
            <View style={styles.modalIconContainer}>
              <Ionicons name="log-out-outline" size={24} color={COLORS.danger} />
            </View>

            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to end your session? You will need to log back in to access your data.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowLogoutModal(false)}
                disabled={isLoggingOut}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, isLoggingOut && styles.disabledButton]}
                onPress={executeLogout}
                disabled={isLoggingOut}
                activeOpacity={0.8}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
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

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bg,
  },
  centerLoading: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  heroContainer: {
    paddingTop: (Platform.OS === 'android' ? 24 : 44) + 10,
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkTeal,
  },
  profileHeroContent: {
    alignItems: 'center',
    marginTop: 10,
  },
  scrollContent: { 
    paddingBottom: 110,
    paddingTop: 10,
  },
  heroAvatar: { 
    width: 76, 
    height: 76, 
    borderRadius: 38, 
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  heroAvatarPlaceholder: { 
    width: 76, 
    height: 76, 
    borderRadius: 38, 
    backgroundColor: COLORS.white, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  avatarInitials: { 
    fontSize: 22, 
    fontWeight: '700', 
    color: COLORS.darkTeal,
  },
  heroName: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: COLORS.darkTeal, 
    marginTop: 10, 
  },
  badgeContainer: { 
    backgroundColor: COLORS.darkTeal, 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 12, 
    marginTop: 6, 
  },
  badgeText: { 
    fontSize: 10, 
    fontWeight: '700', 
    color: COLORS.white, 
    letterSpacing: 0.6,
  },
  modernCardGroup: { 
    paddingHorizontal: 20, 
    marginTop: 20, 
  },
  groupContextLabel: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: COLORS.textMuted, 
    textTransform: 'uppercase', 
    marginBottom: 8, 
    letterSpacing: 0.6, 
    paddingLeft: 4,
  },
  groupCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  rowItemFlat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modernRowLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1, 
    paddingRight: 10 
  },
  iconWrapperSquare: { 
    width: 32, 
    height: 32, 
    borderRadius: 10,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  rowPrimaryLabel: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: COLORS.textPrimary,
  },
  modernLogoutBtn: {
    backgroundColor: '#FEF2F2', 
    borderRadius: 18,                             
    padding: 16,                     
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',       
    marginTop: 24,            
    marginHorizontal: 20,      
  },
  modernLogoutText: {
    color: COLORS.danger,            
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabledButton: { 
    opacity: 0.6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContentCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 5,
  },
  modalIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalConfirmButton: {
    backgroundColor: COLORS.danger,
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
});