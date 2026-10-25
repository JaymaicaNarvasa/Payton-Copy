// app/profile/change-password.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../(spenderTabs)/profile';
import { supabase } from '../../lib/supabase';

type MessageType = 'error' | 'success' | null;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Inline message state
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);

  // Helper function to insert logs into Supabase
  const logActivity = async (userId: string, details: string) => {
    try {
      await supabase.from('logs').insert([
        {
          user_id: userId,
          details: details,
        }
      ]);
    } catch (logError) {
      console.error('Failed to write log:', logError);
    }
  };

  const handleChangePassword = async () => {
    // Clear previous inline messages on new submission attempt
    setMessage(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields to proceed.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Your new password must be at least 8 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match. Please verify.' });
      return;
    }

    try {
      setIsUpdating(true);

      // 1. Get current user's info & session id
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email || !user?.id) {
        throw new Error('Unable to identify the current user session. Please log in again.');
      }

      // 2. Verify old password via sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });

      if (signInError) {
        // Log failed password change attempt due to incorrect old password
        await logActivity(user.id, `entered an incorrect current password.`);
        throw new Error('The current password you entered is incorrect.');
      }

      // 3. Update password
      const { error: updateError } = await supabase.auth.updateUser({ 
        password: newPassword 
      });
      if (updateError) throw updateError;

      // Log successful password change before signing out
      await logActivity(user.id, `updated password successfully.`);

      // 4. Log out the user automatically after a successful update
      await supabase.auth.signOut();
      
      // Log automatic sign out
      await logActivity(user.id, `signed out successfully.`);

      setMessage({ 
        type: 'success', 
        text: 'Password updated successfully! Redirecting to login...' 
      });

      // Delay navigation slightly so the user can read the success message
      setTimeout(() => {
        router.replace('/');
      }, 1500);

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Change Password</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editScrollContent}>
        <View style={styles.instructionContainer}>
          <Text style={styles.instructionText}>
            Enter your current password and a new password to keep your Payton account secure.
          </Text>
        </View>

        {/* Modern Inline Alert Banner */}
        {message && (
          <View style={[
            styles.alertBanner, 
            message.type === 'success' ? styles.alertSuccess : styles.alertError
          ]}>
            <Ionicons 
              name={message.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} 
              size={18} 
              color={message.type === 'success' ? '#065F46' : '#991B1B'} 
              style={styles.alertIcon}
            />
            <Text style={[
              styles.alertText, 
              message.type === 'success' ? styles.alertTextSuccess : styles.alertTextError
            ]}>
              {message.text}
            </Text>
          </View>
        )}

        <View style={styles.formCardContainer}>
          {/* Current Password Input */}
          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>Current Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput 
                style={styles.pillTextInputInside} 
                value={oldPassword} 
                onChangeText={setOldPassword} 
                placeholder="Enter current password"
                secureTextEntry={!showOldPassword}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity onPress={() => setShowOldPassword(!showOldPassword)} style={styles.eyeIconBtn}>
                <Ionicons name={showOldPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password Input */}
          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>New Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput 
                style={styles.pillTextInputInside} 
                value={newPassword} 
                onChangeText={setNewPassword} 
                placeholder="Min. 8 characters"
                secureTextEntry={!showNewPassword}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeIconBtn}>
                <Ionicons name={showNewPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password Input */}
          <View style={styles.pillInputBlock}>
            <Text style={styles.pillInputLabel}>Confirm New Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput 
                style={styles.pillTextInputInside} 
                value={confirmPassword} 
                onChangeText={setConfirmPassword} 
                placeholder="Repeat new password"
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIconBtn}>
                <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Save Action Button */}
      <View style={styles.bottomBtnContainer}>
        <TouchableOpacity 
          style={[styles.pillPrimaryActionBtn, isUpdating && styles.disabledButton]} 
          onPress={handleChangePassword}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.pillPrimaryActionBtnText}>UPDATE PASSWORD</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
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
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  editScrollContent: { paddingBottom: 24, flexGrow: 1 },
  instructionContainer: { paddingHorizontal: 24, marginTop: 24, marginBottom: 16 },
  instructionText: { fontSize: 14, color: '#64748B', lineHeight: 20, fontWeight: '400' },
  
  // Inline Alert Styles
  alertBanner: {
    marginHorizontal: 24,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  alertError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  alertSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#D1FAE5',
  },
  alertIcon: {
    marginRight: 10,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  alertTextError: {
    color: '#991B1B',
  },
  alertTextSuccess: {
    color: '#065F46',
  },

  formCardContainer: { paddingHorizontal: 24, gap: 24 },
  pillInputBlock: { gap: 8 },
  pillInputLabel: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe0e6',
    borderRadius: 30,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
  },
  pillTextInputInside: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },
  eyeIconBtn: { padding: 4 },

  bottomBtnContainer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 },
  pillPrimaryActionBtn: {
    backgroundColor: '#173D45',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPrimaryActionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  disabledButton: { backgroundColor: '#CBD5E1' }
});