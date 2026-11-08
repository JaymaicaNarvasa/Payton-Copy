// app/profile/change-password.tsx
// Validation messages appear directly below each input. Server-side results (success / unexpected errors)
// appear in an inline banner under the fields. All Supabase / business logic is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FormField } from '../../components/profile/FormField';
import InlineMessage, { FormMessage } from '../../components/profile/InlineMessage';
import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

type FieldErrors = { old?: string; next?: string; confirm?: string };

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formMessage, setFormMessage] = useState<FormMessage>(null);

  const oldRef = useRef<TextInput>(null);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const clearError = (key: keyof FieldErrors) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    if (formMessage) setFormMessage(null);
  };

  // Helper function to insert logs into Supabase
  const logActivity = async (userId: string, details: string) => {
    try {
      await supabase.from('logs').insert([
        {
          user_id: userId,
          details: details,
        },
      ]);
    } catch (logError) {
      console.error('Failed to write log:', logError);
    }
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!oldPassword) next.old = 'Enter your current password.';
    if (!newPassword) next.next = 'Enter a new password.';
    else if (newPassword.length < 8) next.next = 'Your new password must be at least 8 characters long.';
    if (!confirmPassword) next.confirm = 'Confirm your new password.';
    else if (newPassword && newPassword !== confirmPassword) next.confirm = 'New passwords do not match. Please verify.';
    return next;
  };

  const handleChangePassword = async () => {
    setFormMessage(null);

    const nextErrors = validate();
    setErrors(nextErrors);
    const firstInvalid = nextErrors.old ? oldRef : nextErrors.next ? newRef : nextErrors.confirm ? confirmRef : null;
    if (firstInvalid) {
      firstInvalid.current?.focus();
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
        setErrors({ old: 'The current password you entered is incorrect.' });
        oldRef.current?.focus();
        return;
      }

      // 3. Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      // Log successful password change before signing out
      await logActivity(user.id, `updated password successfully.`);

      // 4. Log out the user automatically after a successful update
      await supabase.auth.signOut();

      // Log automatic sign out
      await logActivity(user.id, `signed out successfully.`);

      setCompleted(true);
      setFormMessage({ type: 'success', message: 'Password updated successfully! Redirecting to login...' });

      // Delay navigation slightly so the user can read the success message
      setTimeout(() => {
        router.replace('/');
      }, 1500);
    } catch (error: any) {
      setFormMessage({ type: 'error', message: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <ProfileScreen
      title="Change Password"
      onBack={() => router.back()}
      keyboardAware
      footer={
        <PrimaryButton
          label="UPDATE PASSWORD"
          onPress={handleChangePassword}
          loading={isUpdating}
          disabled={completed}
        />
      }
    >
      <View style={profileStyles.modernCardGroup}>
        {/* Intro */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.space[20] }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brandWash,
              marginRight: theme.space[12],
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.brand} />
          </View>
          <Text style={[incomeStyles.toggleSubtext, { flex: 1, lineHeight: 20 }]}>
            Enter your current password and a new password to keep your Payton account secure.
          </Text>
        </View>

        <FormField
          ref={oldRef}
          label="Current Password"
          icon="lock-closed-outline"
          placeholder="Enter current password"
          value={oldPassword}
          onChangeText={(t) => {
            setOldPassword(t);
            clearError('old');
          }}
          error={errors.old}
          passwordToggle
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => newRef.current?.focus()}
          editable={!isUpdating && !completed}
        />

        <FormField
          ref={newRef}
          label="New Password"
          icon="lock-closed-outline"
          placeholder="Min. 8 characters"
          value={newPassword}
          onChangeText={(t) => {
            setNewPassword(t);
            clearError('next');
          }}
          error={errors.next}
          hint="Use at least 8 characters."
          passwordToggle
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          editable={!isUpdating && !completed}
        />

        <FormField
          ref={confirmRef}
          label="Confirm New Password"
          icon="lock-closed-outline"
          placeholder="Repeat new password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            clearError('confirm');
          }}
          error={errors.confirm}
          passwordToggle
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleChangePassword}
          editable={!isUpdating && !completed}
        />

        {formMessage ? (
          <InlineMessage
            type={formMessage.type}
            message={formMessage.message}
            onDismiss={formMessage.type === 'error' ? () => setFormMessage(null) : undefined}
          />
        ) : null}
      </View>
    </ProfileScreen>
  );
}
