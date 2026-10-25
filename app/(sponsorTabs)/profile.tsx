// app/(sponsorTabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
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

export const colors = {
  headerDark: '#1F4F59',  
  headerDarker: '#173D45', 
  primary: '#3AA39F',      
  primaryTint: '#e9fcfb',
  cyan: '#9be5d9',
  olive: '#7EA00E',
  oliveTint: '#F3F6E4',    
  yellowGreen: '#DCD964',
  positive: '#0E7C5A',
  positiveBg: '#E1F5EC',
  danger: '#DC2626',
  textDark: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  background: '#F8FAFC',
  overlay: 'rgba(9, 20, 19, 0.5)',
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
        <StatusBar style="light" />
        <ActivityIndicator size="small" color="#3AA39F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.modernHeader}>
        <TouchableOpacity style={styles.backBtnTouchable} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Account</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh} 
            tintColor="#3AA39F" 
            colors={['#3AA39F']} 
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
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
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
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
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
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          style={styles.modernLogoutBtn} 
          onPress={() => setShowLogoutModal(true)} 
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
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
              <Ionicons name="log-out-outline" size={26} color="#EF4444" />
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
                  <ActivityIndicator size="small" color="#FFFFFF" />
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
    backgroundColor: '#f5fcfa',
    borderRadius: 12,
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 110 },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  modernHeroBlock: { alignItems: 'center', marginTop: 30, marginBottom: 15 },
  heroAvatar: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#E2E8F0' },
  heroAvatarPlaceholder: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '600', color: '#475569' },
  heroName: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginTop: 14, letterSpacing: -0.5 },
  badgeContainer: { backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 11, marginTop: 8, borderWidth: 1, borderColor: '#0E7C5A' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#0E7C5A', letterSpacing: 0.5 },
  modernCardGroup: { paddingHorizontal: 20, marginTop: 24 },
  groupContextLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, paddingLeft: 4 },
  modernRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  iconWrapperSquare: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  rowPrimaryLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    shadowColor: '#0F172A',
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
    borderBottomWidth: 3,
    borderBottomColor: '#F1F5F9',
  },
  modernLogoutBtn: {
    backgroundColor: '#FEF2F2', 
    borderRadius: 24,                             
    padding: 18,                     
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffb8b8',       
    marginTop: 30,            
    marginHorizontal: 24,      
  },
  modernLogoutText: {
    color: '#EF4444',            
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabledButton: { 
    backgroundColor: '#F1F5F9', 
    borderColor: '#E2E8F0' 
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContentCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalConfirmButton: {
    backgroundColor: '#EF4444',
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});