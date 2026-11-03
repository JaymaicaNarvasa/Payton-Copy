// app/profile/change-password.tsx
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet), resetPasswordStyles (password input / eye icon / button),
//   incomeStyles (instruction text). Messages are shown with the shared PaytonAlertDialog.
// All Supabase / business logic below is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { AlertType, PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles, resetPasswordStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Shared alert dialog (local-state API) - replaces the old inline banner
  const [alert, setAlert] = useState<{ visible: boolean; type: AlertType; title: string; message: string }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertType, title: string, message: string) =>
    setAlert({ visible: true, type, title, message });
  const hideAlert = () => setAlert((prev) => ({ ...prev, visible: false }));

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
    // Clear any previous alert on a new submission attempt
    hideAlert();

    if (!oldPassword || !newPassword || !confirmPassword) {
      showAlert('warning', 'Missing Information', 'Please fill in all fields to proceed.');
      return;
    }
    if (newPassword.length < 8) {
      showAlert('warning', 'Password Too Short', 'Your new password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('error', 'Passwords Do Not Match', 'New passwords do not match. Please verify.');
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

      showAlert('success', 'Password Updated', 'Password updated successfully! Redirecting to login...');

      // Delay navigation slightly so the user can read the success message
      setTimeout(() => {
        router.replace('/');
      }, 1500);

    } catch (error: any) {
      showAlert('error', 'Update Failed', error.message || 'An unexpected error occurred.');
    } finally {
      setIsUpdating(false);
    }
  };

  // One password field (label + lock icon + input + eye toggle), all from resetPasswordStyles
  const renderField = (
    label: string,
    value: string,
    onChange: (t: string) => void,
    placeholder: string,
    visible: boolean,
    toggle: () => void,
  ) => (
    <View style={{ marginBottom: theme.space[16] }}>
      <Text style={profileStyles.groupContextLabel}>{label}</Text>
      <View style={resetPasswordStyles.inputWrapper}>
        <Ionicons name="lock-closed-outline" size={20} color={theme.colors.auth.greenDark} style={resetPasswordStyles.inputIcon} />
        <TextInput
          style={resetPasswordStyles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          secureTextEntry={!visible}
          placeholderTextColor={theme.colors.auth.placeholder}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={toggle} style={resetPasswordStyles.eyeIcon}>
          <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={20} color={theme.colors.auth.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={profileStyles.container}>
      <StatusBar style="light" />

      {/* Gradient header (same as Profile / About) */}
      <View style={profileStyles.modernHeader}>
        <View style={profileStyles.headerGradientFill} pointerEvents="none">
          <GradientBackground />
        </View>
        <TouchableOpacity onPress={() => router.back()} style={profileStyles.backBtnTouchable} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitleCentered}>Change Password</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[24] }]}
        >
          <View style={profileStyles.modernCardGroup}>
            <Text style={incomeStyles.confirmMessage}>
              Enter your current password and a new password to keep your Payton account secure.
            </Text>

            {renderField('Current Password', oldPassword, setOldPassword, 'Enter current password', showOldPassword, () => setShowOldPassword(!showOldPassword))}
            {renderField('New Password', newPassword, setNewPassword, 'Min. 8 characters', showNewPassword, () => setShowNewPassword(!showNewPassword))}
            {renderField('Confirm New Password', confirmPassword, setConfirmPassword, 'Repeat new password', showConfirmPassword, () => setShowConfirmPassword(!showConfirmPassword))}
          </View>
        </ScrollView>

        {/* Bottom Save Action Button */}
        <View style={{ paddingHorizontal: theme.space[20], paddingBottom: theme.space[24] }}>
          <TouchableOpacity
            style={[resetPasswordStyles.primaryButton, isUpdating && profileStyles.disabledButton]}
            onPress={handleChangePassword}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={resetPasswordStyles.buttonText}>UPDATE PASSWORD</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Shared Payton alert (empty fields, validation, errors, success) */}
      <PaytonAlertDialog
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onDismiss={hideAlert}
      />
    </View>
  );
}