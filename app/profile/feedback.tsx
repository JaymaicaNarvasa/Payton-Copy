// app/profile/feedback.tsx - Send Feedback screen
// Built ONLY from existing exports of constants/ui.styles.ts:
//   profileStyles (gradient header + mint sheet), incomeStyles (input, helper text, disabled state),
//   monitoringStyles (filter chips), resetPasswordStyles (primary button).
// Messages are shown with the shared PaytonAlertDialog. Supabase / submit logic below is unchanged.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import GradientBackground from '../../components/GradientBackground';
import { AlertType, PaytonAlertDialog } from '../../components/PaytonAlert';
import { theme } from '../../constants/theme';
import { incomeStyles, monitoringStyles, profileStyles, resetPasswordStyles } from '../../constants/ui.styles';
import { supabase } from '../../lib/supabase';

const CATEGORIES = [
  { value: 'bug', label: 'Bug or problem' },
  { value: 'feature', label: 'Feature idea' },
  { value: 'account', label: 'Account issue' },
  { value: 'ai', label: 'AI assistant' },
  { value: 'other', label: 'Other' },
] as const;

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

export default function FeedbackScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<string>('other');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const locked = useRef(false); // blocks a second tap before the first request finishes

  // Shared alert dialog (local-state API) - replaces the old inline banner
  const [alert, setAlert] = useState<{ visible: boolean; type: AlertType; title: string; message: string }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });
  const showAlert = (type: AlertType, title: string, text: string) =>
    setAlert({ visible: true, type, title, message: text });
  const hideAlert = () => setAlert((prev) => ({ ...prev, visible: false }));

  const trimmed = message.trim();
  const canSend = trimmed.length >= MIN_LENGTH && !sending;

  async function handleSend() {
    if (locked.current) return;
    if (trimmed.length < MIN_LENGTH) {
      showAlert('warning', 'Message Too Short', `Please write at least ${MIN_LENGTH} characters.`);
      return;
    }
    locked.current = true;
    setSending(true);
    hideAlert();

    // user_id is filled in by the database from the signed-in session; it is never sent from here.
    const { error } = await supabase.from('user_feedback').insert({ category, message: trimmed });

    locked.current = false;
    setSending(false);

    if (error) {
      const known =
        error.message.includes('already sent') || error.message.includes('limit reached') ? error.message : null;
      showAlert('error', 'Could Not Send', known ?? 'Could not send your feedback. Please check your connection and try again.');
      return;
    }
    setMessage('');
    setCategory('other');
    showAlert('success', 'Feedback Sent', 'Thank you! Your feedback was sent to the Payton team.');
  }

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
        <Text style={profileStyles.headerTitleCentered}>Send Feedback</Text>
        <View style={profileStyles.backBtnTouchable} />
      </View>

      {/* Mint sheet over the gradient */}
      <View style={profileStyles.sheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[profileStyles.scrollContent, { paddingBottom: theme.space[40] }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={profileStyles.modernCardGroup}>
              <Text style={profileStyles.groupContextLabel}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[8], marginBottom: theme.space[24] }}>
                {CATEGORIES.map((c) => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      style={[monitoringStyles.filterChip, active && monitoringStyles.filterChipActive]}
                      onPress={() => setCategory(c.value)}
                      disabled={sending}
                    >
                      <Text style={[monitoringStyles.filterChipText, active && monitoringStyles.filterChipTextActive]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={profileStyles.groupContextLabel}>Your message</Text>
              <TextInput
                style={[incomeStyles.modalInput, { height: 160, paddingTop: theme.space[14], textAlignVertical: 'top' }]}
                placeholder="Tell us what happened or what you would like to see..."
                placeholderTextColor={theme.colors.textSubtle}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={MAX_LENGTH}
                textAlignVertical="top"
                editable={!sending}
              />
              <Text style={[incomeStyles.dateText, { alignSelf: 'flex-end', marginTop: theme.space[6] }]}>
                {trimmed.length}/{MAX_LENGTH}
              </Text>
              <Text style={[incomeStyles.toggleSubtext, { marginTop: theme.space[8], lineHeight: 18 }]}>
                Please do not include passwords, card numbers, or account balances. Only the Payton admin team can read this.
              </Text>

              <TouchableOpacity
                style={[resetPasswordStyles.primaryButton, !canSend && incomeStyles.buttonDisabled]}
                onPress={handleSend}
                disabled={!canSend}
              >
                {sending ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="send" size={16} color={theme.colors.white} style={{ marginRight: theme.space[8] }} />
                    <Text style={resetPasswordStyles.buttonText}>Send feedback</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Shared Payton alert (validation, errors, success) */}
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