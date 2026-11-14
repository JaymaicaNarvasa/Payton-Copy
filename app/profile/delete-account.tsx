// app/profile/delete-account.tsx
// Permanent account deletion. Re-enter password + type DELETE, confirm in a PaytonAlert dialog,
// then the `delete-account` Edge Function removes the data and the login.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { AlertConfig, PaytonAlertDialog } from '../../components/PaytonAlert';
import { FormField } from '../../components/profile/FormField';
import InlineMessage, { FormMessage } from '../../components/profile/InlineMessage';
import PrimaryButton from '../../components/profile/PrimaryButton';
import ProfileScreen from '../../components/profile/ProfileScreen';
import { theme } from '../../constants/theme';
import { incomeStyles, profileStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

type FieldErrors = { password?: string; confirm?: string };

const CONFIRM_WORD = 'DELETE';
const ALERT_CLOSED: AlertConfig = { visible: false, title: '' };

const WILL_BE_DELETED = [
  'Your profile, photo and sign-in',
  'Income, expenses, budgets, categories and reminders',
  'Allowances, sponsor/spender links and sponsor wallet history',
  'Split expenses, friends, feedback, AI chat and activity logs',
];

export default function DeleteAccountScreen() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formMessage, setFormMessage] = useState<FormMessage>(null);

  const [alert, setAlert] = useState<AlertConfig>(ALERT_CLOSED);
  const closeAlert = useCallback(() => setAlert((p) => ({ ...p, visible: false })), []);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const clearError = (key: keyof FieldErrors) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    if (formMessage) setFormMessage(null);
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!password) next.password = 'Enter your password to continue.';
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) next.confirm = `Type ${CONFIRM_WORD} to confirm.`;
    return next;
  };

  const executeDelete = async () => {
    closeAlert();
    setIsDeleting(true);
    setFormMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: { password } });

      if (error) {
        // FunctionsHttpError carries the response; pull our friendly message out of it.
        let message = 'Something went wrong. Please try again.';
        let field: string | undefined;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) message = body.error;
          field = body?.field;
        } catch {
          /* keep the default message */
        }
        if (field === 'password') {
          setErrors({ password: message });
          passwordRef.current?.focus();
        } else {
          setFormMessage({ type: 'error', message });
        }
        return;
      }
      if (!data?.ok) throw new Error('Account could not be deleted.');

      // Account is gone on the server; clear the local session (it may already be invalid).
      await supabase.auth.signOut().catch(() => {});

      setAlert({
        visible: true,
        type: 'success',
        title: 'Account Deleted',
        message: 'Your Payton account and its data have been permanently deleted.',
        buttons: [
          {
            text: 'OK',
            onPress: () => {
              closeAlert();
              router.replace('/');
            },
          },
        ],
      });
    } catch (e: any) {
      setFormMessage({ type: 'error', message: e?.message || 'An unexpected error occurred.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = () => {
    setFormMessage(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.password) return passwordRef.current?.focus();
    if (nextErrors.confirm) return confirmRef.current?.focus();

    setAlert({
      visible: true,
      type: 'warning',
      title: 'Delete Account Forever?',
      message: 'This cannot be undone. All of your Payton data will be permanently removed.',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: closeAlert },
        { text: 'Delete Forever', style: 'destructive', onPress: executeDelete },
      ],
    });
  };

  return (
    <ProfileScreen
      title="Delete Account"
      onBack={() => router.back()}
      keyboardAware
      footer={<PrimaryButton label="DELETE MY ACCOUNT" onPress={handleDelete} loading={isDeleting} />}
    >
      <View style={profileStyles.modernCardGroup}>
        {/* Warning intro */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.space[16] }}>
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
            <Ionicons name="warning-outline" size={20} color={theme.colors.dangerBright} />
          </View>
          <Text style={[incomeStyles.toggleSubtext, { flex: 1, lineHeight: 20 }]}>
            Deleting your account is permanent. We cannot recover your data afterwards.
          </Text>
        </View>

        {/* What gets removed */}
        <View style={[profileStyles.groupCard, { padding: theme.space[16], marginBottom: theme.space[20] }]}>
          <Text style={[profileStyles.rowPrimaryLabel, { marginBottom: theme.space[8] }]}>This will delete:</Text>
          {WILL_BE_DELETED.map((line) => (
            <View key={line} style={{ flexDirection: 'row', marginTop: theme.space[6] }}>
              <Ionicons
                name="close-circle-outline"
                size={16}
                color={theme.colors.dangerBright}
                style={{ marginRight: theme.space[8], marginTop: 2 }}
              />
              <Text style={[incomeStyles.toggleSubtext, { flex: 1, lineHeight: 20 }]}>{line}</Text>
            </View>
          ))}
          <Text style={[incomeStyles.toggleSubtext, { marginTop: theme.space[12], lineHeight: 20 }]}>
            Sponsors and spenders linked to you will lose their link and any allowances between you. Export your
            data first if you want a copy.
          </Text>
        </View>

        <FormField
          ref={passwordRef}
          label="Password"
          icon="lock-closed-outline"
          placeholder="Enter your password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            clearError('password');
          }}
          error={errors.password}
          passwordToggle
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          editable={!isDeleting}
        />

        <FormField
          ref={confirmRef}
          label={`Type ${CONFIRM_WORD} to confirm`}
          icon="trash-outline"
          placeholder={CONFIRM_WORD}
          value={confirmText}
          onChangeText={(t) => {
            setConfirmText(t);
            clearError('confirm');
          }}
          error={errors.confirm}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleDelete}
          editable={!isDeleting}
        />

        {formMessage ? (
          <InlineMessage
            type={formMessage.type}
            message={formMessage.message}
            onDismiss={formMessage.type === 'error' ? () => setFormMessage(null) : undefined}
          />
        ) : null}
      </View>

      <PaytonAlertDialog {...alert} busy={isDeleting} onDismiss={closeAlert} />
    </ProfileScreen>
  );
}
